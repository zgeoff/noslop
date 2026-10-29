import type { Criterion, FindingLens, Severity } from '@noslop/contract';

export interface MockFindingMarker {
  id: string;
  title: string;
  path: string;
  lens: FindingLens;
  severity: Severity;
  riskClass: string | null;
  writtenByChange: boolean;
  criterion?: Criterion;
  rule?: string | null;
  head?: string;
}

export interface MockReply {
  id: number;
  body: string;
  author: string;
  at: string;
}

export interface MockFindingThread {
  source: 'review' | 'issue';
  commentID: number;
  body: string;
  marker: MockFindingMarker;
  line: number | null;
  startLine: number | null;
  replies: MockReply[];
  answered: Set<number>;
}

export type MockFindingThreadOverrides = Partial<Omit<MockFindingThread, 'marker'>> & {
  marker?: Partial<MockFindingMarker>;
};

export function buildMockFindingThread(
  overrides: MockFindingThreadOverrides = {},
): MockFindingThread {
  const { marker, ...thread } = overrides;

  return {
    source: 'review',
    commentID: 41,
    body: 'Await the write',
    line: 12,
    startLine: 12,
    replies: [],
    answered: new Set(),
    ...thread,
    marker: {
      id: '1111111111111111',
      title: 'Await the write',
      path: 'src/a.ts',
      lens: 'correctness',
      severity: 'P2',
      riskClass: null,
      writtenByChange: true,
      ...marker,
    },
  };
}
