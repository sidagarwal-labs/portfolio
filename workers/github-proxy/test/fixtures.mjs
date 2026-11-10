const DAY_MS = 86_400_000;

export function repo(name, overrides = {}) {
  return {
    id: `R_${name}`,
    name,
    nameWithOwner: `Octo/${name}`,
    url: `https://github.com/Octo/${name}`,
    description: `${name} description`,
    isPrivate: false,
    isFork: false,
    createdAt: "2024-01-01T00:00:00Z",
    pushedAt: "2025-11-01T00:00:00Z",
    diskUsage: 10,
    stargazerCount: 0,
    forkCount: 0,
    primaryLanguage: { name: "JavaScript" },
    languages: { edges: [{ size: 10, node: { name: "JavaScript" } }] },
    ...overrides
  };
}

const day = (date, contributionCount) => ({ date, contributionCount });
const commits = (...nodes) => ({ nodes: nodes.map(([occurredAt, commitCount]) => ({ occurredAt, commitCount })) });

/** GraphQL `data` for a user with a private repo, a calendar gap on 2025-11-12, and unsorted weeks. */
export function graphqlData({ ownedCount = 3 } = {}) {
  const busy = repo("busy", {
    diskUsage: 321,
    stargazerCount: 5,
    primaryLanguage: { name: "TypeScript" },
    languages: { edges: [{ size: 100, node: { name: "CSS" } }, { size: 900, node: { name: "TypeScript" } }] }
  });
  const secret = repo("secret-plan", { isPrivate: true, description: "secret-plan internal", pushedAt: "2025-11-20T00:00:00Z" });
  return {
    user: {
      id: "U_octo",
      login: "Octo",
      name: "Octo Cat",
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      url: "https://github.com/Octo",
      bio: "",
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: 18,
          weeks: [
            { contributionDays: [day("2025-11-16", 2), day("2025-11-17", 0), day("2025-11-18", 1), day("2025-11-19", 0), day("2025-11-20", 4)] },
            { contributionDays: [day("2025-11-09", 1), day("2025-11-10", 3), day("2025-11-11", 0), day("2025-11-13", 0), day("2025-11-14", 7), day("2025-11-15", 0)] }
          ]
        },
        totalCommitContributions: 10,
        totalPullRequestContributions: 2,
        totalPullRequestReviewContributions: 1,
        totalIssueContributions: 3,
        totalRepositoryContributions: 4,
        restrictedContributionsCount: 7,
        commitContributionsByRepository: [
          { repository: secret, contributions: commits(["2025-11-20T08:00:00Z", 4]) },
          {
            repository: busy,
            contributions: commits(
              ["2025-11-09T15:00:00Z", 2], // UTC+9 midnight of 2025-11-10
              ["2025-11-10T08:00:00Z", 1], // UTC-8 midnight of 2025-11-10
              ["2025-11-14T08:00:00Z", 7],
              ["2025-12-01T08:00:00Z", 5] // outside the calendar range
            )
          },
          { repository: repo("quiet", { pushedAt: "2025-11-02T00:00:00Z" }), contributions: commits(["2025-11-18T08:00:00Z", 1]) }
        ]
      },
      repositories: {
        nodes: [
          busy,
          secret,
          repo("forked", { isFork: true }),
          ...Array.from({ length: ownedCount }, (_, i) => repo(`repo-${i}`, { pushedAt: new Date(Date.UTC(2025, 9, 1) - i * DAY_MS).toISOString() }))
        ]
      }
    }
  };
}

/** All-time commit counts graphqlData's repositories would report (busy: 42, quiet: 1, an empty repository: no count). */
export const ALL_TIME_COMMITS = { R_busy: 42, R_quiet: 1, "R_secret-plan": 99 };

const historyNode = (id, totalCount) => ({ id, defaultBranchRef: { target: { history: { totalCount } } } });

/** GraphQL `data` for COMMIT_TOTALS_QUERY: nodes follow `ids`; unknown ids resolve to an empty repository. */
export function commitTotalsData(ids, counts = ALL_TIME_COMMITS) {
  return { nodes: ids.map((id) => (id in counts ? historyNode(id, counts[id]) : { id, defaultBranchRef: null })) };
}

/** A fetch stand-in for GitHub's GraphQL endpoint that answers both queries from the fixtures. */
export function graphqlUpstream({ data = graphqlData(), counts = ALL_TIME_COMMITS } = {}) {
  return async (url, init) => {
    const { variables } = JSON.parse(init.body);
    const body = variables.ids ? { data: commitTotalsData(variables.ids, counts) } : { data };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}
