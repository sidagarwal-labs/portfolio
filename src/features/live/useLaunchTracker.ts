import { useEffect, useState } from "react";

export type LaunchVideo = {
  url: string;
  title: string;
  publisher: string;
  official: boolean;
  live: boolean;
  priority: number;
  youtubeId?: string;
  image?: string;
};

export type TrackedLaunch = {
  id: string;
  name: string;
  mission: string;
  missionType: string;
  description: string;
  orbit: string;
  rocket: string;
  net: string;
  precision: string;
  windowStart: string;
  windowEnd: string;
  status: { abbrev: string; name: string; description: string };
  pad: string;
  location: string;
  booster?: { serial: string; flight: number | null; landing: string; landingAttempt: boolean; landingSuccess: boolean | null };
  image?: string;
  imageCredit?: string;
  patch?: string;
  infoUrl?: string;
  webcastLive: boolean;
  videos: LaunchVideo[];
};

type FeedCache = { fetchedAt: number; launches: TrackedLaunch[]; retryAt?: number };
type TrackerCache = { upcoming?: FeedCache; previous?: FeedCache };
export type FeedStatus = "loading" | "ready" | "stale" | "unavailable";

const cacheKey = "spacex-tracker-v1";
const base = "https://ll.thespacedevs.com/2.3.0/launches";
/* hide_recent_previous is left off so a launch in flight (or just finished) still comes back from "upcoming". */
const endpoints = {
  upcoming: `${base}/upcoming/?lsp__id=121&limit=6&ordering=net&mode=detailed&format=json`,
  previous: `${base}/previous/?lsp__id=121&limit=9&ordering=-net&mode=detailed&format=json`
};
const minute = 60_000;
const hour = 60 * minute;
const finishedStatuses = ["Success", "Failure", "Partial Failure"];
const timedPrecisions = ["Second", "Minute", "Hour"];

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : "";

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function youtubeId(value: string): string | undefined {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^(www|m)\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:live|embed|shorts)\/([^/]+)/)?.[1] ?? "";
    }
    return /^[\w-]{11}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

function readVideo(value: unknown): LaunchVideo | null {
  const video = record(value);
  const url = safeUrl(video.url);
  if (!url) return null;
  const id = youtubeId(url);
  return {
    url,
    title: text(video.title),
    publisher: text(video.publisher) || text(video.source) || new URL(url).hostname.replace(/^www\./, ""),
    official: text(record(video.type).name) === "Official Webcast",
    live: video.live === true,
    priority: typeof video.priority === "number" && Number.isFinite(video.priority) ? video.priority : 99,
    ...(id ? { youtubeId: id } : {}),
    ...(safeUrl(video.feature_image) ? { image: safeUrl(video.feature_image) } : {})
  };
}

/* Turns one Launch Library 2 result into the small record the page needs (and caches). */
export function readLaunch(value: unknown): TrackedLaunch | null {
  const launch = record(value);
  if (record(launch.launch_service_provider).id !== 121) return null;
  const id = text(launch.id);
  const name = text(launch.name);
  const net = validDate(launch.net);
  if (!id || !name || !net) return null;

  const mission = record(launch.mission);
  const status = record(launch.status);
  const rocket = record(launch.rocket);
  const pad = record(launch.pad);
  const image = record(launch.image);
  const stage = record(Array.isArray(rocket.launcher_stage) ? rocket.launcher_stage[0] : undefined);
  const landing = record(stage.landing);
  const landingLocation = record(landing.landing_location);
  const serial = text(record(stage.launcher).serial_number);
  const patches = Array.isArray(launch.mission_patches) ? launch.mission_patches : [];
  const infoUrls = Array.isArray(launch.info_urls) ? launch.info_urls : [];
  const videos = (Array.isArray(launch.vid_urls) ? launch.vid_urls : []).map(readVideo).filter((video): video is LaunchVideo => video !== null);

  return {
    id,
    name,
    mission: text(mission.name) || name.split("|").pop()?.trim() || name,
    missionType: text(mission.type),
    description: text(mission.description),
    orbit: text(record(mission.orbit).name),
    rocket: text(record(rocket.configuration).full_name) || name.split("|")[0].trim(),
    net,
    precision: text(record(launch.net_precision).name),
    windowStart: validDate(launch.window_start),
    windowEnd: validDate(launch.window_end),
    status: { abbrev: text(status.abbrev) || "TBD", name: text(status.name), description: text(status.description) },
    pad: text(pad.name),
    location: text(record(pad.location).name),
    ...(serial ? {
      booster: {
        serial,
        flight: typeof stage.launcher_flight_number === "number" ? stage.launcher_flight_number : null,
        landing: text(landingLocation.name) || text(landingLocation.abbrev) || text(landing.description),
        landingAttempt: landing.attempt === true,
        landingSuccess: typeof landing.success === "boolean" ? landing.success : null
      }
    } : {}),
    ...(safeUrl(image.image_url) ? { image: safeUrl(image.image_url), imageCredit: text(image.credit) } : {}),
    ...(safeUrl(record(patches[0]).image_url) ? { patch: safeUrl(record(patches[0]).image_url) } : {}),
    ...(safeUrl(record(infoUrls[0]).url) ? { infoUrl: safeUrl(record(infoUrls[0]).url) } : {}),
    webcastLive: launch.webcast_live === true,
    videos
  };
}

