import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

const lineNumbersSchema = z.array(z.int());
const pathsSchema = z.array(z.string());
const renamesSchema = z.record(z.string(), z.string());
const patchesSchema = z.record(z.string(), z.string());

export const githubCollections = {
  pullRequests: new Collection({
    schema: z.object({
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      number: z.int().default(() => faker.number.int({ min: 1, max: 9999 })),
      title: z.string().default(() => faker.git.commitMessage()),
      body: z.string().nullable().default(null),
      baseRef: z.string().default('main'),
      baseSha: z.string().default(buildSha),
      headSha: z.string().default(buildSha),
      authorLogin: z.string().default(() => faker.internet.username()),
    }),
  }),

  pullCommits: new Collection({
    schema: z.object({
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      number: z.int().default(1),
      sha: z.string().default(buildSha),
      files: pathsSchema.default(buildNoPaths),

      renames: renamesSchema.default(buildNoRenames),

      patches: patchesSchema.default(buildNoPatches),

      // GitHub still serves a commit that a rebase rewrote by its sha, but lists it among no pull
      // request's commits.
      isOnBranch: z.boolean().default(true),

      // GitHub's commit list of a pull request leaves out a base commit that a merge brought in.
      isFromBase: z.boolean().default(false),
    }),
  }),

  // GitHub gives no patch for some files, such as a binary one.
  pullFiles: new Collection({
    schema: z.object({
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      number: z.int().default(1),
      path: z.string().default(buildFilePath),
      lines: lineNumbersSchema.default(buildFirstLine),
      status: z
        .enum(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'])
        .default('modified'),
      previousPath: z.string().nullable().default(null),
      patch: z.string().nullable().default(null),
      blobSha: z.string().default(buildSha),
    }),
  }),

  reviews: new Collection({
    schema: z.object({
      id: z.int().default(() => faker.number.int({ min: 1, max: 2 ** 31 })),
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      number: z.int().default(1),
      commitID: z.string().default(buildSha),
      event: z.string().default('COMMENT'),
      body: z.string().default(''),
    }),
  }),

  reviewComments: new Collection({
    schema: z.object({
      id: z.int().default(() => faker.number.int({ min: 1, max: 2 ** 31 })),
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      number: z.int().default(1),
      path: z.string().default('src/index.ts'),
      line: z.int().default(1),
      startLine: z.int().nullable().default(null),

      // GitHub keeps a comment's lines at the commit it was posted on when a later push moves it.
      originalLine: z.int().nullable().default(null),
      originalStartLine: z.int().nullable().default(null),
      body: z.string().default(() => faker.lorem.sentence()),
      authorLogin: z.string().default(() => faker.internet.username()),
      authorType: z.enum(['User', 'Bot']).default('User'),
      inReplyToID: z.int().nullable().default(null),
      commitID: z.string().default(buildSha),
      createdAt: z.iso.datetime().default(() => faker.date.recent().toISOString()),
    }),
  }),

  issueComments: new Collection({
    schema: z.object({
      id: z.int().default(() => faker.number.int({ min: 1, max: 2 ** 31 })),
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      number: z.int().default(1),
      body: z.string().default(() => faker.lorem.sentence()),
      authorLogin: z.string().default(() => faker.internet.username()),
      authorType: z.enum(['User', 'Bot']).default('User'),
      createdAt: z.iso.datetime().default(() => faker.date.recent().toISOString()),
    }),
  }),

  issues: new Collection({
    schema: z.object({
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      number: z.int().default(() => faker.number.int({ min: 1, max: 9999 })),
      title: z.string().default(() => faker.lorem.sentence()),
      body: z.string().default(''),
      authorLogin: z.string().default(() => faker.internet.username()),
    }),
  }),

  collaborators: new Collection({
    schema: z.object({
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      login: z.string().default(() => faker.internet.username()),
      permission: z.enum(['admin', 'write', 'read']).default('write'),
    }),
  }),

  checkRuns: new Collection({
    schema: z.object({
      id: z.int().default(() => faker.number.int({ min: 1, max: 2 ** 31 })),
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      name: z.string().default('noslop'),
      headSha: z.string().default(buildSha),
      status: z.string().default('completed'),
      conclusion: z.string().nullable().default('success'),
      title: z.string().default(''),
      summary: z.string().default(''),
      text: z.string().default(''),
    }),
  }),

  branches: new Collection({
    schema: z.object({
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      name: z.string().default('main'),
      sha: z.string().default(buildSha),
    }),
  }),

  files: new Collection({
    schema: z.object({
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      ref: z.string().default('main'),
      path: z.string().default('review.json'),
      content: z.string().default('{}'),
    }),
  }),
};

function buildSha(): string {
  return faker.git.commitSha();
}

function buildNoPaths(): string[] {
  return [];
}

function buildNoRenames(): Record<string, string> {
  return {};
}

function buildNoPatches(): Record<string, string> {
  return {};
}

function buildFilePath(): string {
  return faker.system.filePath().slice(1);
}

function buildFirstLine(): number[] {
  return [1];
}
