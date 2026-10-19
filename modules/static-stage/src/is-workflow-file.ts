// GitHub Actions runs only the workflow files directly in the repo's workflow folder
export function isWorkflowFile(path: string): boolean {
  return /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path);
}
