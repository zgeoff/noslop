// GitHub asks for at least one second between writes, so the first wait never goes under it
const SERVER_ERROR_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

// GitHub asks a client over a secondary limit to wait the retry-after seconds, or a minute when it
// sends none, and to wait longer on each refusal that follows
const RATE_LIMIT_RETRY_DELAYS_MS: readonly number[] = [60_000, 120_000, 240_000];

export type Sleep = (delayMs: number) => Promise<unknown>;

// GitHub can save a write and still answer it with a server error, so a write that creates a comment
// or an issue is sent again only after a rate limit, which saves nothing
export type WriteKind = 'repeatable' | 'once';

export async function withWriteRetry(
  write: string,
  kind: WriteKind,
  sleep: Sleep,
  send: () => Promise<unknown>,
): Promise<void> {
  let serverFailures = 0;
  let limitFailures = 0;

  for (;;) {
    try {
      await send();

      return;
    } catch (error) {
      const refusal = findRetryableRefusal(error);

      if (refusal === null || (kind === 'once' && !refusal.isRateLimit)) {
        throw error;
      }

      const failures = refusal.isRateLimit ? limitFailures : serverFailures;

      const delays = refusal.isRateLimit
        ? RATE_LIMIT_RETRY_DELAYS_MS
        : SERVER_ERROR_RETRY_DELAYS_MS;

      const delayMs = delays[failures];

      if (refusal.isRateLimit) {
        limitFailures += 1;
      } else {
        serverFailures += 1;
      }

      if (delayMs === undefined) {
        throw new Error(
          `GitHub answered the ${write} with ${refusal.answer} on all ${failures + 1} attempts`,
          { cause: error },
        );
      }

      await sleep(refusal.retryAfterMs ?? delayMs);
    }
  }
}

interface RetryableRefusal {
  answer: string;
  isRateLimit: boolean;
  retryAfterMs: number | null;
}

// a spent primary limit lasts until its reset, which can be an hour away, so a write waits for a
// reset only as long as it waits out a secondary limit
const PRIMARY_LIMIT_MAX_WAIT_MS = 240_000;

// Octokit reports a request that never got an answer, such as a dropped connection, as status 500
function findRetryableRefusal(error: unknown): RetryableRefusal | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }

  const status = error.status;

  if (typeof status !== 'number') {
    return null;
  }

  if (status >= 500) {
    return { answer: String(status), isRateLimit: false, retryAfterMs: null };
  }

  if (status !== 403 && status !== 429) {
    return null;
  }

  const headers = findHeaders(error);
  const retryAfter = Number(headers['retry-after'] ?? Number.NaN);
  const message = error instanceof Error ? error.message : '';

  if (Number.isFinite(retryAfter)) {
    return { answer: `${status} (rate limit)`, isRateLimit: true, retryAfterMs: retryAfter * 1000 };
  }

  if (headers['x-ratelimit-remaining'] === '0') {
    const resetMs = findPrimaryResetMs(headers);

    return resetMs === null || resetMs > PRIMARY_LIMIT_MAX_WAIT_MS
      ? null
      : { answer: `${status} (rate limit)`, isRateLimit: true, retryAfterMs: resetMs };
  }

  return /rate limit/iu.test(message)
    ? { answer: `${status} (rate limit)`, isRateLimit: true, retryAfterMs: null }
    : null;
}

function findHeaders(error: object): Record<string, unknown> {
  if (!('response' in error) || typeof error.response !== 'object' || error.response === null) {
    return {};
  }

  const response = error.response;

  return 'headers' in response && typeof response.headers === 'object' && response.headers !== null
    ? { ...response.headers }
    : {};
}

// the answer's date and the reset come from GitHub's clock, so the wait needs no local clock; both
// count whole seconds, so the wait adds one
function findPrimaryResetMs(headers: Record<string, unknown>): number | null {
  const resetMs = Number(headers['x-ratelimit-reset'] ?? Number.NaN) * 1000;
  const dateMs = typeof headers['date'] === 'string' ? Date.parse(headers['date']) : Number.NaN;

  return Number.isFinite(resetMs) && Number.isFinite(dateMs)
    ? Math.max(resetMs - dateMs, 0) + 1000
    : null;
}
