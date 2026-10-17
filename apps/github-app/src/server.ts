import { join } from 'node:path';
import { configure, getConsoleSink, getLogger } from '@logtape/logtape';
import { createRunner } from '@noslop/runner';
import { createAppServer } from './create-app-server';
import { createJobQueue } from './create-job-queue';
import { makeTokenMinter } from './make-token-minter';
import { parseAppServerEnv } from './parse-app-server-env';
import { runAppJob } from './run-app-job';

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [{ category: ['noslop'], lowestLevel: 'info', sinks: ['console'] }],
});

const env = parseAppServerEnv(process.env);
const logger = getLogger(['noslop', 'github-app']);
const runner = createRunner();
const mintToken = makeTokenMinter(env.appID, env.privateKey);

const queue = createJobQueue(
  (event) =>
    runAppJob(event, {
      runner,
      cliPath: join(import.meta.dir, '..', '..', 'cli', 'src', 'cli.ts'),
      reposDir: env.reposDir,
      appID: env.appID,
      privateKey: env.privateKey,
      mintToken,
    }),
  logger,
);

createAppServer({ webhookSecret: env.webhookSecret, onEvent: queue.enqueue }).listen(env.port);

logger.info('the noslop App listens on port {port}', { port: env.port });
