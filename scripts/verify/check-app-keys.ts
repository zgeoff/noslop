import { createAppConnection } from './create-app-connection.ts';
import type { Env } from './parse-sandbox-env.ts';

// The App's 3 variables parse, and GitHub signs the App in with them: creating the connection
// calls `GET /app`.
export async function checkAppKeys(env: Env): Promise<{ app: string }> {
  const connection = await createAppConnection(env);

  return { app: connection.appLogin ?? '' };
}
