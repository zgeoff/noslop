// Signal 0 checks only that a process exists: ESRCH means it is gone, and any other error, such as
// EPERM for another user's process, means it still runs.
export function isProcessGone(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH';
}
