import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isMissing, StorageError } from './storage-error.js';

// All paths come from validated identifiers, never from client-provided file paths.
export async function ensureDirectory(path: string): Promise<void> {
  const absolute = resolve(path);
  let cursor = parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    try { await mkdir(cursor, { mode: 0o700 }); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
    const stat = await lstat(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new StorageError('INVALID_PATH', 'Storage directory must not be a symlink or file');
  }
}
export async function assertSafePath(path: string): Promise<boolean> {
  const absolute = resolve(path);
  let cursor = parse(absolute).root;
  const parts = absolute.slice(cursor.length).split(sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    cursor = join(cursor, parts[i]!);
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory())) throw new StorageError('INVALID_PATH', 'Symlinks and non-directory ancestors are forbidden');
      if (i === parts.length - 1 && (!stat.isFile() || stat.nlink !== 1)) throw new StorageError('INVALID_PATH', 'Expected a regular, unlinked storage file');
    } catch (error) { if (isMissing(error)) return false; throw error; }
  }
  return true;
}
export async function readJson(path: string): Promise<unknown | undefined> {
  if (!await assertSafePath(path)) return undefined;
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let text: string;
  try { text = await handle.readFile('utf8'); } finally { await handle.close(); }
  try { return JSON.parse(text); }
  catch { throw new StorageError('CORRUPT_DATA', 'Invalid JSON; original file preserved', { path }); }
}
export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function atomicWrite(path: string, value: unknown): Promise<void> {
  await ensureDirectory(dirname(path));
  await assertSafePath(path);
  const temporary = join(dirname(path), `.write-${randomUUID()}.tmp`);
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally { await handle.close(); }
  try {
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } finally { await unlink(temporary).catch((error: unknown) => { if (!isMissing(error)) throw error; }); }
}
export async function removeFile(path: string): Promise<void> {
  if (!await assertSafePath(path)) return;
  await unlink(path);
  await syncDirectory(dirname(path));
}
