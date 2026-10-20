// what a library entry that calls GitHub reads: the environment that holds the App's keys, or a
// GH_TOKEN or GITHUB_TOKEN for a read, so the caller passes its own secrets and the entry reads
// nothing from the process
export interface AppOptions {
  env: Readonly<Record<string, string | undefined>>;
}
