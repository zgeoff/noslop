import { z } from 'zod';

// what a follow-up issue's marker keeps: the finding it files and the pull request it came from, so a
// retried post finds the issue its first attempt opened
export const followUpMarkerSchema = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{16}$/u),
  pullRequest: z.int().positive(),
});
