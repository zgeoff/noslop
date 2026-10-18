import { configure, getConsoleSink, getLogger } from '@logtape/logtape';
import { createAppServer } from './create-app-server';
import { createJobQueue } from './create-job-queue';
import { createProcessRunner } from './create-process-runner';
import { makeAppJobRunner } from './make-app-job-runner';
import { makeTokenMinter } from './make-token-minter';
import { parseAppServerEnv } from './parse-app-server-env';

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [{ category: ['noslop'], lowestLevel: 'info', sinks: ['console'] }],
});

const env = parseAppServerEnv(process.env);
const logger = getLogger(['noslop', 'github-app']);

const queue = createJobQueue(
  makeAppJobRunner(env, {
    runner: createProcessRunner(),
    mintToken: makeTokenMinter(env.appID, env.privateKey),
  }),
  logger,
);

createAppServer({ webhookSecret: env.webhookSecret, onEvent: queue.enqueue }).listen(env.port);

logger.info('the noslop App listens on port {port}', { port: env.port });
