import type { FindingLens, Severity } from '@noslop/contract';

// the heading line of a finding comment: the severity, the lens as a person reads it, and the title;
// `naming-shape-and-comments` reads as "Naming shape and comments"
export function formatFindingHeading(severity: Severity, lens: FindingLens, title: string): string {
  const words = lens.replaceAll('-', ' ');

  return `**${severity} · ${words.charAt(0).toUpperCase()}${words.slice(1)}** · ${title}`;
}
