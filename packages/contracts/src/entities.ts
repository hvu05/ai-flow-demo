import { z } from 'zod';
import { ArtifactRefSchema, baseFields, BundleRefSchema, HashSchema, IdSchema, RelativePathSchema, RoleSchema, RunStatusSchema, scopedFields, ShaSchema, TaskStatusSchema, TimestampSchema } from './primitives.js';
export const ProjectSchema = z.strictObject({
  ...baseFields, name: z.string().min(1), idea: z.string().min(1), workspace: z.string().min(1),
  repositoryUrl: z.url().optional(), status: z.enum(['draft', 'active', 'paused', 'blocked', 'waiting_review', 'completed', 'cancelled']),
});
export const WorkflowSchema = z.strictObject({
  ...scopedFields, stage: z.enum(['requirements', 'planning', 'docs_review', 'approval', 'scaffold', 'development', 'integration', 'testing', 'fixes', 'publish', 'done']),
  status: z.enum(['idle', 'running', 'waiting_input', 'waiting_approval', 'paused', 'blocked', 'completed', 'cancelled']),
  activeTaskIds: z.array(IdSchema), approvedBundle: BundleRefSchema.optional(), reason: z.string().min(1).optional(),
});
export const TaskSchema = z.strictObject({
  ...scopedFields, title: z.string().min(1), role: RoleSchema, status: TaskStatusSchema,
  dependencies: z.array(IdSchema), acceptanceIds: z.array(IdSchema), allowedPaths: z.array(RelativePathSchema),
  bundle: BundleRefSchema.optional(), inputArtifacts: z.array(ArtifactRefSchema),
}).refine((value) => !value.dependencies.includes(value.id), { path: ['dependencies'], message: 'Task cannot depend on itself' });
export const AgentRunSchema = z.strictObject({
  ...scopedFields, taskId: IdSchema, role: RoleSchema, attempt: z.number().int().positive(), workspace: z.string().min(1),
  status: RunStatusSchema, sessionId: z.string().min(1).optional(), previousRunId: IdSchema.optional(),
  inputArtifacts: z.array(ArtifactRefSchema), bundle: BundleRefSchema.optional(),
  startedAt: TimestampSchema.optional(), endedAt: TimestampSchema.optional(), exitCode: z.number().int().nullable(),
  logPath: RelativePathSchema, outputPath: RelativePathSchema.optional(),
  summary: z.string().optional(), error: z.string().optional(),
  validation: z.enum(['pending', 'passed', 'rejected']),
});
export const ArtifactSchema = z.strictObject({
  ...scopedFields, producerRunId: IdSchema, kind: z.enum(['prd', 'design', 'contract', 'task_plan', 'review', 'code_handoff', 'test_report', 'evidence', 'document_bundle']),
  version: z.number().int().positive(), path: RelativePathSchema, sha256: HashSchema, mediaType: z.string().min(1),
});
export const ApprovalSchema = z.strictObject({
  ...scopedFields, bundle: BundleRefSchema, decision: z.enum(['approved', 'changes_requested']),
  decidedAt: TimestampSchema, comment: z.string(),
});
export const FindingSchema = z.strictObject({
  ...scopedFields, producerRunId: IdSchema, severity: z.enum(['info', 'warning', 'blocking']),
  status: z.enum(['open', 'in_progress', 'resolved']), owner: RoleSchema.nullable(),
  title: z.string().min(1), description: z.string().min(1), location: z.string().min(1),
  evidenceRefs: z.array(ArtifactRefSchema), acceptanceIds: z.array(IdSchema), testedCommit: ShaSchema.optional(),
});
export const EventSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...scopedFields, sequence: z.number().int().positive(), type: z.literal('task_status'), taskId: IdSchema, status: TaskStatusSchema }),
  z.strictObject({ ...scopedFields, sequence: z.number().int().positive(), type: z.literal('run_status'), runId: IdSchema, status: RunStatusSchema }),
  z.strictObject({ ...scopedFields, sequence: z.number().int().positive(), type: z.literal('artifact_created'), artifact: ArtifactRefSchema }),
]);
export const entitySchemas = {
  project: ProjectSchema, workflow: WorkflowSchema, task: TaskSchema, run: AgentRunSchema,
  artifact: ArtifactSchema, approval: ApprovalSchema, finding: FindingSchema, event: EventSchema,
} as const;
export type EntityKind = keyof typeof entitySchemas;
export type EntityMap = { [K in EntityKind]: z.infer<(typeof entitySchemas)[K]> };
export type Entity = EntityMap[EntityKind];
export type Project = z.infer<typeof ProjectSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type WorkflowEvent = z.infer<typeof EventSchema>;
