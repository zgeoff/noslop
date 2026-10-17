import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

const lineNumbersSchema = z.array(z.int());
const pathsSchema = z.array(z.string());

// the state of the stand-in GitHub API: each collection holds one kind of record the API serves, and
// a test seeds the records its case needs
export const githubCollections = {
  pullRequests: new Collection({
    schema: z.object({
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      number: z.int().default(() => faker.number.int({ min: 1, max: 9999 })),
      title: z.string().default(() => faker.git.commitMessage()),
      body: z.string().nullable().default(null),
      baseSha: z.string().default(buildSha),
      headSha: z.string().default(buildSha),
      authorLogin: z.string().default(() => faker.internet.username()),
    }),
  }),

  // the commits of a pull request, oldest first, with the files each one changes
  pullCommits: new Collection({
    schema: z.object({
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      number: z.int().default(1),
      sha: z.string().default(buildSha),
      files: pathsSchema.default(buildNoPaths),
    }),
  }),

  // the lines of a pull request's diff that take a review comment, on the head side
  pullFiles: new Collection({
    schema: z.object({
      owner: z.string().default('example'),
      repo: z.string().default('app'),
      number: z.int().default(1),
      path: z.string().default(buildFilePath),
      lines: lineNumbersSchema.default(buildFirstLine),
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
    }),
  }),

  // a user's permission on a repo; a user with no record is not a collaborator
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

  // a file in a repo at a ref, for the contents endpoint
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

function buildFilePath(): string {
  return faker.system.filePath().slice(1);
}

function buildFirstLine(): number[] {
  return [1];
}

function buildNoPaths(): string[] {
  return [];
}
