import { useEffect, useState } from "react";
import { ExternalLink, Play, Radio } from "lucide-react";
import LivePageShell from "./LivePageShell";
import {
  bestYouTube, hasTime, isOnX, officialWebcast, useLaunchTracker,
  type LaunchVideo, type TrackedLaunch
} from "./useLaunchTracker";

const timed = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const dated = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthly = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const checked = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

function formatNet(launch: TrackedLaunch) {
  const date = new Date(launch.net);
  if (hasTime(launch)) return timed.format(date);
  if (launch.precision === "Month") return `No earlier than ${monthly.format(date)}`;
  return `No earlier than ${dated.format(date)}`;
}

function fromNow(launch: TrackedLaunch, now: number) {
  const diff = Date.parse(launch.net) - now;
  const days = Math.round(diff / 86_400_000);
  if (Math.abs(days) >= 1) return relative.format(days, "day");
  const hours = Math.round(diff / 3_600_000);
  return Math.abs(hours) >= 1 ? relative.format(hours, "hour") : relative.format(Math.round(diff / 60_000), "minute");
}

const statusTone = (abbrev: string) => {
  if (abbrev === "Success") return "success";
  if (abbrev === "Failure" || abbrev === "Partial Failure") return "failure";
  if (abbrev === "In Flight") return "live";
  if (abbrev === "Go") return "go";
  return "pending";
};

function StatusPill({ launch }: { launch: TrackedLaunch }) {
  return (
    <span className="lt-status" data-tone={statusTone(launch.status.abbrev)} title={launch.status.description || undefined}>
      {launch.status.name || launch.status.abbrev}
    </span>
  );
}

function boosterText(launch: TrackedLaunch) {
  const booster = launch.booster;
  if (!booster) return "";
  const flight = booster.flight ? `, flight ${booster.flight}` : "";
  if (!booster.landingAttempt) return `${booster.serial}${flight}`;
  const where = booster.landing ? ` on ${booster.landing}` : "";
  if (booster.landingSuccess === true) return `${booster.serial}${flight}, landed${where}`;
  if (booster.landingSuccess === false) return `${booster.serial}${flight}, landing failed`;
  return `${booster.serial}${flight}, landing${where}`;
}

