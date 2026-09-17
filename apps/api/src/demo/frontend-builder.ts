import { Injectable } from '@nestjs/common';
import { readFile, writeFile, copyFile, symlink, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import ts from 'typescript';
import { type DemoOutput } from '@ai-flow/contracts';
import { repositoryRoot, loadConfig } from '../config.js';
import { runProcess } from '../runtime/process.js';
import { ensureDirectory } from '../storage/safe-files.js';
import { validateMocks } from './openapi.js';
export const FRONTEND_BUILDER = Symbol('FRONTEND_BUILDER');
export interface FrontendBuilder { build(projectId: string, runId: string, output: DemoOutput, contract: string, signal: AbortSignal): Promise<{ zip: Buffer; report: string; files: { path: string; content: string }[] }>; }
const fixedFiles = ['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.mjs', 'next-env.d.ts', 'app/layout.tsx'];
export function validateFrontendSource(source: string) {
  if (!/^\s*['"]use client['"];?/.test(source)) throw new Error('FE page phải là client component.');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let hasMocks = false;
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const name = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
      if (!['react', '../mocks.json'].includes(name)) throw new Error('FE chỉ được import react và mocks.json.');
      if (name === '../mocks.json') hasMocks = true;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) throw new Error('Re-export module không được hỗ trợ.');
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && ['require', 'eval', 'Function', 'fetch'].includes(node.expression.text)))) throw new Error('FE demo không dùng dynamic code hoặc network.');
    if (ts.isIdentifier(node) && ['process', 'globalThis', '__dirname', '__filename'].includes(node.text)) throw new Error('FE không được truy cập runtime server.');
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!hasMocks) throw new Error('FE phải dùng mocks.json theo API contract.');
}
@Injectable()
export class NextFrontendBuilder implements FrontendBuilder {
  async build(projectId: string, runId: string, output: DemoOutput, contract: string, signal: AbortSignal) {
    const page = output.files.find((f) => f.path === 'app/page.tsx')!.content;
    validateFrontendSource(page);
    await validateMocks(contract, output.files.find((f) => f.path === 'mocks.json')!.content);
    const directory = join(loadConfig().workspacesRoot, projectId, runId, 'frontend');
    await ensureDirectory(join(directory, 'app'));
    const template = join(repositoryRoot, 'templates/frontend');
    for (const path of fixedFiles) await copyFile(join(template, path), join(directory, path));
    for (const file of output.files) await writeFile(join(directory, file.path), file.content, { mode: 0o600 });
    await symlink(join(template, 'node_modules'), join(directory, 'node_modules'));
    const build = await runProcess(process.execPath, [join(template, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], {
      cwd: directory, signal, timeoutMs: 180000,
      env: { PATH: process.env.PATH, HOME: '/tmp', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    });
    if (build.code !== 0 || build.reason !== 'exited') throw new Error(signal.aborted ? 'Đã hủy build FE.' : 'Build FE thất bại. Xem source và bắt đầu lượt mới; chưa có auto-fix.');
    const exported = await lstat(join(directory, 'out/index.html'));
    if (!exported.isFile()) throw new Error('Build chưa tạo static export.');
    const files = [];
    const zip = new JSZip();
    for (const path of [...fixedFiles, ...output.files.map((f) => f.path)]) {
      const content = await readFile(join(directory, path), 'utf8'); files.push({ path, content }); zip.file(path, content);
    }
    const report = `Build verified by backend: next build --webpack\nRun: ${runId}\nStatic export: out/index.html\nData: mock, no real backend\n`;
    zip.file('BUILD-REPORT.txt', report);
    return { zip: await zip.generateAsync({ type: 'nodebuffer' }), report, files };
  }
}
