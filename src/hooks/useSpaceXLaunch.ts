import { useEffect, useState } from "react";

type Launch = { name: string; net: string; precise: boolean; webcastUrl: string | null; webcastLive: boolean };
type LaunchCache = { fetchedAt: number; launch: Launch | null; retryAt?: number };

const cacheKey = "spacex-next-launch-v2";
const cacheLifetime = 2 * 60 * 60 * 1000;
const retryDelay = 15 * 60 * 1000;
const launchSoonWindow = 4 * 60 * 60 * 1000;
const endpoint = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?lsp__id=121&limit=1&ordering=net&hide_recent_previous=true&format=json&mode=detailed";

function readWebcastUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!["spacex.com", "www.spacex.com", "x.com", "www.x.com", "youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function readCache(): LaunchCache | null {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    if (!cached || !Number.isFinite(cached.fetchedAt)) return null;
    if (cached.retryAt !== undefined && !Number.isFinite(cached.retryAt)) return null;
    if (cached.launch !== null && (
      typeof cached.launch?.name !== "string" || typeof cached.launch?.net !== "string" ||
      !Number.isFinite(Date.parse(cached.launch.net)) || typeof cached.launch.precise !== "boolean"
    )) return null;
    return {
      ...cached,
      launch: cached.launch === null ? null : {
        ...cached.launch,
        webcastUrl: readWebcastUrl(cached.launch.webcastUrl),
        webcastLive: cached.launch.webcastLive === true
      }
    };
  } catch {
    return null;
  }
}

export function useSpaceXLaunch() {
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("launch-preview") === "soon";
  const [state, setState] = useState(() => {
    if (preview) {
      const now = Date.now();
      return {
        launch: {
          name: "Falcon 9 | O3b mPower 11-13",
          net: new Date(now + (2 * 60 + 14) * 60_000).toISOString(),
          precise: true,
          webcastUrl: "https://x.com/i/broadcasts/1RKjpbVdykQJw",
          webcastLive: false
        },
        loading: false, stale: false, fetchedAt: now, now
      };
    }
    const cached = readCache();
    return { launch: cached?.launch ?? null, loading: !cached, stale: Boolean(cached?.retryAt), fetchedAt: cached?.fetchedAt ?? 0, now: Date.now() };
  });

  useEffect(() => {
    if (preview) {
      const interval = window.setInterval(() => setState((previous) => ({ ...previous, now: Date.now() })), 60_000);
      return () => window.clearInterval(interval);
    }
    let cached = readCache();
    let active = true;
    let inFlight = false;
    let controller: AbortController | undefined;

    async function refresh() {
      const now = Date.now();
      setState((previous) => ({ ...previous, now }));
      if (inFlight) return;
      if (cached?.retryAt && now < cached.retryAt) return;
      const age = now - (cached?.fetchedAt ?? 0);
      const remaining = cached?.launch ? Date.parse(cached.launch.net) - now : 0;
      const lifetime = remaining > 0 && remaining >= launchSoonWindow ? cacheLifetime : retryDelay;
      if (cached && !cached.retryAt && age >= 0 && age < lifetime) return;

      inFlight = true;
      controller = new AbortController();
      const request = controller;
      const timeout = window.setTimeout(() => request.abort(), 8_000);
      let launch: Launch | null = null;
      let failed = false;

      try {
        const response = await fetch(endpoint, { signal: request.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Launch schedule request failed");
        const payload = await response.json();
        if (!Array.isArray(payload?.results)) throw new Error("Invalid launch schedule response");
        const next = payload.results[0];
        if (next?.launch_service_provider?.id === 121 && typeof next.name === "string" &&
          typeof next.net === "string" && Number.isFinite(Date.parse(next.net)) && Date.parse(next.net) > Date.now()) {
          const videos = Array.isArray(next.vid_urls) ? next.vid_urls : [];
          const webcast = videos.find((video: { type?: { name?: string }; url?: string }) =>
            video?.type?.name === "Official Webcast" && readWebcastUrl(video.url));
          launch = {
            name: next.name,
            net: next.net,
            precise: next.status?.abbrev === "Go" && ["Second", "Minute"].includes(next.net_precision?.name),
            webcastUrl: readWebcastUrl(webcast?.url),
            webcastLive: next.webcast_live === true
          };
        }
      } catch {
        failed = true;
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }

      if (!active) return;
      cached = failed
        ? { launch: cached?.launch ?? null, fetchedAt: cached?.fetchedAt ?? 0, retryAt: Date.now() + retryDelay }
        : { launch, fetchedAt: Date.now() };
      setState({ launch: cached.launch, loading: false, stale: failed, fetchedAt: cached.fetchedAt, now: Date.now() });
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
  }, [preview]);

  const remaining = state.launch ? Date.parse(state.launch.net) - state.now : 0;
  const lifetime = remaining > 0 && remaining < launchSoonWindow ? retryDelay : cacheLifetime;
  const age = state.now - state.fetchedAt;
  const fresh = preview || (!state.stale && age >= 0 && age < lifetime);
  const launchingSoon = Boolean(state.launch?.precise && fresh && remaining > 0 && remaining < launchSoonWindow);
  let countdown = state.loading ? "Loading..." : "Check schedule";
  if (state.launch) {
    if (remaining <= 0) {
      countdown = "Awaiting update";
    } else if (!fresh) {
      countdown = "Schedule cached";
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

  return {
    launch: state.launch, countdown, launchingSoon,
    webcastLive: launchingSoon && state.launch?.webcastLive === true,
    stale: !state.loading && !fresh, lastCheckedAt: state.fetchedAt, preview
  };
}