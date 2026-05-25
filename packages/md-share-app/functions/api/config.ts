import { version, build_commit } from '../_build-info.js';

interface Env {
  MD_SHARE_DEPLOYMENT_TYPE?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const deploymentType = env.MD_SHARE_DEPLOYMENT_TYPE === 'canonical' ? 'canonical' : 'self-host';
  const appBaseUrl = new URL(request.url).origin;

  const body = {
    version,
    build_commit,
    deployment_type: deploymentType,
    app_base_url: appBaseUrl,
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300',
    },
  });
};
