import type { Criterion } from '@noslop/contract';
import { CRITERION_SEVERITY, criterionSchema } from '@noslop/contract';

const CRITERION_COVERS: Readonly<Record<Criterion, string>> = {
  'security-defect': 'A security defect',
  'data-loss': 'Data loss, corruption, or an outcome that cannot be undone',
  outage: "An outage, or a broken deploy or release, including a version a consumer's pin refuses",
  'wrong-result-main-path': 'A wrong result on the main path',
  'wrong-behaviour-edge-path': 'Wrong behaviour on an edge or failure path',
  'untested-change': 'A changed behaviour with no test',
  'taste-rule': 'A broken rule from the rules file',
  'misleading-name': 'A name that hides what the code does',
  'intent-mismatch': 'Unrequested work, an unmet acceptance criterion, a false claim in the body',
  'duplicate-helper': 'A new function that does the job of an existing one',
  'design-defect': 'Structure that makes the next change harder, under a rule from the rules file',
  'instruction-conflict': 'An instruction that conflicts with another rule an agent loads',
  'wrong-doc-fact': 'A wrong fact or a failing step in the documentation',
  naming: 'Naming',
  comments: 'Comments',
  'documentation-prose': 'Documentation prose',
  'noisy-log': 'A log on a hot or success path that adds noise',
};

// the criteria table of the shared header, one row per criterion with the severity it sets
export function renderCriteria(): string {
  const rows = criterionSchema.options.map(
    (criterion) =>
      `| \`${criterion}\` | ${CRITERION_SEVERITY[criterion]} | ${CRITERION_COVERS[criterion]} |`,
  );

  return ['| Criterion | Severity | Covers |', '| --- | --- | --- |', ...rows].join('\n');
}
