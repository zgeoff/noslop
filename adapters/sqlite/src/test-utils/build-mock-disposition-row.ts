import { faker } from '@faker-js/faker';
import type { DispositionRow } from '../store/store-tables';

export function buildMockDispositionRow(overrides: Partial<DispositionRow> = {}): DispositionRow {
  return {
    repo: 'example/app',
    finding_id: faker.string.hexadecimal({ length: 16, casing: 'lower', prefix: '' }),
    kind: 'deferred',
    value: faker.lorem.sentence(),
    author: faker.internet.username(),
    author_is_owner: 0,
    source: 'github',
    at: faker.date.recent().toISOString(),
    pull_request: faker.number.int({ min: 1, max: 9999 }),
    ...overrides,
  };
}
