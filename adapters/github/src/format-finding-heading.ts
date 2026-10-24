import type { FindingLens, Severity } from '@noslop/contract';

export function formatFindingHeading(severity: Severity, lens: FindingLens, title: string): string {
  const words = lens.replaceAll('-', ' ');

  return `**${severity} · ${words.charAt(0).toUpperCase()}${words.slice(1)}** · ${title}`;
}