/* Cached records are re-checked the same way, since storage is editable. */
function reviveLaunch(value: unknown): TrackedLaunch | null {
  const launch = record(value);
  const status = record(launch.status);
  const net = validDate(launch.net);
  if (!text(launch.id) || !text(launch.name) || !net || !text(status.abbrev)) return null;
  const booster = record(launch.booster);
  const videos = (Array.isArray(launch.videos) ? launch.videos : []).flatMap((value) => {
    const video = record(value);
    const url = safeUrl(video.url);
    if (!url) return [];
    const id = youtubeId(url);
    return [{
      url, title: text(video.title), publisher: text(video.publisher), official: video.official === true, live: video.live === true,
      priority: typeof video.priority === "number" && Number.isFinite(video.priority) ? video.priority : 99,
      ...(id ? { youtubeId: id } : {}),
      ...(safeUrl(video.image) ? { image: safeUrl(video.image) } : {})
    }];
  });
  return {
    id: text(launch.id), name: text(launch.name), mission: text(launch.mission), missionType: text(launch.missionType),
    description: text(launch.description), orbit: text(launch.orbit), rocket: text(launch.rocket), net,
    precision: text(launch.precision), windowStart: validDate(launch.windowStart), windowEnd: validDate(launch.windowEnd),
    status: { abbrev: text(status.abbrev), name: text(status.name), description: text(status.description) },
    pad: text(launch.pad), location: text(launch.location),
    ...(text(booster.serial) ? {
      booster: {
        serial: text(booster.serial),
        flight: typeof booster.flight === "number" ? booster.flight : null,
        landing: text(booster.landing),
        landingAttempt: booster.landingAttempt === true,
        landingSuccess: typeof booster.landingSuccess === "boolean" ? booster.landingSuccess : null
      }
    } : {}),
    ...(safeUrl(launch.image) ? { image: safeUrl(launch.image), imageCredit: text(launch.imageCredit) } : {}),
    ...(safeUrl(launch.patch) ? { patch: safeUrl(launch.patch) } : {}),
    ...(safeUrl(launch.infoUrl) ? { infoUrl: safeUrl(launch.infoUrl) } : {}),
    webcastLive: launch.webcastLive === true,
    videos
  };
}

function readFeed(value: unknown): FeedCache | undefined {
  const feed = record(value);
  if (typeof feed.fetchedAt !== "number" || !Number.isFinite(feed.fetchedAt) || !Array.isArray(feed.launches)) return undefined;
  if (feed.retryAt !== undefined && (typeof feed.retryAt !== "number" || !Number.isFinite(feed.retryAt))) return undefined;
  const launches = feed.launches.map(reviveLaunch).filter((launch): launch is TrackedLaunch => launch !== null);
  return { fetchedAt: feed.fetchedAt, launches, ...(typeof feed.retryAt === "number" ? { retryAt: feed.retryAt } : {}) };
}

function readCache(): TrackerCache {
  try {
    const cached = record(JSON.parse(localStorage.getItem(cacheKey) ?? "null"));
    return { upcoming: readFeed(cached.upcoming), previous: readFeed(cached.previous) };
  } catch {
    return {};
  }
}

function writeCache(cache: TrackerCache) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(cache));
  } catch {
    /* Storage can be full or blocked; the page still has the data in memory. */
  }
}

export const isFinished = (launch: TrackedLaunch) => finishedStatuses.includes(launch.status.abbrev);
export const hasTime = (launch: TrackedLaunch) => timedPrecisions.includes(launch.precision);

export function isLive(launch: TrackedLaunch, now: number) {
  const net = Date.parse(launch.net);
  if (now < net - 3 * hour || now > net + 6 * hour) return false;
  return launch.webcastLive || launch.status.abbrev === "In Flight" || launch.videos.some((video) => video.live);
}

/* Embeddable stream for a launch: live first, then SpaceX's own YouTube upload, then the publisher LL2 ranks highest. */
export function bestYouTube(launch: TrackedLaunch) {
  return launch.videos
    .filter((video) => video.youtubeId)
    .sort((a, b) => Number(b.live) - Number(a.live) || Number(b.official) - Number(a.official) || a.priority - b.priority)[0];
}

export const isOnX = (video: LaunchVideo) => /(^|\.)(x|twitter)\.com$/.test(new URL(video.url).hostname);

/* SpaceX's own broadcast lives on X; other official webcasts (often NASA's) are the fallback. */
export const officialWebcast = (launch: TrackedLaunch) =>
  launch.videos.filter((video) => video.official).sort((a, b) => Number(isOnX(b)) - Number(isOnX(a)) || a.priority - b.priority)[0];

