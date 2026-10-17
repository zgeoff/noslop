import { App } from '@octokit/app';

// a function that mints an installation's access token as the App, for git to fetch the repo with
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
