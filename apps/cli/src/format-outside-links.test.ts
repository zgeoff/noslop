import { expect, test } from 'bun:test';
import { formatOutsideLinks } from './format-outside-links';

test.each([
  {
    case: 'a file that is itself the link',
    links: [{ path: 'review.json', link: 'review.json', target: '../shared/review.json' }],
    names: 'review.json (a link to ../shared/review.json)',
  },
  {
    case: 'a file under a symlinked folder',
    links: [{ path: 'skills/style/SKILL.md', link: 'skills', target: '/opt/skills' }],
    names: 'skills/style/SKILL.md (under skills, a link to /opt/skills)',
  },
  {
    case: '2 files',
    links: [
      { path: 'skills/tests/SKILL.md', link: 'skills', target: '/opt/skills' },
      { path: 'review.json', link: 'review.json', target: '/opt/review.json' },
    ],
    names:
      'review.json (a link to /opt/review.json), skills/tests/SKILL.md (under skills, a link to /opt/skills)',
  },
])('it names $case in path order', (row) => {
  expect(formatOutsideLinks(row.links)).toBe(
    `reads files through symlinks that leave the repo, which GitHub cannot serve: ${row.names}`,
  );
});
