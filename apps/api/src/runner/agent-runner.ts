import type { DemoRole, DemoOutput } from '@ai-flow/contracts';
export const AGENT_RUNNER = Symbol('AGENT_RUNNER');
export interface RunnerInput {
  projectId: string; runId: string; role: DemoRole; idea: string;
  inputs: { id: string; path: string; sha256: string; producerRunId: string; content: string }[];
  signal: AbortSignal; progress: (message: string) => void;
}
export interface RunnerResult { output: DemoOutput; sessionId?: string; }
export interface AgentRunner { execute(input: RunnerInput): Promise<RunnerResult>; }
export class RunnerError extends Error {
  constructor(public readonly status: 'failed' | 'timed_out' | 'cancelled', message: string) { super(message); }
}
