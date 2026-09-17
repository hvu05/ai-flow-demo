import { z } from 'zod';
export const IdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/, 'Expected a safe identifier');
export const TimestampSchema = z.iso.datetime({ offset: false });
export const ShaSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const RelativePathSchema = z.string().min(1).refine(
  (value) => !/[\\:]/.test(value) && !value.includes('\0') && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
  'Expected a project-relative path without traversal',
);
export const RoleSchema = z.enum(['requirements', 'api_contract', 'planner', 'docs_reviewer', 'frontend', 'backend', 'tester', 'scaffold', 'integrator']);
export const TaskStatusSchema = z.enum(['pending', 'ready', 'running', 'waiting_input', 'waiting_approval', 'blocked', 'completed', 'failed', 'cancelled']);
export const RunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted']);
export const OutcomeSchema = z.enum(['completed', 'needs_input', 'blocked', 'failed', 'cancelled', 'interrupted']);
export const baseFields = {
  schemaVersion: z.literal(1), id: IdSchema, revision: z.number().int().nonnegative(),
  createdAt: TimestampSchema, updatedAt: TimestampSchema,
};
export const scopedFields = { ...baseFields, projectId: IdSchema };
export const BundleRefSchema = z.strictObject({ id: IdSchema, version: z.number().int().positive(), sha256: HashSchema });
export const ArtifactRefSchema = z.strictObject({ id: IdSchema, version: z.number().int().positive(), sha256: HashSchema });
export const QuestionSchema = z.strictObject({ id: IdSchema, text: z.string().min(1), required: z.boolean(), options: z.array(z.string().min(1)).optional() });
