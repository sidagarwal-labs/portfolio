import { ArrowUpRight, Play } from "lucide-react";
import { arenaLeader } from "../../content/journalContent";
import type { useSpaceXLaunch } from "../../hooks/useSpaceXLaunch";

const arenaDate = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
}).format(new Date(arenaLeader.leaderboardDate));

export function SpaceXLaunchSignal({ launch, countdown, launchingSoon, webcastLive, stale, lastCheckedAt, preview, duplicate = false }: ReturnType<typeof useSpaceXLaunch> & { duplicate?: boolean }) {
  const checked = lastCheckedAt ? ` Last checked ${new Date(lastCheckedAt).toUTCString()}.` : "";
  const launchTitle = launch
    ? `${preview ? "Simulated countdown preview. " : ""}${launch.name}. No earlier than ${new Date(launch.net).toUTCString()}.${stale ? " Cached schedule; current timing could not be verified." : ""}${checked} Launch schedules can change.`
    : "Launch timing could not be confirmed. Check SpaceX's official schedule. Data from The Space Devs' Launch Library 2.";
  const mission = launch?.name.split(" | ").slice(1).join(" | ") || launch?.name;
  const source = <a className="launch-source" href="https://thespacedevs.com/llapi" title="Launch data by The Space Devs" target="_blank" rel="noopener noreferrer" tabIndex={duplicate ? -1 : undefined}>LL2</a>;

  return (
    <li className={`ticker-item ticker-item--space${launchingSoon ? " ticker-item--launch-soon" : ""}`} title={launchTitle}>
      {launchingSoon ? (
        <>
          <span className="launch-event">
            <span className="launch-event__heading">
              <span className="ticker-item__label">SpaceX</span>
              <span className="launch-event__status">{webcastLive ? "Stream live" : "Launching soon"}</span>
              {preview && <span className="launch-event__preview">Preview</span>}
              {source}
            </span>
            <span className="launch-event__mission">{mission}</span>
            <span className="launch-event__mobile-status">{preview ? "Preview" : webcastLive ? "Stream live" : "Launching soon"}</span>
          </span>
          <strong className="launch-countdown">{countdown}</strong>
          <a
            className="launch-watch"
            href={launch?.webcastUrl ?? "https://www.spacex.com/launches/"}
            aria-label={launch?.webcastUrl ? `Watch ${mission} livestream` : `View ${mission} launch details`}
            title={launch?.webcastUrl ? "Official mission webcast; coverage may not have started yet" : "No official webcast linked yet; open the SpaceX launch schedule"}
            target="_blank" rel="noopener noreferrer" tabIndex={duplicate ? -1 : undefined}
          >
            {launch?.webcastUrl ? <Play size={14} aria-hidden="true" /> : <ArrowUpRight size={14} aria-hidden="true" />}
            <span>{launch?.webcastUrl ? "Watch stream" : "Launch details"}</span>
          </a>
        </>
      ) : (
        <>
          <a href="https://www.spacex.com/launches/" target="_blank" rel="noopener noreferrer" tabIndex={duplicate ? -1 : undefined}>
            <span className="ticker-item__label">SpaceX</span>
            <strong className="launch-countdown">{countdown}</strong>
          </a>
          {source}
        </>
      )}
    </li>
  );
}

function SpaceAndAISignals({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <>
      <li className="ticker-item ticker-item--mars">
        <a href="https://science.nasa.gov/mars/facts/" title="Mars surface gravity, about 38% of Earth's" target="_blank" rel="noopener noreferrer" tabIndex={duplicate ? -1 : undefined}>
          <span className="ticker-item__label">Mars g</span>
          <strong>3.71 m/s<sup>2</sup></strong>
        </a>
      </li>
      <li className="ticker-item ticker-item--arena">
        <a
        href={arenaLeader.href}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={duplicate ? -1 : undefined}
        title={`Highest point-estimate score in Arena Text Overall: ${arenaLeader.score} +/- ${arenaLeader.uncertainty}. Rankings can overlap. Verified ${arenaLeader.checkedAt}.`}
      >
        <span className="ticker-item__label">Highest ELO LLM</span>
        <strong>{arenaLeader.model}</strong>
        <span>{arenaLeader.score}</span>
        <time dateTime={arenaLeader.leaderboardDate}>as of {arenaDate}</time>
        </a>
      </li>
    </>
  );
}

export default SpaceAndAISignals;