import { z } from 'zod';

export interface AppServerEnv {
  appID: number;
  privateKey: string;
  webhookSecret: string;
  port: number;

  reposDir: string;
}

const envSchema = z.object({
  NOSLOP_GITHUB_APP_ID: z.coerce.number().int().positive(),
  NOSLOP_GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  NOSLOP_GITHUB_WEBHOOK_SECRET: z.string().min(1),
  NOSLOP_GITHUB_APP_REPOS_DIR: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
});

export function parseAppServerEnv(env: Readonly<Record<string, string | undefined>>): AppServerEnv {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join('.'));

    throw new Error(`the noslop App needs these settings: ${keys.join(', ')}`);
  }

  return {
    appID: parsed.data.NOSLOP_GITHUB_APP_ID,
    privateKey: parsed.data.NOSLOP_GITHUB_APP_PRIVATE_KEY.replaceAll(String.raw`\n`, '\n'),
    webhookSecret: parsed.data.NOSLOP_GITHUB_WEBHOOK_SECRET,
    port: parsed.data.PORT,
    reposDir: parsed.data.NOSLOP_GITHUB_APP_REPOS_DIR,
  };
}
