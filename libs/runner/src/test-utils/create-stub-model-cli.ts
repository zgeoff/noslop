import { createStubBin } from '@zgeoff/testing/bin';
import type { StubCall } from '@zgeoff/testing/bin';

export interface StubModelCLIScript {
  // The flag whose next argument is a file for the last message, or null for a CLI with no such flag
  outputFlag: string | null;
  lastMessage: string | null;
  stdout: string;
  stderr: string;
  exitCode: number;
  delayMs: number;
}

export interface StubModelCLI {
  path: string;
  readCall: () => StubCall;
}

// A stand-in for a model CLI. It records each call with its stdin, writes the last message to the
// file that follows the output flag, waits, prints, and exits as scripted.
export function createStubModelCLI(directory: string, script: StubModelCLIScript): StubModelCLI {
  const bin = createStubBin(directory, 'stub-cli', {
    script: buildScript(script),
    recordStdin: true,
  });

  return {
    path: bin.path,
    readCall: () => {
      const calls = bin.readCalls();
      const [call] = calls;

      if (calls.length !== 1 || call === undefined) {
        throw new Error(`the stub CLI took ${calls.length} calls, not 1`);
      }

      return call;
    },
  };
}

function buildScript(script: StubModelCLIScript): string {
  const lines = ['#!/bin/sh'];

  if (script.outputFlag !== null && script.lastMessage !== null) {
    lines.push(
      'while [ "$#" -ge 2 ]; do',
      `  if [ "$1" = ${formatShellWord(script.outputFlag)} ]; then`,
      `    printf %s ${formatShellWord(script.lastMessage)} > "$2"`,
      '    break',
      '  fi',
      '  shift',
      'done',
    );
  }

  if (script.delayMs > 0) {
    lines.push(`sleep ${script.delayMs / 1000}`);
  }

  lines.push(
    `printf %s ${formatShellWord(script.stdout)}`,
    `printf %s ${formatShellWord(script.stderr)} >&2`,
    `exit ${script.exitCode}`,
  );

  return `${lines.join('\n')}\n`;
}

function formatShellWord(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}
