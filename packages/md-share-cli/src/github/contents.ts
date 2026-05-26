export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  content?: string; // base64
}

export interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

export interface RepoInfo {
  default_branch: string;
  owner: {
    login: string;
  };
}

async function githubRequest(
  url: string,
  method: string,
  token: string,
  body?: any
): Promise<any> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'md-share-cli/1.0.0',
    'Authorization': `Bearer ${token}`,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 404 && (method === 'GET' || method === 'DELETE')) {
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API error (${res.status} ${res.statusText}): ${errText}`);
  }

  if (res.status === 204) {
    return true;
  }

  return res.json();
}

export async function getRepoInfo(repo: string, token: string): Promise<RepoInfo | null> {
  const url = `https://api.github.com/repos/${repo}`;
  return githubRequest(url, 'GET', token);
}

export async function getRecursiveTree(
  repo: string,
  branch: string,
  token: string
): Promise<TreeEntry[]> {
  const url = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
  const res = await githubRequest(url, 'GET', token);
  return res?.tree || [];
}

export async function getFile(
  repo: string,
  path: string,
  token: string
): Promise<GitHubFile | null> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  return githubRequest(url, 'GET', token);
}

export async function putFile(
  repo: string,
  path: string,
  content: string,
  sha: string | undefined,
  commitMsg: string,
  token: string
): Promise<{ content: GitHubFile }> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const body: any = {
    message: commitMsg,
    content: Buffer.from(content, 'utf8').toString('base64'),
  };
  if (sha) {
    body.sha = sha;
  }
  return githubRequest(url, 'PUT', token, body);
}

export async function deleteFile(
  repo: string,
  path: string,
  sha: string,
  commitMsg: string,
  token: string
): Promise<boolean> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const body = {
    message: commitMsg,
    sha,
  };
  return githubRequest(url, 'DELETE', token, body);
}

export async function createRepo(
  repoName: string,
  token: string
): Promise<any> {
  const url = 'https://api.github.com/user/repos';
  const body = {
    name: repoName,
    description: 'Storage backend for md-share encrypted documents',
    private: false,
    has_issues: false,
    has_projects: false,
    has_wiki: false,
  };
  return githubRequest(url, 'POST', token, body);
}

export async function getAuthenticatedUser(token: string): Promise<{ login: string }> {
  const url = 'https://api.github.com/user';
  return githubRequest(url, 'GET', token);
}

export async function forkRepo(token: string): Promise<any> {
  try {
    const user = await getAuthenticatedUser(token);
    const existing = await getRepoInfo(`${user.login}/md-share`, token);
    if (existing) {
      return existing;
    }
  } catch (err) {
    // Ignore user info fetch or check errors, proceed to fork anyway
  }

  const url = 'https://api.github.com/repos/alankyshum/md-share/forks';
  try {
    return await githubRequest(url, 'POST', token, {});
  } catch (err: any) {
    if (err.message && (err.message.includes('already') || err.message.includes('exists'))) {
      return null;
    }
    return null;
  }
}
