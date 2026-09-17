import { z } from 'zod';
import { ArtifactRefSchema, BundleRefSchema, IdSchema, OutcomeSchema, QuestionSchema, RelativePathSchema, ShaSchema, TimestampSchema } from './primitives.js';
const outputFields = {
  schemaVersion: z.literal(1), projectId: IdSchema, taskId: IdSchema, runId: IdSchema,
  outcome: OutcomeSchema, summary: z.string().min(1), artifactRefs: z.array(ArtifactRefSchema),
  findingIds: z.array(IdSchema), questions: z.array(QuestionSchema),
  metadata: z.strictObject({ generatedAt: TimestampSchema, checks: z.array(z.strictObject({
    command: z.string().min(1), status: z.enum(['passed', 'failed', 'not_run']), detail: z.string(),
  })) }),
};
const DocumentsSchema = z.strictObject({ documentRefs: z.array(ArtifactRefSchema).min(1) });
const CodeSchema = z.strictObject({ commit: ShaSchema, branch: z.string().min(1), changedPaths: z.array(RelativePathSchema).min(1), contract: BundleRefSchema });
const ReviewSchema = z.strictObject({ verdict: z.enum(['pass', 'changes_requested']), bundle: BundleRefSchema });
const TestSchema = z.strictObject({
  testedCommit: ShaSchema, verdict: z.enum(['PASS', 'FAIL', 'BLOCKED']),
  criteria: z.array(z.strictObject({ acceptanceId: IdSchema, status: z.enum(['PASS', 'FAIL', 'BLOCKED']), expected: z.string().min(1), actual: z.string().min(1), evidenceRefs: z.array(ArtifactRefSchema) })).min(1),
}).superRefine((report, context) => {
  const expected = report.criteria.some((c) => c.status === 'FAIL') ? 'FAIL' : report.criteria.some((c) => c.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
  if (report.verdict !== expected) context.addIssue({ code: 'custom', path: ['verdict'], message: `Expected ${expected} from criterion results` });
  if (new Set(report.criteria.map((c) => c.acceptanceId)).size !== report.criteria.length) context.addIssue({ code: 'custom', path: ['criteria'], message: 'Duplicate acceptance ID' });
});
export const HandoffSchema = z.discriminatedUnion('role', [
  z.strictObject({ ...outputFields, role: z.literal('requirements'), result: DocumentsSchema.optional() }),
  z.strictObject({ ...outputFields, role: z.literal('planner'), result: DocumentsSchema.optional() }),
  z.strictObject({ ...outputFields, role: z.literal('docs_reviewer'), result: ReviewSchema.optional() }),
  z.strictObject({ ...outputFields, role: z.literal('frontend'), result: CodeSchema.optional() }),
  z.strictObject({ ...outputFields, role: z.literal('backend'), result: CodeSchema.optional() }),
  z.strictObject({ ...outputFields, role: z.literal('scaffold'), result: CodeSchema.optional() }),
  z.strictObject({ ...outputFields, role: z.literal('integrator'), result: CodeSchema.optional() }),
  z.strictObject({ ...outputFields, role: z.literal('tester'), result: TestSchema.optional() }),
]).superRefine((output, context) => {
  if (output.outcome === 'completed' && !output.result) context.addIssue({ code: 'custom', path: ['result'], message: 'Completed handoff requires role-specific result' });
  if (output.outcome === 'needs_input' && !output.questions.length) context.addIssue({ code: 'custom', path: ['questions'], message: 'needs_input requires questions' });
  if (output.outcome === 'completed' && output.questions.some((q) => q.required)) context.addIssue({ code: 'custom', path: ['questions'], message: 'Required questions must be answered before completion' });
});
export type Handoff = z.infer<typeof HandoffSchema>;
