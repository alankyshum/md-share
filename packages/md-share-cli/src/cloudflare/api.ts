interface CfAccount {
  id: string;
  name: string;
}

interface CfError {
  code: number;
  message: string;
}

interface CfResponse<T> {
  success: boolean;
  result: T;
  errors: CfError[];
}

interface PagesProject {
  name: string;
  subdomain: string;
}

export async function listAccounts(token: string): Promise<CfAccount[]> {
  const url = 'https://api.cloudflare.com/client/v4/accounts';
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as CfResponse<CfAccount[]>;
  if (!data.success) {
    const errorMsg = data.errors.map(e => `[${e.code}] ${e.message}`).join(', ');
    throw new Error(`Cloudflare API error: ${errorMsg}`);
  }

  return data.result.map(acc => ({ id: acc.id, name: acc.name }));
}

export async function getPagesProject(
  token: string,
  accountId: string,
  projectName: string
): Promise<PagesProject | null> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as CfResponse<PagesProject>;
  if (!data.success) {
    const isNotFound = data.errors.some(e => e.code === 8000007 || e.message.toLowerCase().includes('not found'));
    if (isNotFound) {
      return null;
    }
    const errorMsg = data.errors.map(e => `[${e.code}] ${e.message}`).join(', ');
    throw new Error(`Cloudflare API error: ${errorMsg}`);
  }

  return data.result;
}

export async function createPagesProject(
  token: string,
  accountId: string,
  projectName: string
): Promise<PagesProject> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`;
  const body = {
    name: projectName,
    production_branch: 'master',
    source: {
      type: 'github',
      config: {
        owner: 'alankyshum',
        repo_name: 'md-share',
        production_branch: 'master',
        deployments_enabled: true,
        root_dir: 'packages/md-share-app',
        production_deployment_enabled: true,
        preview_deployment_setting: 'all',
        preview_branch_includes: ['*'],
        preview_branch_excludes: ['master'],
      },
    },
    build_config: {
      build_command: 'pnpm install --frozen-lockfile && pnpm --filter @alankyshum/md-share-app build',
      destination_dir: 'build',
      root_dir: 'packages/md-share-app',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as CfResponse<PagesProject>;
  if (!response.ok || !data.success) {
    const errors = data.errors || [];
    const isNoAccess = errors.some(e =>
      e.message.toLowerCase().includes('access') ||
      e.message.toLowerCase().includes('permission') ||
      e.message.toLowerCase().includes('github') ||
      e.message.toLowerCase().includes('repo')
    );
    if (isNoAccess) {
      throw new Error('Visit https://github.com/apps/cloudflare-pages/installations/new and grant access to alankyshum/md-share, then re-run.');
    }
    const errorMsg = errors.map(e => `[${e.code}] ${e.message}`).join(', ') || `${response.status} ${response.statusText}`;
    throw new Error(`Cloudflare API error: ${errorMsg}`);
  }

  return data.result;
}
