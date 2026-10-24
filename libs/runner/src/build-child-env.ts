// A git hook sets GIT_DIR and its kin, which point git at one repo whatever folder it runs in.
// The GIT_CONFIG variables stay, because callers pass git settings such as an auth header
// through them.
const GIT_REPO_VARIABLES = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
] as const;

export function buildChildEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const child = { ...env };

  for (const name of GIT_REPO_VARIABLES) {
    delete child[name];
  }

  return child;
}
