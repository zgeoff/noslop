import { githubCollections } from './github-collections';

export function resetGitHubCollections(): void {
  for (const collection of Object.values(githubCollections)) {
    collection.clear();
  }
}
