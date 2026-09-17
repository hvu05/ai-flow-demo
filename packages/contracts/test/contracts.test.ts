import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AgentRunSchema, ApprovalSchema, HandoffSchema, ProjectSchema, RelativePathSchema, TaskSchema, TaskStatusSchema, RunStatusSchema, OutcomeSchema, type Handoff } from '../src/index.js';
function fixture(name: string): unknown { return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')); }
const record = { schemaVersion: 1, id: 'item_1', revision: 0, createdAt: '2026-09-16T00:00:00.000Z', updatedAt: '2026-09-16T00:00:00.000Z' };
describe('versioned contracts', () => {
  it.each(['docs', 'code', 'report'])('accepts %s handoff fixture', (name) => { expect(HandoffSchema.safeParse(fixture(name)).success).toBe(true); });
  it('rejects a documents result from a code role with field paths', () => {
    const result = HandoffSchema.safeParse(fixture('invalid-role'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === 'result')).toBe(true);
  });
  it.each(['completed', 'needs_input', 'blocked', 'failed', 'cancelled', 'interrupted'])('represents %s outcome', (status) => expect(OutcomeSchema.safeParse(status).success).toBe(true));
  it('separates process success from task completion', () => {
    expect(RunStatusSchema.safeParse('succeeded').success).toBe(true);
    expect(TaskStatusSchema.safeParse('succeeded').success).toBe(false);
    expect(RunStatusSchema.safeParse('completed').success).toBe(false);
  });
  it('requires ID, valid enum, UTC timestamps and known version', () => {
    const valid = { ...record, name: 'Demo', idea: 'Idea', workspace: '/workspace/demo', status: 'draft' };
    expect(ProjectSchema.safeParse(valid).success).toBe(true);
    for (const invalid of [{ ...valid, id: undefined }, { ...valid, schemaVersion: 2 }, { ...valid, status: 'oops' }, { ...valid, updatedAt: '2026-09-16T07:00:00+07:00' }]) expect(ProjectSchema.safeParse(invalid).success).toBe(false);
  });
  it('pins approval to bundle hash and version', () => {
    expect(ApprovalSchema.safeParse({ ...record, projectId: 'project_demo', bundle: { id: 'bundle', version: 1 }, decision: 'approved', decidedAt: record.createdAt, comment: '' }).success).toBe(false);
  });
  it('rejects self dependency', () => {
    expect(TaskSchema.safeParse({ ...record, projectId: 'project_demo', title: 'task', role: 'frontend', status: 'pending', dependencies: ['item_1'], acceptanceIds: [], allowedPaths: [], inputArtifacts: [] }).success).toBe(false);
  });
  it.each(['../outside', '/absolute', 'a/../b', 'a\\b', 'a//b', 'C:/test', 'a\0b'])('rejects unsafe path %s', (path) => expect(RelativePathSchema.safeParse(path).success).toBe(false));
  it('requires a completed role result and questions for needs_input', () => {
    const value = HandoffSchema.parse(fixture('docs'));
    expect(HandoffSchema.safeParse({ ...value, result: undefined }).success).toBe(false);
    expect(HandoffSchema.safeParse({ ...value, outcome: 'needs_input', result: undefined }).success).toBe(false);
    expect(HandoffSchema.safeParse({ ...value, outcome: 'needs_input', result: undefined, questions: [{ id: 'q1', text: 'Scope?', required: true }] }).success).toBe(true);
  });
  it('does not allow PASS when a criterion was blocked', () => {
    const value = HandoffSchema.parse(fixture('report')) as Extract<Handoff, { role: 'tester' }>;
    value.result!.criteria[0]!.status = 'BLOCKED';
    expect(HandoffSchema.safeParse(value).success).toBe(false);
  });
  it('represents interrupted run without completed validation', () => {
    expect(AgentRunSchema.safeParse({ ...record, projectId: 'project_demo', taskId: 'task_1', role: 'backend', attempt: 1, workspace: '/workspace', status: 'interrupted', inputArtifacts: [], exitCode: null, logPath: 'logs/run_1.log', validation: 'pending' }).success).toBe(true);
  });
});
