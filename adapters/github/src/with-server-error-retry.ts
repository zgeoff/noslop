// GitHub asks for at least one second between writes, so the first wait never goes under it; a 403 or
// 429 of its secondary limits needs a wait of a minute or more, and is never retried here
const SERVER_ERROR_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

export type Sleep = (delayMs: number) => Promise<unknown>;

export async function withServerErrorRetry(
  write: string,
  sleep: Sleep,
  send: () => Promise<unknown>,
): Promise<void> {
  let failures = 0;

  for (;;) {
    try {
      await send();

      return;
    } catch (error) {
      const status = findServerErrorStatus(error);

      if (status === null) {
        throw error;
      }

      const delayMs = SERVER_ERROR_RETRY_DELAYS_MS[failures];

      failures += 1;

      if (delayMs === undefined) {
        throw new Error(`GitHub answered the ${write} with ${status} on all ${failures} attempts`, {
          cause: error,
        });
      }

      await sleep(delayMs);
    }
  }
}

// Octokit reports a request that never got an answer, such as a dropped connection, as status 500
function findServerErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }

  return typeof error.status === 'number' && error.status >= 500 ? error.status : null;
}
