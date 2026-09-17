import { z } from 'zod';
import { IdSchema, HashSchema, RelativePathSchema } from './primitives.js';
import { ProjectSchema, WorkflowSchema, TaskSchema, AgentRunSchema, ArtifactSchema, ApprovalSchema } from './entities.js';
export const DEMO_ROLES = ['requirements', 'docs_reviewer', 'api_contract', 'planner', 'frontend'] as const;
export const DemoRoleSchema = z.enum(DEMO_ROLES);
export type DemoRole = z.infer<typeof DemoRoleSchema>;
export const DemoOutputSchema = z.strictObject({
  role: DemoRoleSchema,
  outcome: z.enum(['completed', 'blocked', 'needs_input']),
  summary: z.string().min(1).max(4000),
  reviewVerdict: z.enum(['PASS', 'CHANGES_REQUESTED']).nullable(),
  files: z.array(z.strictObject({ path: RelativePathSchema, content: z.string().min(1).max(150000) })).max(10),
});
export type DemoOutput = z.infer<typeof DemoOutputSchema>;
export const StartDemoSchema = z.strictObject({ idea: z.string().trim().min(10).max(8000), requestId: IdSchema });
export const ApproveDemoSchema = z.strictObject({ bundleHash: HashSchema });
export const PreflightSchema = z.strictObject({ ready: z.boolean(), version: z.string().nullable(), authenticated: z.boolean(), message: z.string() });
export type Preflight = z.infer<typeof PreflightSchema>;
export const DemoSnapshotSchema = z.strictObject({
  project: ProjectSchema, workflow: WorkflowSchema,
  tasks: z.array(TaskSchema), runs: z.array(AgentRunSchema), artifacts: z.array(ArtifactSchema), approvals: z.array(ApprovalSchema),
  roles: z.array(DemoRoleSchema), bundleHash: HashSchema.nullable(),
  allowedActions: z.array(z.enum(['approve', 'cancel'])), mode: z.literal('live'),
});
export type DemoSnapshot = z.infer<typeof DemoSnapshotSchema>;
