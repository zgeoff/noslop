import { expect, mock, test } from 'bun:test';
import { runTempSweep } from './run-temp-sweep';

function setupTest() {
  const removeName = mock<(name: string) => Promise<void>>(() => Promise.resolve());

  return { removeName };
}

test('it removes the folders of finished runs in its namespace', async () => {
  const ctx = setupTest();

  const removed = await runTempSweep({
    namespace: '5',
    readNames: () => Promise.resolve(['pid111-ns5-noslop-store-a1', 'pid112-ns5-noslop-repo-e5']),
    isRunning: () => false,
    removeName: ctx.removeName,
  });

  expect(removed).toStrictEqual(['pid111-ns5-noslop-store-a1', 'pid112-ns5-noslop-repo-e5']);

  expect(ctx.removeName.mock.calls).toStrictEqual([
    ['pid111-ns5-noslop-store-a1'],
    ['pid112-ns5-noslop-repo-e5'],
  ]);
});

test('it never removes a running run, another namespace or an unprefixed folder', async () => {
  const ctx = setupTest();

  const running = new Map([[222, true]]);

  const removed = await runTempSweep({
    namespace: '5',
    readNames: () =>
      Promise.resolve([
        'pid222-ns5-noslop-store-b2',
        'pid333-ns9-noslop-store-d4',
        'noslop-store-c3',
      ]),
    isRunning: (pid) => running.get(pid) ?? false,
    removeName: ctx.removeName,
  });

  expect(removed).toStrictEqual([]);
  expect(ctx.removeName).not.toHaveBeenCalled();
});
