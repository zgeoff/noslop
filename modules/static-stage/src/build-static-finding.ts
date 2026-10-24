import type { Criterion, ModelFinding } from '@noslop/contract';
import { CRITERION_SEVERITY } from '@noslop/contract';
import type { SourceLocation } from './types';

export interface StaticFindingFields {
  title: string;
  body: string;
  anchor: SourceLocation;
  criterion: Criterion;
  missingChange?: boolean;
  fix?: string;
}

export function buildStaticFinding(fields: StaticFindingFields): ModelFinding {
  return {
    title: fields.title,
    body: fields.body,
    anchor: fields.anchor,
    secondLocation: null,
    severity: CRITERION_SEVERITY[fields.criterion],
    criterion: fields.criterion,
    rule: null,
    ruleQuote: null,
    verdict: 'CONFIRMED',
    unverifiedFact: null,
    missingChange: fields.missingChange ?? false,
    fix: fields.fix ?? null,
  };
}