function upcomingLifetime(feed: FeedCache, now: number) {
  const nearLaunch = feed.launches.some((launch) => {
    const net = Date.parse(launch.net);
    return now > net - 2 * hour && now < net + 3 * hour;
  });
  return nearLaunch ? 10 * minute : hour;
}

function previousLifetime(cache: TrackerCache, now: number) {
  const latest = Date.parse(cache.previous?.launches[0]?.net ?? "") || 0;
  const newerLaunchPassed = cache.upcoming?.launches.some((launch) => {
    const net = Date.parse(launch.net);
    return net > latest && net < now;
  });
  return newerLaunchPassed ? 30 * minute : 6 * hour;
}

function due(feed: FeedCache | undefined, lifetime: number, now: number) {
  if (!feed) return true;
  if (feed.retryAt) return now >= feed.retryAt;
  const age = now - feed.fetchedAt;
  return age < 0 || age >= lifetime;
}

function feedStatus(feed: FeedCache | undefined, loading: boolean): FeedStatus {
  if (!feed) return loading ? "loading" : "unavailable";
  if (!feed.fetchedAt) return "unavailable";
  return feed.retryAt ? "stale" : "ready";
}

/* SpaceX schedule and recent history from Launch Library 2, which allows 15 requests an hour without a key.
   Both feeds are cached in localStorage (shared by every tab), refreshed slowly, and more often around a launch. */
export function useLaunchTracker() {
  const [cache, setCache] = useState<TrackerCache>(readCache);
  const [loading, setLoading] = useState<{ upcoming: boolean; previous: boolean }>({ upcoming: true, previous: true });
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let active = true;
    const inFlight = new Set<keyof typeof endpoints>();
    const controllers: AbortController[] = [];

    async function load(feed: keyof typeof endpoints) {
      inFlight.add(feed);
      const controller = new AbortController();
      controllers.push(controller);
      /* Detailed responses can take several seconds when LL2's cache is cold. */
      const timeout = window.setTimeout(() => controller.abort(), 20_000);
      let next: FeedCache;
      try {
        const response = await fetch(endpoints[feed], { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
        const payload = record(await response.json());
        if (!Array.isArray(payload.results)) throw new Error("Unexpected response");
        next = { fetchedAt: Date.now(), launches: payload.results.map(readLaunch).filter((launch): launch is TrackedLaunch => launch !== null) };
      } catch (error) {
        const previous = readCache()[feed];
        const wait = (error as { status?: number }).status === 429 ? 30 * minute : 10 * minute;
        next = { fetchedAt: previous?.fetchedAt ?? 0, launches: previous?.launches ?? [], retryAt: Date.now() + wait };
      } finally {
        window.clearTimeout(timeout);
        inFlight.delete(feed);
      }
      if (!active) return;
      const merged = { ...readCache(), [feed]: next };
      writeCache(merged);
      setCache(merged);
      setLoading((state) => ({ ...state, [feed]: false }));
    }

    function refresh() {
      const time = Date.now();
      setNow(time);
      if (document.visibilityState === "hidden") return;
      /* Another tab may have refreshed the cache already. */
      const latest = readCache();
      setCache(latest);
      const wants = {
        upcoming: due(latest.upcoming, latest.upcoming ? upcomingLifetime(latest.upcoming, time) : 0, time),
        previous: due(latest.previous, previousLifetime(latest, time), time)
      };
      setLoading((state) => ({
        upcoming: state.upcoming && wants.upcoming,
        previous: state.previous && wants.previous
      }));
      for (const feed of ["upcoming", "previous"] as const) {
        if (wants[feed] && !inFlight.has(feed)) void load(feed);
      }
    }

    refresh();
    const interval = window.setInterval(refresh, minute);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      controllers.forEach((controller) => controller.abort());
    };
  }, []);

  /* A launch can show up in both feeds while it finishes; keep the most recently fetched copy. */
  const byId = new Map<string, TrackedLaunch>();
  const feeds = [cache.previous, cache.upcoming].sort((a, b) => (a?.fetchedAt ?? 0) - (b?.fetchedAt ?? 0));
  feeds.forEach((feed) => feed?.launches.forEach((launch) => byId.set(launch.id, launch)));
  const launches = [...byId.values()];
  const upcoming = launches.filter((launch) => !isFinished(launch)).sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
  const previous = launches.filter(isFinished).sort((a, b) => Date.parse(b.net) - Date.parse(a.net)).slice(0, 9);
  const live = upcoming.concat(previous).find((launch) => isLive(launch, now));
  const checkedAt = Math.max(cache.upcoming?.fetchedAt ?? 0, cache.previous?.fetchedAt ?? 0);

  return {
    upcoming,
    previous,
    live,
    now,
    checkedAt,
    status: { upcoming: feedStatus(cache.upcoming, loading.upcoming), previous: feedStatus(cache.previous, loading.previous) }
  };
}
