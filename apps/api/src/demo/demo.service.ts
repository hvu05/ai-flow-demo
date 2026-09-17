import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, type OnModuleInit, type OnApplicationShutdown } from '@nestjs/common';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DEMO_ROLES, IdSchema, type DemoRole, type DemoSnapshot, type Artifact, type Entity, type EntityKind, type AgentRun, type Task, type Workflow, type Project } from '@ai-flow/contracts';
import { loadConfig } from '../config.js';
import { PROJECT_REPOSITORY, type ProjectRepository, type Mutation } from '../storage/project-repository.js';
import { assertSafePath, ensureDirectory } from '../storage/safe-files.js';
import { PreflightService } from '../runtime/preflight.service.js';
import { AGENT_RUNNER, type AgentRunner, type RunnerInput, RunnerError } from '../runner/agent-runner.js';
import { buildPrompt, validateOutput } from '../runner/codex.runner.js';
import { FRONTEND_BUILDER, type FrontendBuilder } from './frontend-builder.js';
import { validateContract } from './openapi.js';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const base = (id: string) => ({ schemaVersion: 1 as const, id, revision: 0, createdAt: now(), updatedAt: now() });
const taskId = (role: DemoRole) => `task_${role}`;
const stages: Record<DemoRole, Workflow['stage']> = { requirements: 'requirements', docs_reviewer: 'docs_review', api_contract: 'planning', planner: 'planning', frontend: 'development' };
@Injectable()
export class DemoService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DemoService.name);
  private tail: Promise<unknown> = Promise.resolve();
  private active?: { id: string; controller: AbortController; done: Promise<void> };
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly repository: ProjectRepository,
    @Inject(AGENT_RUNNER) private readonly runner: AgentRunner,
    @Inject(PreflightService) private readonly preflight: PreflightService,
    @Inject(FRONTEND_BUILDER) private readonly builder: FrontendBuilder,
  ) {}
  private serial<T>(callback: () => Promise<T>): Promise<T> {
    const next = this.tail.then(callback, callback); this.tail = next.catch(() => undefined); return next;
  }
  private id(value: string) { if (!IdSchema.safeParse(value).success) throw new BadRequestException('ID không hợp lệ.'); }
  private async persist(id: string, changes: { kind: EntityKind; value: Entity }[]) {
    const mutations: Mutation[] = [];
    for (const { kind, value } of changes) {
      const before = await this.repository.get(id, kind, value.id);
      mutations.push({ action: 'put', kind, id: value.id, expectedRevision: before?.revision ?? null, value: { ...value, revision: before ? before.revision + 1 : 0, updatedAt: now() } });
    }
    await this.repository.transaction(id, mutations);
  }
  private async state(id: string): Promise<DemoSnapshot> {
    this.id(id);
    const project = await this.repository.get(id, 'project', id);
    if (!project) throw new NotFoundException('Không tìm thấy lượt demo.');
    const [workflows, tasks, runs, artifacts, approvals] = await Promise.all([
      this.repository.list(id, 'workflow'), this.repository.list(id, 'task'), this.repository.list(id, 'run'), this.repository.list(id, 'artifact'), this.repository.list(id, 'approval'),
    ]);
    const workflow = workflows[0]; if (!workflow) throw new ConflictException('Workflow chưa sẵn sàng.');
    const bundleHash = workflow.approvedBundle?.sha256 ?? null;
    const allowedActions: DemoSnapshot['allowedActions'] = [];
    if (workflow.status === 'waiting_approval') allowedActions.push('approve');
    if (workflow.status === 'running' || workflow.status === 'waiting_approval') allowedActions.push('cancel');
    return { project, workflow, tasks, runs, artifacts, approvals, roles: [...DEMO_ROLES], bundleHash, allowedActions, mode: 'live' };
  }
  snapshot(id: string) { return this.serial(() => this.state(id)); }
  async latest() { return this.serial(async () => {
    const projects = (await this.repository.listProjects()).filter((p) => p.id.startsWith('demo_')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return projects[0] ? this.state(projects[0].id) : null;
  }); }
  async onModuleInit() {
    for (const project of await this.repository.listProjects()) {
      if (!project.id.startsWith('demo_')) continue;
      const state = await this.state(project.id);
      if (state.workflow.status !== 'running') continue;
      const reason = 'Backend đã khởi động lại; lượt đang chạy bị gián đoạn. Hãy tạo lượt mới.';
      await this.persist(project.id, [
        { kind: 'project', value: { ...project, status: 'blocked' } },
        { kind: 'workflow', value: { ...state.workflow, status: 'blocked', reason, activeTaskIds: [] } },
        ...state.runs.filter((r) => r.status === 'running').map((r) => ({ kind: 'run' as const, value: { ...r, status: 'interrupted' as const, endedAt: now(), error: reason } })),
        ...state.tasks.filter((t) => t.status === 'running').map((t) => ({ kind: 'task' as const, value: { ...t, status: 'blocked' as const } })),
      ]);
    }
  }
  async onApplicationShutdown() { this.active?.controller.abort(); await this.active?.done; }
  async start(idea: string, requestId: string) {
    return this.serial(async () => {
      const id = `demo_${hash(requestId).slice(0, 24)}`;
      const previous = await this.repository.get(id, 'project', id);
      if (previous) { if (previous.idea !== idea) throw new ConflictException('Request ID đã dùng cho yêu cầu khác.'); return this.state(id); }
      const projects = await this.repository.listProjects();
      if (this.active || projects.some((p) => p.status === 'active')) throw new ConflictException('Đang có lượt demo chạy hoặc chờ duyệt.');
      const preflight = await this.preflight.check(); if (!preflight.ready) throw new ServiceUnavailableException(preflight.message);
      const project: Project = { ...base(id), name: idea.slice(0, 70), idea, workspace: join(loadConfig().workspacesRoot, id), status: 'active' };
      const workflow: Workflow = { ...base('workflow'), projectId: id, stage: 'requirements', status: 'running', activeTaskIds: [] };
      const tasks: Task[] = DEMO_ROLES.map((role, index) => ({ ...base(taskId(role)), projectId: id, title: role, role, status: 'pending', dependencies: index ? [taskId(DEMO_ROLES[index - 1]!)] : [], acceptanceIds: [], allowedPaths: [], inputArtifacts: [] }));
      await this.persist(id, [{ kind: 'project', value: project }, { kind: 'workflow', value: workflow }, ...tasks.map((value) => ({ kind: 'task' as const, value }))]);
      this.launch(id, 0); return this.state(id);
    });
  }
  private launch(id: string, index: number) {
    const controller = new AbortController();
    const done = Promise.resolve().then(() => this.chain(id, index, controller.signal)).catch(() => { this.logger.error('Không ghi được trạng thái lượt chạy. Kiểm tra quyền/dung lượng volume và khởi động lại backend để phục hồi.'); }).finally(() => { if (this.active?.id === id) this.active = undefined; });
    this.active = { id, controller, done };
  }
  async approve(id: string, bundleHash: string) {
    return this.serial(async () => {
      const state = await this.state(id);
      if (state.bundleHash !== bundleHash) throw new ConflictException('Bộ tài liệu đã thay đổi. Tải lại trước khi duyệt.');
      if (state.approvals.some((a) => a.bundle.sha256 === bundleHash && a.decision === 'approved')) return state;
      if (state.workflow.status !== 'waiting_approval' || this.active) throw new ConflictException('Lượt chưa sẵn sàng để duyệt.');
      for (const artifact of this.documents(state.artifacts)) await this.readArtifact(id, artifact);
      const approval = { ...base(`approval_${randomUUID()}`), projectId: id, bundle: state.workflow.approvedBundle!, decision: 'approved' as const, decidedAt: now(), comment: 'User approved from demo UI' };
      await this.persist(id, [{ kind: 'approval', value: approval }, { kind: 'workflow', value: { ...state.workflow, status: 'running', stage: 'development' } }]);
      this.launch(id, 4); return this.state(id);
    });
  }
  async cancel(id: string) {
    let done: Promise<void> | undefined;
    await this.serial(async () => {
      const state = await this.state(id);
      if (!state.allowedActions.includes('cancel')) return;
      if (this.active?.id === id) { this.active.controller.abort(); done = this.active.done; }
      await this.persist(id, [
        { kind: 'project', value: { ...state.project, status: 'cancelled' } },
        { kind: 'workflow', value: { ...state.workflow, status: 'cancelled', activeTaskIds: [], reason: 'Đã dừng theo yêu cầu.' } },
        ...state.tasks.filter((t) => t.status === 'running').map((t) => ({ kind: 'task' as const, value: { ...t, status: 'cancelled' as const } })),
        ...state.runs.filter((r) => r.status === 'running').map((r) => ({ kind: 'run' as const, value: { ...r, status: 'cancelled' as const, endedAt: now() } })),
      ]);
    });
    await done; return this.snapshot(id);
  }
  private documents(artifacts: Artifact[]) { return artifacts.filter((a) => ['prd', 'review', 'contract', 'task_plan'].includes(a.kind)).sort((a, b) => a.path.localeCompare(b.path)); }
  private async readArtifact(id: string, artifact: Artifact): Promise<Buffer> {
    if (artifact.projectId !== id) throw new NotFoundException('Artifact không thuộc lượt demo.');
    const path = join(loadConfig().dataRoot, 'projects', id, artifact.path);
    if (!await assertSafePath(path)) throw new NotFoundException('File bàn giao không tồn tại.');
    const bytes = await readFile(path);
    if (hash(bytes) !== artifact.sha256) throw new ConflictException('File bàn giao đã thay đổi sau khi ghi nhận.');
    return bytes;
  }
  async artifact(id: string, artifactId: string) {
    this.id(id); this.id(artifactId);
    const artifact = await this.repository.get(id, 'artifact', artifactId);
    if (!artifact) throw new NotFoundException('Không tìm thấy artifact.');
    const bytes = await this.readArtifact(id, artifact);
    if (artifact.mediaType === 'application/zip') throw new BadRequestException('Dùng đường dẫn tải source ZIP.');
    return { artifact, content: bytes.toString('utf8') };
  }
  async download(id: string) {
    const state = await this.snapshot(id);
    if (state.workflow.status !== 'completed') throw new ConflictException('FE chưa build thành công.');
    const artifact = state.artifacts.find((a) => a.mediaType === 'application/zip');
    if (!artifact) throw new NotFoundException('Chưa có source.');
    return this.readArtifact(id, artifact);
  }
  async logs(id: string, runId: string) {
    this.id(id); this.id(runId);
    const run = await this.repository.get(id, 'run', runId); if (!run) throw new NotFoundException('Run không tồn tại.');
    const path = join(loadConfig().dataRoot, 'projects', id, run.logPath);
    if (!await assertSafePath(path)) return { text: '' };
    return { text: (await readFile(path, 'utf8')).slice(-32000) };
  }
  private async storeArtifact(id: string, runId: string, name: string, bytes: string | Buffer, kind: Artifact['kind'], mediaType: string): Promise<Artifact> {
    const path = `content/${runId}/${name}`;
    const absolute = join(loadConfig().dataRoot, 'projects', id, path);
    await ensureDirectory(dirname(absolute)); await writeFile(absolute, bytes, { flag: 'wx', mode: 0o600 });
    return { ...base(`artifact_${randomUUID()}`), projectId: id, producerRunId: runId, kind, version: 1, path, sha256: hash(bytes), mediaType };
  }
  private async chain(id: string, startIndex: number, signal: AbortSignal) {
    let runningId: string | undefined;
    try {
      for (let index = startIndex; index < DEMO_ROLES.length; index++) {
        const role = DEMO_ROLES[index]!;
        if (signal.aborted) return;
        const prepared = await this.serial(async () => {
          const state = await this.state(id);
          if (state.workflow.status !== 'running') throw new RunnerError('cancelled', 'Lượt đã dừng.');
          if (role === 'frontend' && !state.approvals.some((a) => a.decision === 'approved' && a.bundle.sha256 === state.bundleHash)) throw new ConflictException('Thiếu approval.');
          const sources = this.documents(state.artifacts);
          const inputs = await Promise.all(sources.map(async (a) => ({ id: a.id, path: a.path, sha256: a.sha256, producerRunId: a.producerRunId, content: (await this.readArtifact(id, a)).toString('utf8') })));
          const refs = sources.map(({ id, sha256, version }) => ({ id, sha256, version }));
          const runId = `run_${randomUUID()}`; runningId = runId;
          const run: AgentRun = { ...base(runId), projectId: id, taskId: taskId(role), role, attempt: 1, workspace: join(loadConfig().workspacesRoot, id, runId), status: 'running', inputArtifacts: refs, exitCode: null, startedAt: now(), logPath: `logs/${runId}.log`, validation: 'pending', ...(state.workflow.approvedBundle ? { bundle: state.workflow.approvedBundle } : {}) };
          const task = state.tasks.find((t) => t.id === taskId(role))!;
          await this.persist(id, [{ kind: 'run', value: run }, { kind: 'task', value: { ...task, status: 'running', inputArtifacts: refs } }, { kind: 'workflow', value: { ...state.workflow, stage: stages[role], activeTaskIds: [task.id] } }]);
          return { run, inputs, idea: state.project.idea };
        });
        let logQueue = Promise.resolve(); let lines = 0;
        const progress = (message: string) => { if (lines++ >= 250) return; logQueue = logQueue.then(() => appendFile(join(loadConfig().dataRoot, 'projects', id, prepared.run.logPath), `${now()} ${message}\n`, { mode: 0o600 })); };
        const input: RunnerInput = { projectId: id, runId: prepared.run.id, role, idea: prepared.idea, inputs: prepared.inputs, signal, progress };
        const promptArtifact = await this.storeArtifact(id, prepared.run.id, 'prompt.txt', buildPrompt(input), 'evidence', 'text/plain');
        await this.serial(() => this.persist(id, [{ kind: 'artifact', value: promptArtifact }]));
        let result;
        try { result = await this.runner.execute(input); } finally { await logQueue; }
        if (signal.aborted) return;
        const output = validateOutput(result.output, role);
        if (output.outcome !== 'completed') throw new Error(output.summary);
        if (role === 'api_contract') await validateContract(output.files.find((f) => f.path === 'openapi.json')!.content);
        const artifacts: Artifact[] = [];
        const kind = { requirements: 'prd', docs_reviewer: 'review', api_contract: 'contract', planner: 'task_plan', frontend: 'code_handoff' }[role] as Artifact['kind'];
        for (const file of output.files) artifacts.push(await this.storeArtifact(id, prepared.run.id, file.path, file.content, kind, file.path.endsWith('.json') ? 'application/json' : file.path.endsWith('.md') ? 'text/markdown' : 'text/plain'));
        await this.serial(() => this.persist(id, artifacts.map((value) => ({ kind: 'artifact' as const, value }))));
        let buildResult;
        if (role === 'frontend') {
          progress('Backend đang kiểm tra mock và build FE bằng Next.js.');
          const contract = prepared.inputs.find((i) => i.path.endsWith('/openapi.json'));
          if (!contract) throw new Error('Thiếu API contract.');
          buildResult = await this.builder.build(id, prepared.run.id, output, contract.content, signal);
          artifacts.push(await this.storeArtifact(id, prepared.run.id, 'frontend.zip', buildResult.zip, 'code_handoff', 'application/zip'));
          artifacts.push(await this.storeArtifact(id, prepared.run.id, 'BUILD-REPORT.txt', buildResult.report, 'evidence', 'text/plain'));
          const agentPaths = new Set(output.files.map((f) => f.path));
          for (const file of buildResult.files) if (!agentPaths.has(file.path)) artifacts.push(await this.storeArtifact(id, prepared.run.id, file.path, file.content, 'code_handoff', 'text/plain'));
        }
        await logQueue;
        const reviewBlocked = role === 'docs_reviewer' && output.reviewVerdict !== 'PASS';
        const stop = await this.serial(async () => {
          const state = await this.state(id); if (signal.aborted || state.workflow.status !== 'running') return true;
          const run = state.runs.find((r) => r.id === prepared.run.id)!;
          const task = state.tasks.find((t) => t.id === taskId(role))!;
          const last = index === 4;
          const workflow: Workflow = { ...state.workflow, status: reviewBlocked ? 'blocked' : index === 3 ? 'waiting_approval' : last ? 'completed' : 'running', stage: index === 3 ? 'approval' : last ? 'done' : stages[role], activeTaskIds: [] };
          if (reviewBlocked) workflow.reason = 'Review yêu cầu chỉnh sửa. Đọc review.md và tạo lượt mới với mô tả đã sửa.';
          if (index === 3) workflow.approvedBundle = { id: 'demo_bundle', version: 1, sha256: hash(JSON.stringify(this.documents(state.artifacts).map(({ id, sha256, version }) => ({ id, sha256, version })))) };
          await this.persist(id, [
            { kind: 'run', value: { ...run, status: 'succeeded', validation: 'passed', exitCode: 0, endedAt: now(), summary: output.summary, ...(result.sessionId ? { sessionId: result.sessionId } : {}) } },
            { kind: 'task', value: { ...task, status: reviewBlocked ? 'blocked' : 'completed' } },
            { kind: 'workflow', value: workflow }, { kind: 'project', value: { ...state.project, status: reviewBlocked ? 'blocked' : last ? 'completed' : 'active' } },
            ...artifacts.map((value) => ({ kind: 'artifact' as const, value })),
          ]);
          return reviewBlocked || index === 3;
        });
        if (stop) return;
      }
    } catch (error) {
      await this.serial(async () => {
        const state = await this.state(id); if (state.workflow.status === 'cancelled') return;
        const message = error instanceof Error ? error.message.slice(0, 1500) : 'Lượt chạy thất bại.';
        const run = state.runs.find((r) => r.id === runningId);
        await this.persist(id, [
          { kind: 'project', value: { ...state.project, status: 'blocked' } },
          { kind: 'workflow', value: { ...state.workflow, status: 'blocked', activeTaskIds: [], reason: message } },
          ...(run ? [{ kind: 'run' as const, value: { ...run, status: error instanceof RunnerError ? error.status : 'failed' as const, validation: 'rejected' as const, endedAt: now(), error: message } }] : []),
          ...state.tasks.filter((t) => t.status === 'running').map((t) => ({ kind: 'task' as const, value: { ...t, status: 'failed' as const } })),
        ]);
      });
    }
  }
}
