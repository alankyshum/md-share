export const GITHUB_OAUTH_CLIENT_ID = 'Ov23liCeBKLwRl7AwGjR';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface PollResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export async function startDeviceFlow(): Promise<string> {
  const codeUrl = 'https://github.com/login/device/code';
  const params = new URLSearchParams({
    client_id: GITHUB_OAUTH_CLIENT_ID,
    scope: 'public_repo',
  });

  const res = await fetch(codeUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`GitHub auth failed to initiate: HTTP ${res.status}`);
  }

  const data = (await res.json()) as DeviceCodeResponse;
  if (!data.device_code || !data.user_code || !data.verification_uri) {
    throw new Error('GitHub returned invalid device flow initialization payload');
  }

  console.log(`\nGitHub Device Authorization`);
  console.log(`1. Open this URL in your browser: \x1b[36m${data.verification_uri}\x1b[0m`);
  console.log(`2. Enter the following code: \x1b[1m\x1b[32m${data.user_code}\x1b[0m\n`);

  const pollUrl = 'https://github.com/login/oauth/access_token';
  const pollParams = new URLSearchParams({
    client_id: GITHUB_OAUTH_CLIENT_ID,
    device_code: data.device_code,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });

  let interval = data.interval * 1000 || 5000;
  const expiresAt = Date.now() + data.expires_in * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    const pollRes = await fetch(pollUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: pollParams.toString(),
    });

    if (!pollRes.ok) {
      throw new Error(`GitHub polling failed: HTTP ${pollRes.status}`);
    }

    const pollData = (await pollRes.json()) as PollResponse;

    if (pollData.access_token) {
      return pollData.access_token;
    }

    if (pollData.error) {
      if (pollData.error === 'authorization_pending') {
        continue;
      }
      if (pollData.error === 'slow_down') {
        interval += 5000;
        continue;
      }
      if (pollData.error === 'expired_token') {
        throw new Error('The authorization code has expired. Please try again.');
      }
      if (pollData.error === 'access_denied') {
        throw new Error('Access denied by user.');
      }
      throw new Error(`Authentication error: ${pollData.error_description || pollData.error}`);
    }
  }

  throw new Error('Device flow timed out. Please try again.');
}
