import { App } from '@octokit/app';

export function makeTokenMinter(
  appID: number,
  privateKey: string,
): (installationID: number) => Promise<string> {
  const app = new App({ appId: appID, privateKey });

  return async (installationID) => {
    const response = await app.octokit.request(
      'POST /app/installations/{installation_id}/access_tokens',
      { installation_id: installationID },
    );

    return response.data.token;
  };
}
