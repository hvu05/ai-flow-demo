import type { EntityKind, EntityMap, Project } from '@ai-flow/contracts';
export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');
export type Mutation = {
  kind: EntityKind; id: string; expectedRevision: number | null;
} & ({ action: 'put'; value: unknown } | { action: 'delete' });
export interface ProjectRepository {
  initialize(): Promise<void>;
  listProjects(): Promise<Project[]>;
  get<K extends EntityKind>(projectId: string, kind: K, id: string): Promise<EntityMap[K] | null>;
  list<K extends EntityKind>(projectId: string, kind: K): Promise<EntityMap[K][]>;
  transaction(projectId: string, mutations: Mutation[]): Promise<void>;
  deleteProject(projectId: string, expectedRevision: number): Promise<void>;
}
