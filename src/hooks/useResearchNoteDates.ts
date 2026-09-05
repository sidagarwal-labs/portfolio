import { useEffect, useState } from "react";
import { researchNotes } from "../content/journalContent";

const cacheKey = "research-note-dates-v1";
const cacheLifetime = 60 * 60 * 1000;
const initialDates = Object.fromEntries(researchNotes.map((note) => [note.slug, note.updatedAt]));

type DateCache = { fetchedAt: number; dates: Record<string, string> };

function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function readCache(): DateCache | null {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    if (!cached || !Number.isFinite(cached.fetchedAt) || !cached.dates) return null;
    if (!researchNotes.every((note) => isDate(cached.dates[note.slug]))) return null;
    return cached;
  } catch {
    return null;
  }
}

export function useResearchNoteDates() {
  const [dates, setDates] = useState(() => readCache()?.dates ?? initialDates);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: number | undefined;

    async function refresh() {
      const cached = readCache();
      const cacheAge = Date.now() - (cached?.fetchedAt ?? 0);
      if (cached && cacheAge >= 0 && cacheAge < cacheLifetime) return;

      const nextDates = { ...initialDates, ...cached?.dates };
      timeout = window.setTimeout(() => controller.abort(), 8_000);
      await Promise.all(researchNotes.map(async (note) => {
        const url = new URL("https://api.github.com/repos/sidagarwal-labs/models/commits");
        url.search = new URLSearchParams({ path: `notes/${note.slug}.md`, per_page: "1" }).toString();
        try {
          const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/vnd.github+json" } });
          if (!response.ok) return;
          const commits = await response.json();
          const updatedAt = commits?.[0]?.commit?.committer?.date;
          if (isDate(updatedAt)) nextDates[note.slug] = updatedAt;
        } catch {
          return;
        }
      }));
      window.clearTimeout(timeout);
      if (controller.signal.aborted) return;
      setDates(nextDates);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ dates: nextDates, fetchedAt: Date.now() }));
      } catch {
        return;
      }
    }

    const start = window.setTimeout(refresh, 0);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return dates;
}