import { expect, test } from 'bun:test';
import { isBaseBranchFix } from './is-base-branch-fix';

test('it counts a commit of the base written after the head that posted the finding, which neither head holds', () => {
  expect(
    isBaseBranchFix({
      isCommitRead: true,
      isParentRead: true,
      isPostedRead: true,
      reads: {
        isInBase: true,
        isInPostedHead: false,
        isInLensHead: false,
        authoredAt: 200,
        postedCommittedAt: 100,
      },
    }),
  ).toBe(true);
});

test('it counts a commit authored in the second that the head that posted the finding was committed', () => {
  expect(
    isBaseBranchFix({
      isCommitRead: true,
      isParentRead: true,
      isPostedRead: true,
      reads: {
        isInBase: true,
        isInPostedHead: false,
        isInLensHead: false,
        authoredAt: 100,
        postedCommittedAt: 100,
      },
    }),
  ).toBe(true);
});

test.each([
  {
    label: 'a sha that names no commit',
    evidence: { isCommitRead: false, isParentRead: false, isPostedRead: true, reads: null },
  },
  {
    label: 'a commit with no parent',
    evidence: { isCommitRead: true, isParentRead: false, isPostedRead: true, reads: null },
  },
  {
    label: 'a fix whose posting head the repo does not hold',
    evidence: { isCommitRead: true, isParentRead: true, isPostedRead: false, reads: null },
  },
  {
    label: 'a commit the base does not hold',
    evidence: {
      isCommitRead: true,
      isParentRead: true,
      isPostedRead: true,
      reads: {
        isInBase: false,
        isInPostedHead: false,
        isInLensHead: false,
        authoredAt: 200,
        postedCommittedAt: 100,
      },
    },
  },
  {
    label: 'a commit the head that posted the finding holds',
    evidence: {
      isCommitRead: true,
      isParentRead: true,
      isPostedRead: true,
      reads: {
        isInBase: true,
        isInPostedHead: true,
        isInLensHead: false,
        authoredAt: 200,
        postedCommittedAt: 100,
      },
    },
  },
  {
    label: 'a commit the last lens head holds',
    evidence: {
      isCommitRead: true,
      isParentRead: true,
      isPostedRead: true,
      reads: {
        isInBase: true,
        isInPostedHead: false,
        isInLensHead: true,
        authoredAt: 200,
        postedCommittedAt: 100,
      },
    },
  },
  {
    label: 'a commit authored before the head that posted the finding',
    evidence: {
      isCommitRead: true,
      isParentRead: true,
      isPostedRead: true,
      reads: {
        isInBase: true,
        isInPostedHead: false,
        isInLensHead: false,
        authoredAt: 50,
        postedCommittedAt: 100,
      },
    },
  },
])('it refuses $label', (row) => {
  expect(isBaseBranchFix(row.evidence)).toBe(false);
});
