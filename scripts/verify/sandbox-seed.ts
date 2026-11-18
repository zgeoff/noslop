// The change each run's pull request makes: the first test of the CLI's model-api review test, whose
// review finds a dropped rollback and an injection sink. `fix` undoes both.
const baseStock = [
  "import type { Database } from 'bun:sqlite';",
  '',
  '// moves stock between 2 SKUs in one transaction, so a failed update moves nothing',
  'export function moveStock(db: Database, from: string, to: string, count: number): void {',
  "  db.run('BEGIN');",
  '',
  '  try {',
  "    db.run('UPDATE stock SET count = count - ? WHERE sku = ?', [count, from]);",
  "    db.run('UPDATE stock SET count = count + ? WHERE sku = ?', [count, to]);",
  "    db.run('COMMIT');",
  '  } catch (error) {',
  "    db.run('ROLLBACK');",
  '    throw error;',
  '  }',
  '}',
  '',
].join('\n');

export const sandboxSeed = {
  base: {
    message: 'Add the stock and order queries',
    files: {
      'package.json': '{\n  "name": "shop",\n  "version": "1.0.0",\n  "private": true\n}\n',
      'src/stock.ts': baseStock,
      'src/orders.ts': [
        "import type { Database } from 'bun:sqlite';",
        '',
        'export function findOrders(db: Database, customer: string): unknown[] {',
        "  return db.query('SELECT * FROM orders WHERE customer = ?').all(customer);",
        '}',
        '',
      ].join('\n'),
    },
  },
  defect: {
    title: 'Log a failed stock move and filter orders by status',
    body: 'The status comes from the request query string.',
    files: {
      'src/stock.ts': [
        "import type { Database } from 'bun:sqlite';",
        '',
        '// moves stock between 2 SKUs in one transaction, so a failed update moves nothing',
        'export function moveStock(db: Database, from: string, to: string, count: number): void {',
        "  db.run('BEGIN');",
        '',
        '  try {',
        "    db.run('UPDATE stock SET count = count - ? WHERE sku = ?', [count, from]);",
        "    db.run('UPDATE stock SET count = count + ? WHERE sku = ?', [count, to]);",
        "    db.run('COMMIT');",
        '  } catch (error) {',
        "    console.warn('stock move failed', error);",
        '  }',
        '}',
        '',
      ].join('\n'),
      'src/orders.ts': [
        "import type { Database } from 'bun:sqlite';",
        '',
        'export function findOrders(db: Database, customer: string, status: string): unknown[] {',
        '  return db',
        // oxlint-disable-next-line no-template-curly-in-string -- the seeded source builds SQL in a template
        "    .query(`SELECT * FROM orders WHERE customer = ? AND status = '${status}'`)",
        '    .all(customer);',
        '}',
        '',
      ].join('\n'),
    },
  },
  fix: {
    message: 'Roll back a failed stock move and bind the order status',
    files: {
      'src/stock.ts': baseStock,
      'src/orders.ts': [
        "import type { Database } from 'bun:sqlite';",
        '',
        'export function findOrders(db: Database, customer: string, status: string): unknown[] {',
        "  return db.query('SELECT * FROM orders WHERE customer = ? AND status = ?').all(customer, status);",
        '}',
        '',
      ].join('\n'),
    },
  },
} as const;
