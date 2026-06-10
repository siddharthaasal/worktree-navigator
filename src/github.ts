import * as vscode from "vscode";
import { getOriginUrl } from "./git";

export type PrState = "OPEN" | "MERGED" | "CLOSED";

export interface PullRequest {
  number: number;
  state: PrState;
  isDraft: boolean;
  url: string;
}

/** owner/repo parsed from a GitHub remote URL. */
interface RepoSlug {
  owner: string;
  repo: string;
}

interface CacheEntry {
  at: number;
  prs: Map<string, PullRequest>;
}

const TTL_MS = 5 * 60 * 1000;
const GRAPHQL = "https://api.github.com/graphql";

const QUERY = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    pullRequests(first:100, orderBy:{field:UPDATED_AT, direction:DESC}, states:[OPEN,MERGED,CLOSED]){
      nodes{ number state isDraft headRefName url }
    }
  }
}`;

/**
 * Fetches GitHub pull-request status for a repository's branches, using VS
 * Code's built-in GitHub authentication. Read-only; caches per repo with a
 * short TTL. All failures (no remote, not signed in, offline, API error)
 * degrade to "no data" rather than throwing.
 */
export class GitHubService {
  private cache = new Map<string, CacheEntry>();

  /** Return cached, non-expired PR map for a repo without any network call. */
  peek(repoRoot: string): Map<string, PullRequest> | undefined {
    const entry = this.cache.get(repoRoot);
    if (entry && Date.now() - entry.at < TTL_MS) {
      return entry.prs;
    }
    return undefined;
  }

  /**
   * Resolve the branch→PR map for a repo, fetching if the cache is cold/stale.
   * `createIfNone` controls whether an interactive sign-in is triggered.
   */
  async getPrMap(
    repoRoot: string,
    opts: { createIfNone: boolean },
  ): Promise<Map<string, PullRequest> | undefined> {
    const cached = this.peek(repoRoot);
    if (cached) {
      return cached;
    }

    const slug = await this.slugFor(repoRoot);
    if (!slug) {
      return undefined; // not a GitHub remote
    }

    const token = await getToken(opts.createIfNone);
    if (!token) {
      return undefined; // not signed in
    }

    const prs = await fetchPrs(slug, token);
    if (!prs) {
      return undefined; // network/API failure
    }

    this.cache.set(repoRoot, { at: Date.now(), prs });
    return prs;
  }

  clear(): void {
    this.cache.clear();
  }

  private async slugFor(repoRoot: string): Promise<RepoSlug | undefined> {
    const url = await getOriginUrl(repoRoot);
    return url ? parseGitHubRemote(url) : undefined;
  }
}

/** Get a GitHub token via VS Code's auth provider, or undefined. */
async function getToken(createIfNone: boolean): Promise<string | undefined> {
  try {
    const session = await vscode.authentication.getSession(
      "github",
      ["repo"],
      { createIfNone },
    );
    return session?.accessToken;
  } catch {
    return undefined;
  }
}

/** Parse `owner/repo` from an HTTPS or SSH GitHub remote URL. */
export function parseGitHubRemote(url: string): RepoSlug | undefined {
  const trimmed = url.trim().replace(/\.git$/, "");
  // https://github.com/owner/repo  |  git@github.com:owner/repo  |  ssh://git@github.com/owner/repo
  const m = trimmed.match(
    /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/,
  );
  if (!m) {
    return undefined;
  }
  return { owner: m[1], repo: m[2] };
}

async function fetchPrs(
  slug: RepoSlug,
  token: string,
): Promise<Map<string, PullRequest> | undefined> {
  try {
    const res = await fetch(GRAPHQL, {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "worktree-navigator",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { owner: slug.owner, name: slug.repo },
      }),
    });
    if (!res.ok) {
      return undefined;
    }
    const json = (await res.json()) as {
      data?: {
        repository?: {
          pullRequests?: {
            nodes?: Array<{
              number: number;
              state: PrState;
              isDraft: boolean;
              headRefName: string;
              url: string;
            }>;
          };
        };
      };
    };
    const nodes = json.data?.repository?.pullRequests?.nodes ?? [];
    const map = new Map<string, PullRequest>();
    // Nodes are newest-first; keep the first PR seen per branch.
    for (const n of nodes) {
      if (!map.has(n.headRefName)) {
        map.set(n.headRefName, {
          number: n.number,
          state: n.state,
          isDraft: n.isDraft,
          url: n.url,
        });
      }
    }
    return map;
  } catch {
    return undefined;
  }
}
