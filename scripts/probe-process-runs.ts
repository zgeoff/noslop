// Signal 0 checks only that the process exists: ESRCH means it is gone, and any other error, such
// as EPERM for another user's process, means it still runs.
export function probeProcessRuns(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH');
  }
}
