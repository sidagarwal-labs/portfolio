import type { GitHubInsights } from "../contract";

/* Each model runs at most once per insights object: revisiting a tab or returning to a profile reuses it. */
const cache = new WeakMap<GitHubInsights, Map<string, unknown>>();

export type Computed<T> = { ok: true; value: T } | { ok: false; error: string };

function entriesFor(insights: GitHubInsights) {
  let entries = cache.get(insights);
  if (!entries) {
    entries = new Map();
    cache.set(insights, entries);
  }
  return entries;
}

export function labMemo<T>(insights: GitHubInsights, key: string, compute: () => T): Computed<T> {
  const entries = entriesFor(insights);
  if (!entries.has(key)) {
    try {
      entries.set(key, { ok: true, value: compute() });
    } catch (error) {
      entries.set(key, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return entries.get(key) as Computed<T>;
}

export function peekMemo<T>(insights: GitHubInsights, key: string): T | undefined {
  const hit = cache.get(insights)?.get(key) as Computed<T> | undefined;
  return hit?.ok ? hit.value : undefined;
}

export function storeMemo<T>(insights: GitHubInsights, key: string, value: T) {
  entriesFor(insights).set(key, { ok: true, value });
}
