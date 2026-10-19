// the HTTP status of a failed GitHub request, or the error itself when it carries none
export function formatStatus(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? `HTTP ${error.status}`
    : String(error);
}
