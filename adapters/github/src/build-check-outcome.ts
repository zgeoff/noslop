import type { Disposition } from '@noslop/contract';
import { findAnswerRefusal } from './find-answer-refusal';
import type { FindingMarker } from './finding-marker';
import type { SummaryMarker } from './summary-marker';

export interface CheckOutcomeInput {
  findings: readonly FindingMarker[];

  dispositions: readonly Disposition[];
  summary: SummaryMarker | null;

  existingIssues: ReadonlySet<string>;

  unread: ReadonlySet<string>;

  unreadable: number;
}

interface OpenFinding {
  id: string;
  title: string;
  reason: string;
}

export interface CheckOutcome {
  conclusion: 'success' | 'failure';
  title: string;
  summary: string;
  open: OpenFinding[];
}

export function buildCheckOutcome(input: CheckOutcomeInput): CheckOutcome {
  const latest = new Map(input.dispositions.map((item) => [item.findingID, item]));

  const evidence = {
    reported: input.summary?.reported ?? [],
    confirmed: input.summary?.confirmed ?? [],
    unjudged: input.summary?.unjudged ?? [],
    existingIssues: input.existingIssues,
    unread: input.unread,
  };

  const open = input.findings.flatMap((finding) => {
    const refusal = findAnswerRefusal(finding, latest.get(finding.id), evidence);

    return refusal === null
      ? []
      : [{ id: finding.id, title: finding.title, reason: refusal.reason }];
  });

  const problems = [
    ...(input.unreadable > 0
      ? [`${input.unreadable} finding comments hold a marker noslop cannot read.`]
      : []),
    ...(open.length > 0 ? [`${open.length} findings are open.`] : []),
  ];

  if (problems.length === 0) {
    return {
      conclusion: 'success',
      title: `No open finding (${input.findings.length})`,
      summary: '',
      open,
    };
  }

  return {
    conclusion: 'failure',
    title: problems[0] ?? '',
    summary: [
      ...problems,
      ...open.map((item) => `- \`${item.id}\` ${item.title}: ${item.reason}`),
    ].join('\n'),
    open,
  };
}
