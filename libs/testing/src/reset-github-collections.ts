import { githubCollections } from './github-collections';

// empties every collection of the stand-in GitHub API, so each test starts from no records
export function resetGitHubCollections(): void {
  for (const collection of Object.values(githubCollections)) {
    collection.clear();
  }
}
