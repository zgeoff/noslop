import type { Reporter } from '@noslop/contract';

// writes the review result as JSON to the file its options name, or through the given writer
export function createJSONReporter(write: (text: string) => void): Reporter {
  return {
    id: 'json',
    report: async (result, ctx) => {
      const text = `${JSON.stringify(result, null, 2)}\n`;

      if (ctx.options.path === undefined) {
        write(text);
      } else {
        await Bun.write(ctx.options.path, text);
      }
    },
  };
}