/* Its own one-second timer, so only the digits re-render. */
function Countdown({ net }: { net: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const diff = Date.parse(net) - now;
  const total = Math.floor(Math.abs(diff) / 1000);
  const parts = [
    { label: "days", value: Math.floor(total / 86_400) },
    { label: "hrs", value: Math.floor(total / 3600) % 24 },
    { label: "min", value: Math.floor(total / 60) % 60 },
    { label: "sec", value: total % 60 }
  ];
  return (
    <div className="lt-countdown" role="timer" aria-label={diff > 0 ? "Time until launch" : "Time since launch"}>
      <span className="lt-countdown__sign">{diff > 0 ? "T−" : "T+"}</span>
      {parts.map((part) => (
        <span key={part.label} className="lt-countdown__part">
          <strong>{String(part.value).padStart(2, "0")}</strong>
          <small>{part.label}</small>
        </span>
      ))}
    </div>
  );
}

/* Click-to-load YouTube player, so nothing from YouTube loads until someone asks for the video. */
function VideoPlayer({ video, title, action }: { video: LaunchVideo; title: string; action: string }) {
  const [playing, setPlaying] = useState(false);
  if (!video.youtubeId) return null;
  return (
    <figure className="lt-video">
      <div className="lt-video__frame">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" className="lt-video__play" aria-label={`${action}: ${title}`} onClick={() => setPlaying(true)}>
            <img src={`https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
            <span className="lt-video__icon"><Play size={24} aria-hidden="true" /></span>
            <span className="lt-video__action">{action}</span>
          </button>
        )}
      </div>
      <figcaption>
        {video.official ? `${video.publisher || "Official"} webcast` : `${video.publisher || "YouTube"} (unofficial)`} ·{" "}
        <a href={video.url} target="_blank" rel="noopener noreferrer">Open on YouTube</a>
      </figcaption>
    </figure>
  );
}

function Featured({ launch, live }: { launch: TrackedLaunch; live: boolean }) {
  const stream = bestYouTube(launch);
  const webcast = officialWebcast(launch);
  const official = webcast && webcast.url !== stream?.url ? webcast : undefined;
  const booster = boosterText(launch);

  return (
    <section className="lt-hero" aria-labelledby="lt-featured-title" data-live={live ? "" : undefined}>
      {live && (
        <p className="lt-live" role="status">
          <Radio size={16} aria-hidden="true" />
          <strong>Live now</strong>
          <span>{stream ? "Watch the stream below, right here." : "The broadcast is on."}</span>
          {official && <a href={official.url} target="_blank" rel="noopener noreferrer">{isOnX(official) ? "SpaceX broadcast on X" : `${official.publisher || "Official"} broadcast`}</a>}
        </p>
      )}
      <div className="lt-hero__grid">
        <div className="lt-hero__body">
          <p className="live-label">{live ? "Now launching" : "Next SpaceX launch"}</p>
          <div className="lt-hero__title">
            {launch.patch && <img src={launch.patch} alt="" width="64" height="64" loading="lazy" />}
            <div>
              <h2 id="lt-featured-title">{launch.mission}</h2>
              <p>{launch.rocket}{launch.pad ? ` · ${launch.pad}` : ""}{launch.location ? `, ${launch.location}` : ""}</p>
            </div>
          </div>
          {hasTime(launch) ? <Countdown net={launch.net} /> : <p className="lt-tentative">Launch time not set yet.</p>}
          <dl className="lt-facts">
            <div><dt>Target</dt><dd>{formatNet(launch)}</dd></div>
            <div><dt>Status</dt><dd><StatusPill launch={launch} /></dd></div>
            {launch.orbit && <div><dt>Orbit</dt><dd>{launch.orbit}</dd></div>}
            {booster && <div><dt>Booster</dt><dd>{booster}</dd></div>}
          </dl>
          {launch.description && <p className="lt-hero__description">{launch.description}</p>}
          <p className="lt-actions">
            {official && (
              <a href={official.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={15} aria-hidden="true" /> {isOnX(official) ? "Official webcast on X" : `${official.publisher || "Official"} webcast`}
              </a>
            )}
            {launch.infoUrl && (
              <a href={launch.infoUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={15} aria-hidden="true" /> Mission page
              </a>
            )}
          </p>
        </div>
        <div className="lt-hero__media">
          {stream ? (
            <VideoPlayer key={stream.youtubeId} video={stream} title={`${launch.name} ${live ? "live stream" : "webcast"}`} action={live ? "Watch live here" : "Watch here"} />
          ) : launch.image ? (
            <figure className="lt-photo">
              <img src={launch.image} alt="" loading="lazy" />
              {launch.imageCredit && <figcaption>Image: {launch.imageCredit}</figcaption>}
            </figure>
          ) : null}
          {!stream && !live && <p className="lt-media-note">A stream to watch here usually appears about an hour before liftoff.</p>}
        </div>
      </div>
    </section>
  );
}

function PreviousCard({ launch }: { launch: TrackedLaunch }) {
  const replay = bestYouTube(launch);
  const webcast = officialWebcast(launch);
  const official = webcast && webcast.url !== replay?.url ? webcast : undefined;
  const booster = boosterText(launch);
  return (
    <li className="lt-card">
      {replay ? (
        <VideoPlayer video={replay} title={`${launch.name} replay`} action="Watch replay" />
      ) : (
        <div className="lt-card__art">
          {launch.image || launch.patch ? <img src={launch.image ?? launch.patch} alt="" loading="lazy" /> : null}
        </div>
      )}
      <div className="lt-card__body">
        <p className="lt-card__meta"><time dateTime={launch.net}>{shortDay.format(new Date(launch.net))}</time> <StatusPill launch={launch} /></p>
        <h3>{launch.mission}</h3>
        <p className="lt-card__detail">{launch.rocket}{launch.orbit ? ` · ${launch.orbit}` : ""}</p>
        {booster && <p className="lt-card__detail">{booster}</p>}
        {official && (
          <p className="lt-card__links">
            <a href={official.url} target="_blank" rel="noopener noreferrer">{isOnX(official) ? "SpaceX webcast on X" : `${official.publisher || "Official"} webcast`}</a>
          </p>
        )}
      </div>
    </li>
  );
}

function LaunchesPage() {
  const { upcoming, previous, live, now, checkedAt, status } = useLaunchTracker();
  const featured = live ?? upcoming[0];
  const later = upcoming.filter((launch) => launch.id !== featured?.id).slice(0, 5);
  const stale = status.upcoming === "stale" || status.previous === "stale";

  return (
    <LivePageShell
      section="launches"
      title="SpaceX launch tracker"
      documentTitle="SpaceX launches"
      lede="Every upcoming SpaceX launch with a live countdown, streams you can watch right here, and replays of recent flights."
      meta={checkedAt ? `Schedule checked at ${checked.format(new Date(checkedAt))}${stale ? " (saved copy; the next check is retrying)" : ""}.` : undefined}
      sources={<p>Launch data from <a href="https://thespacedevs.com/llapi" target="_blank" rel="noopener noreferrer">Launch Library 2 by The Space Devs</a>. Videos belong to their publishers, and SpaceX's own broadcasts are on <a href="https://x.com/SpaceX" target="_blank" rel="noopener noreferrer">X</a>. This page is not affiliated with SpaceX.</p>}
    >
      {featured ? (
        <Featured launch={featured} live={Boolean(live)} />
      ) : (
        <section className="lt-hero lt-hero--empty" aria-labelledby="lt-featured-title">
          <h2 id="lt-featured-title">Next SpaceX launch</h2>
          <p role="status">
            {status.upcoming === "loading" ? "Loading the SpaceX schedule..." :
              status.upcoming === "unavailable" ? <>The launch schedule could not load right now. <a href="https://www.spacex.com/launches/" target="_blank" rel="noopener noreferrer">See SpaceX's launch page</a>.</> :
                "No SpaceX launches are on the schedule right now."}
          </p>
        </section>
      )}

      {later.length > 0 && (
        <section className="live-section" aria-labelledby="lt-upcoming-title">
          <h2 id="lt-upcoming-title" className="live-section__title">Coming up</h2>
          <ol className="lt-upcoming">
            {later.map((launch) => (
              <li key={launch.id}>
                <time dateTime={launch.net} className="lt-upcoming__date">
                  <small>{new Date(launch.net).toLocaleDateString("en-US", { month: "short", timeZone: hasTime(launch) ? undefined : "UTC" })}</small>
                  <strong>{new Date(launch.net).toLocaleDateString("en-US", { day: "numeric", timeZone: hasTime(launch) ? undefined : "UTC" })}</strong>
                </time>
                <div className="lt-upcoming__body">
                  <h3>{launch.mission}</h3>
                  <p>{launch.rocket}{launch.pad ? ` · ${launch.pad}` : ""}</p>
                  <p className="lt-upcoming__when">{formatNet(launch)}{hasTime(launch) ? ` · ${fromNow(launch, now)}` : ""}</p>
                </div>
                <StatusPill launch={launch} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="live-section" aria-labelledby="lt-previous-title">
        <h2 id="lt-previous-title" className="live-section__title">Recent launches</h2>
        {previous.length ? (
          <ul className="lt-grid">
            {previous.map((launch) => <PreviousCard key={launch.id} launch={launch} />)}
          </ul>
        ) : (
          <p className="live-empty" role="status">
            {status.previous === "loading" ? "Loading recent launches..." :
              status.previous === "unavailable" ? "Recent launches could not load right now." : "No recent SpaceX launches to show."}
          </p>
        )}
      </section>
    </LivePageShell>
  );
}

export default LaunchesPage;
