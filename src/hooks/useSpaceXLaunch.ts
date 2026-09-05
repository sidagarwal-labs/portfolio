import { useEffect, useState } from "react";

type Launch = { name: string; net: string; precise: boolean };
type LaunchCache = { fetchedAt: number; launch: Launch | null };

const cacheKey = "spacex-next-launch-v2";
const cacheLifetime = 2 * 60 * 60 * 1000;
const retryDelay = 15 * 60 * 1000;
const endpoint = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?lsp__id=121&limit=1&ordering=net&hide_recent_previous=true&format=json";

function readCache(): LaunchCache | null {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    if (!cached || !Number.isFinite(cached.fetchedAt)) return null;
    if (cached.launch !== null && (
      typeof cached.launch?.name !== "string" || typeof cached.launch?.net !== "string" ||
      !Number.isFinite(Date.parse(cached.launch.net)) || typeof cached.launch.precise !== "boolean"
    )) return null;
    return cached;
  } catch {
    return null;
  }
}

export function useSpaceXLaunch() {
  const [state, setState] = useState(() => {
    const cached = readCache();
    return { launch: cached?.launch ?? null, loading: !cached, now: Date.now() };
  });

  useEffect(() => {
    let cached = readCache();
    let active = true;
    let inFlight = false;
    let controller: AbortController | undefined;

    async function refresh() {
      const now = Date.now();
      setState((previous) => ({ ...previous, now }));
      if (inFlight) return;
      const age = now - (cached?.fetchedAt ?? 0);
      const upcoming = cached?.launch && Date.parse(cached.launch.net) > now;
      if (cached && age >= 0 && age < (upcoming ? cacheLifetime : retryDelay)) return;

      inFlight = true;
      controller = new AbortController();
      const request = controller;
      const timeout = window.setTimeout(() => request.abort(), 8_000);
      let launch: Launch | null = null;

      try {
        const response = await fetch(endpoint, { signal: request.signal, headers: { Accept: "application/json" } });
        if (response.ok) {
          const payload = await response.json();
          const next = payload?.results?.[0];
          if (next?.launch_service_provider?.id === 121 && typeof next.name === "string" &&
            typeof next.net === "string" && Number.isFinite(Date.parse(next.net)) && Date.parse(next.net) > Date.now()) {
            launch = {
              name: next.name,
              net: next.net,
              precise: next.status?.abbrev === "Go" && ["Second", "Minute"].includes(next.net_precision?.name)
            };
          }
        }
      } catch {
        launch = null;
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }

      if (!active) return;
      cached = { launch, fetchedAt: Date.now() };
      setState({ launch, loading: false, now: Date.now() });
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cached));
      } catch {
        return;
      }
    }

    const start = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearTimeout(start);
      window.clearInterval(interval);
      controller?.abort();
    };
  }, []);

  let countdown = state.loading ? "Loading..." : "Unavailable";
  if (state.launch) {
    const remaining = Date.parse(state.launch.net) - state.now;
    if (remaining <= 0) {
      countdown = "Awaiting update";
    } else if (!state.launch.precise) {
      countdown = "Date tentative";
    } else {
      const totalMinutes = Math.ceil(remaining / 60_000);
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor(totalMinutes / 60) % 24;
      const minutes = totalMinutes % 60;
      countdown = days > 0 ? `T-${days}d ${hours}h` : `T-${hours}h ${String(minutes).padStart(2, "0")}m`;
    }
  }

  return { launch: state.launch, countdown };
}