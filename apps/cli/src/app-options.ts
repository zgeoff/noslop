// what a library entry that calls GitHub reads: the environment that holds the App's keys,
// NOSLOP_GITHUB_APP_ID, NOSLOP_GITHUB_APP_PRIVATE_KEY and NOSLOP_GITHUB_APP_INSTALLATION_ID, so the
// caller passes its own secrets and the entry reads nothing from the process
export interface AppOptions {
  env: Readonly<Record<string, string | undefined>>;
}
