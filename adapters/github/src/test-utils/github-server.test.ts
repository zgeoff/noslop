import { expect, onTestFinished, test } from 'bun:test';

test('it rejects a request that no handler matches', () => {
  expect(fetch('https://unmatched.test/notes')).rejects.toThrowWithMessage(
    TypeError,
    'Failed to fetch',
  );
});

test('it lets a request to a loopback test server through', async () => {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, routes: { '/': new Response('up') } });

  onTestFinished(() => server.stop(true));

  const response = await fetch(server.url);
  const text = await response.text();

  expect(text).toBe('up');
});
