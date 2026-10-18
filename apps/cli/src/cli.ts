#!/usr/bin/env bun
import { configure, defaultTextFormatter } from '@logtape/logtape';
import { createCLIContext } from './create-cli-context';
import { removeGitHubKeys } from './remove-github-keys';
import { runCLI } from './run-cli';

// logs go to stderr, so stdout holds only a command's output; --verbose lowers the level to debug
const argv = Bun.argv.slice(2);
const isVerbose = argv.includes('--verbose');

await configure({
  sinks: {
    stderr: (record) => {
      process.stderr.write(defaultTextFormatter(record));
    },
  },
  loggers: [
    { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['stderr'] },
    { category: ['noslop'], lowestLevel: isVerbose ? 'debug' : 'warning', sinks: ['stderr'] },
  ],
});

process.exitCode = await runCLI(
  argv.filter((arg) => arg !== '--verbose'),
  createCLIContext(removeGitHubKeys(process.env)),
);
