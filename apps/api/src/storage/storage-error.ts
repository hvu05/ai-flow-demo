export type StorageErrorCode = 'INVALID_DATA' | 'INVALID_PATH' | 'NOT_FOUND' | 'REVISION_CONFLICT' | 'CORRUPT_DATA' | 'RECOVERY_BLOCKED' | 'IO_ERROR';
export class StorageError extends Error {
  constructor(public readonly code: StorageErrorCode, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}
export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
