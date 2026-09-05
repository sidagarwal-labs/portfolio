import { arenaLeader } from "../../content/journalContent";
import { useSpaceXLaunch } from "../../hooks/useSpaceXLaunch";

const arenaDate = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
}).format(new Date(arenaLeader.leaderboardDate));

function SpaceAndAISignals({ launch, countdown, duplicate = false }: ReturnType<typeof useSpaceXLaunch> & { duplicate?: boolean }) {
  const launchTitle = launch
    ? `${launch.name}. No earlier than ${new Date(launch.net).toUTCString()}. Launch schedules can change.`
    : "Next SpaceX launch. Schedule from The Space Devs' Launch Library 2.";

  return (
    <>
      <li className="ticker-item ticker-item--space" title={launchTitle}>
        <a href="https://www.spacex.com/launches/" target="_blank" rel="noopener noreferrer" tabIndex={duplicate ? -1 : undefined}>
          <span className="ticker-item__label">SpaceX</span>
          <strong className="launch-countdown">{countdown}</strong>
        </a>
        <a href="https://thespacedevs.com/llapi" title="Launch data by The Space Devs" target="_blank" rel="noopener noreferrer" tabIndex={duplicate ? -1 : undefined}>LL2</a>
      </li>
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