import { readdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { entitySchemas, IdSchema, type Entity, type EntityKind, type EntityMap, type Project } from '@ai-flow/contracts';
import type { Mutation, ProjectRepository } from './project-repository.js';
import { atomicWrite, ensureDirectory, readJson, removeFile, syncDirectory } from './safe-files.js';
import { StorageError } from './storage-error.js';

const folders: Record<EntityKind, string> = {
  project: '', workflow: '', task: 'tasks', run: 'runs', artifact: 'artifacts', approval: 'approvals', finding: 'findings', event: 'events',
};
const KindSchema = z.enum(['project', 'workflow', 'task', 'run', 'artifact', 'approval', 'finding', 'event']);
const MutationSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('put'), kind: KindSchema, id: IdSchema, expectedRevision: z.number().int().nonnegative().nullable(), value: z.unknown() }),
  z.strictObject({ action: z.literal('delete'), kind: KindSchema, id: IdSchema, expectedRevision: z.number().int().nonnegative() }),
]);
const JournalSchema = z.strictObject({
  schemaVersion: z.literal(1), projectId: IdSchema, transactionId: z.uuid(),
  operations: z.array(z.strictObject({ kind: KindSchema, id: IdSchema, before: z.unknown(), after: z.unknown() })).min(1),
});
type Operation = { kind: EntityKind; id: string; before: Entity | null; after: Entity | null };
// Shared across instances in this process. A second OS writer is unsupported.
const locks = new Map<string, Promise<void>>();
export class JsonProjectRepository implements ProjectRepository {
  readonly root: string;
  constructor(dataRoot: string) { this.root = resolve(dataRoot); }
  private validateId(id: string) {
    if (!IdSchema.safeParse(id).success) throw new StorageError('INVALID_PATH', 'Invalid project/entity identifier');
  }
  private projectDir(projectId: string) { this.validateId(projectId); return join(this.root, 'projects', projectId); }
  private file(projectId: string, kind: EntityKind, id: string): string {
    this.validateId(id);
    if (!KindSchema.safeParse(kind).success) throw new StorageError('INVALID_DATA', 'Unknown entity kind');
    const dir = this.projectDir(projectId);
    if (kind === 'project') {
      if (id !== projectId) throw new StorageError('INVALID_DATA', 'Project ID does not match storage scope');
      return join(dir, 'project.json');
    }
    if (kind === 'workflow') return join(dir, 'workflow.json');
    return join(dir, folders[kind], `${id}.json`);
  }
  private parseEntity(projectId: string, kind: EntityKind, id: string, value: unknown, code: 'INVALID_DATA' | 'CORRUPT_DATA'): Entity {
    const parsed = entitySchemas[kind].safeParse(value);
    if (!parsed.success) throw new StorageError(code, 'Entity schema validation failed; data preserved', parsed.error.issues.map(({ path, code, message }) => ({ path, code, message })));
    const entity = parsed.data;
    if (entity.id !== id || (kind === 'project' ? entity.id !== projectId : !('projectId' in entity) || entity.projectId !== projectId)) throw new StorageError(code, 'Entity belongs to a different project or ID');
    return entity;
  }
  private async locked<T>(projectId: string, callback: () => Promise<T>): Promise<T> {
    const key = this.projectDir(projectId);
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((done) => { release = done; });
    locks.set(key, current);
    await previous;
    try { return await callback(); }
    finally { release(); if (locks.get(key) === current) locks.delete(key); }
  }
  async initialize(): Promise<void> {
    await ensureDirectory(join(this.root, 'projects'));
    const entries = await readdir(join(this.root, 'projects'), { withFileTypes: true });
    for (const entry of entries) {
      if (!IdSchema.safeParse(entry.name).success || !entry.isDirectory()) throw new StorageError('INVALID_PATH', 'Unexpected entry in projects directory');
      await this.locked(entry.name, async () => { await this.recover(entry.name); });
    }
  }
  private async read(projectId: string, kind: EntityKind, id: string): Promise<Entity | null> {
    const value = await readJson(this.file(projectId, kind, id));
    return value === undefined ? null : this.parseEntity(projectId, kind, id, value, 'CORRUPT_DATA');
  }
  private async recover(projectId: string): Promise<void> {
    const journalPath = join(this.projectDir(projectId), '.journal.json');
    const raw = await readJson(journalPath);
    if (raw === undefined) return;
    const parsed = JournalSchema.safeParse(raw);
    if (!parsed.success || parsed.data.projectId !== projectId) throw new StorageError('RECOVERY_BLOCKED', 'Invalid journal; original journal preserved');
    const seen = new Set<string>();
    const operations: Operation[] = parsed.data.operations.map((operation) => {
      const key = this.file(projectId, operation.kind, operation.id);
      if (seen.has(key)) throw new StorageError('RECOVERY_BLOCKED', 'Duplicate journal target');
      seen.add(key);
      const before = operation.before === null ? null : this.parseEntity(projectId, operation.kind, operation.id, operation.before, 'CORRUPT_DATA');
      const after = operation.after === null ? null : this.parseEntity(projectId, operation.kind, operation.id, operation.after, 'CORRUPT_DATA');
      this.validateChange(operation.kind, before, after);
      return { ...operation, before, after };
    });
    const hasProject = operations.some((operation) => operation.kind === 'project' && operation.after !== null)
      || await this.read(projectId, 'project', projectId) !== null;
    if (!hasProject) throw new StorageError('RECOVERY_BLOCKED', 'Journal has no owning project');
    // Verify every target before replaying any target; never overwrite unrelated edits.
    for (const operation of operations) {
      const current = await this.read(projectId, operation.kind, operation.id);
      if (!isDeepStrictEqual(current, operation.before) && !isDeepStrictEqual(current, operation.after)) throw new StorageError('RECOVERY_BLOCKED', 'Journal target diverged; manual recovery required');
    }
    for (const operation of operations) {
      const path = this.file(projectId, operation.kind, operation.id);
      if (operation.after === null) await removeFile(path);
      else await atomicWrite(path, operation.after);
    }
    await removeFile(journalPath);
  }
  private validateChange(kind: EntityKind, before: Entity | null, after: Entity | null): void {
    if (!before && !after) throw new StorageError('INVALID_DATA', 'Empty mutation');
    if (kind === 'project' && after === null) throw new StorageError('INVALID_DATA', 'Use deleteProject to remove a whole project');
    if (after && after.revision !== (before ? before.revision + 1 : 0)) throw new StorageError('REVISION_CONFLICT', 'New entities start at revision 0; updates increment by 1');
    if (after && (Date.parse(after.updatedAt) < Date.parse(after.createdAt) || (before && (after.createdAt !== before.createdAt || Date.parse(after.updatedAt) < Date.parse(before.updatedAt))))) throw new StorageError('INVALID_DATA', 'Entity timestamps are inconsistent');
  }
  async transaction(projectId: string, mutations: Mutation[]): Promise<void> {
    await this.locked(projectId, async () => {
      await this.recover(projectId);
      if (!mutations.length) throw new StorageError('INVALID_DATA', 'Transaction must contain at least one mutation');
      const seen = new Set<string>();
      const operations: Operation[] = [];
      for (const raw of mutations) {
        const parsed = MutationSchema.safeParse(raw);
        if (!parsed.success) throw new StorageError('INVALID_DATA', 'Invalid mutation envelope', parsed.error.issues);
        const mutation = parsed.data;
        const path = this.file(projectId, mutation.kind, mutation.id);
        if (seen.has(path)) throw new StorageError('INVALID_DATA', 'Duplicate transaction target');
        seen.add(path);
        const before = await this.read(projectId, mutation.kind, mutation.id);
        if ((before?.revision ?? null) !== mutation.expectedRevision) throw new StorageError('REVISION_CONFLICT', 'Entity changed; reload before writing');
        const after = mutation.action === 'delete' ? null : this.parseEntity(projectId, mutation.kind, mutation.id, mutation.value, 'INVALID_DATA');
        this.validateChange(mutation.kind, before, after);
        operations.push({ kind: mutation.kind, id: mutation.id, before, after });
      }
      const creatingProject = operations.some((op) => op.kind === 'project' && op.before === null && op.after !== null);
      if (!creatingProject && !await this.read(projectId, 'project', projectId)) throw new StorageError('NOT_FOUND', 'Project does not exist');
      await ensureDirectory(this.projectDir(projectId));
      for (const directory of ['tasks', 'runs', 'approvals', 'artifacts', 'findings', 'events', 'logs']) await ensureDirectory(join(this.projectDir(projectId), directory));
      // Durable intent precedes all entity writes. Recovery is idempotent roll-forward.
      await atomicWrite(join(this.projectDir(projectId), '.journal.json'), { schemaVersion: 1, projectId, transactionId: randomUUID(), operations });
      await this.recover(projectId);
    });
  }
  async get<K extends EntityKind>(projectId: string, kind: K, id: string): Promise<EntityMap[K] | null> {
    return this.locked(projectId, async () => {
      await this.recover(projectId);
      return await this.read(projectId, kind, id) as EntityMap[K] | null;
    });
  }
  async list<K extends EntityKind>(projectId: string, kind: K): Promise<EntityMap[K][]> {
    return this.locked(projectId, async () => {
      await this.recover(projectId);
      if (!await this.read(projectId, 'project', projectId)) throw new StorageError('NOT_FOUND', 'Project does not exist');
      if (kind === 'project') return [await this.read(projectId, 'project', projectId) as EntityMap[K]];
      if (kind === 'workflow') {
        const value = await readJson(join(this.projectDir(projectId), 'workflow.json'));
        if (value === undefined) return [];
        const parsed = entitySchemas.workflow.safeParse(value);
        if (!parsed.success) throw new StorageError('CORRUPT_DATA', 'Invalid workflow');
        return [this.parseEntity(projectId, 'workflow', parsed.data.id, value, 'CORRUPT_DATA') as EntityMap[K]];
      }
      if (!KindSchema.safeParse(kind).success) throw new StorageError('INVALID_DATA', 'Unknown entity kind');
      const directory = join(this.projectDir(projectId), folders[kind]);
      await ensureDirectory(directory);
      const result: EntityMap[K][] = [];
      for (const name of (await readdir(directory)).sort()) {
        if (/^\.write-[a-f0-9-]+\.tmp$/.test(name)) continue;
        if (!name.endsWith('.json')) throw new StorageError('CORRUPT_DATA', 'Unexpected entity file');
        const value = await this.read(projectId, kind, name.slice(0, -5));
        if (value) result.push(value as EntityMap[K]);
      }
      return result;
    });
  }
  async listProjects(): Promise<Project[]> {
    await this.initialize();
    const projects: Project[] = [];
    for (const name of (await readdir(join(this.root, 'projects'))).sort()) {
      const value = await this.get(name, 'project', name);
      if (value) projects.push(value);
    }
    return projects;
  }
  async deleteProject(projectId: string, expectedRevision: number): Promise<void> {
    await this.locked(projectId, async () => {
      await this.recover(projectId);
      const current = await this.read(projectId, 'project', projectId);
      if (!current) throw new StorageError('NOT_FOUND', 'Project does not exist');
      if (current.revision !== expectedRevision) throw new StorageError('REVISION_CONFLICT', 'Project changed; reload before deletion');
      await ensureDirectory(join(this.root, '.trash'));
      // Atomic logical deletion preserves files for operator recovery instead of rm -rf.
      await rename(this.projectDir(projectId), join(this.root, '.trash', `${projectId}-${randomUUID()}`));
      await syncDirectory(join(this.root, 'projects'));
      await syncDirectory(join(this.root, '.trash'));
    });
  }
}
