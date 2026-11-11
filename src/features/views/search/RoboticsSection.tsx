import { useState } from "react";
import {
  archiveVideos,
  featuredMatches,
  galleryPhotos,
  leadPhoto,
  robotCode,
  robotNames,
  robotSeasons,
  roboticsTeam,
  seasonHref,
  youtubeWatchUrl,
  type FeaturedMatch,
  type RobotPhoto
} from "../../../content/robotics";
import MatchPlayer from "../../robotics/MatchPlayer";
import { describeSource } from "./searchIndex";
import Source from "./Source";
import { useScrollsX } from "./useScrollsX";

const photos = [leadPhoto, ...galleryPhotos];
const [firstYear, lastYear] = roboticsTeam.years.split("-").map(Number);
const eventWins = robotSeasons.reduce((sum, season) => sum + season.wins, 0);
const championships = robotSeasons.filter((season) => season.championship).length;
const captainRobot = robotSeasons.find((season) => season.year === roboticsTeam.captainYear)?.robot;
const teamStats = [
  { value: lastYear - firstYear + 1, label: `seasons, ${roboticsTeam.years}` },
  { value: eventWins, label: "official event wins" },
  { value: championships, label: "FIRST Championships" },
  { value: roboticsTeam.captainYear, label: "captain, and a mentor" }
];
/* robotNames lists one robot per season, so robots from seasons without a result (2015) are named with the gallery. */
const otherRobots = robotNames
  .map((robot, index) => ({ robot, year: firstYear + index }))
  .filter(({ year }) => !robotSeasons.some((season) => season.year === year))
  .map(({ robot, year }) => `${robot} (${year})`);

function ImageResult({ photo }: { photo: RobotPhoto }) {
  const [failed, setFailed] = useState(false);

  return (
    <li>
      <figure className="se-image">
        <a className="se-image__thumb" href={photo.src} aria-label={`Original photo: ${photo.alt}`}>
          {failed ? <span>Photo unavailable</span> : (
            <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
          )}
        </a>
        <figcaption>
          <span className="se-image__caption">{photo.caption.replace(/\.$/, "")}</span>
          <a className="se-image__source" href={photo.source}>{describeSource(photo.source).site}</a>
        </figcaption>
      </figure>
    </li>
  );
}

function VideoResult({ match }: { match: FeaturedMatch }) {
  const [playing, setPlaying] = useState(false);

  return (
    <li className={`se-video${playing ? " is-playing" : ""}`}>
      <MatchPlayer match={match} className="se-video__player" onPlay={() => setPlaying(true)} />
      <div className="se-video__body">
        <h4><a className="se-result__title" href={youtubeWatchUrl(match.id)}>{match.title}</a></h4>
        <p className="se-video__meta">{match.event} · YouTube · {match.publisher}</p>
        <p className="se-result__snippet">
          <span className="se-kind">{match.result}</span> {match.description}{" "}
          <a className="se-video__record" href={match.record}>Match record on The Blue Alliance</a>
        </p>
      </div>
    </li>
  );
}

function RoboticsSection() {
  const [imagesRef, imagesScroll] = useScrollsX<HTMLUListElement>();

  return (
    <section className="se-section se-robotics" id="robotics" aria-labelledby="se-robotics-heading">
      <h2 id="se-robotics-heading">Robotics</h2>

      <article className="se-team" aria-labelledby="se-team-heading">
        <div className="se-team__head">
          <span className="se-team__badge" aria-hidden="true">{roboticsTeam.number}</span>
          <div>
            <h3 id="se-team-heading">{roboticsTeam.name}</h3>
            <p>FRC Team {roboticsTeam.number} · {roboticsTeam.location}</p>
          </div>
        </div>
        <p className="se-team__about">
          I was on the team from 2013 through 2018 and served as captain in {roboticsTeam.captainYear} for {roboticsTeam.captainGame}.
          Our robot that year was {captainRobot}, and the team won two district events and competed at the FIRST Championship in Houston.
        </p>
        <ul className="se-team__stats" aria-label="Team highlights">
          {teamStats.map((stat) => <li key={stat.label}><strong>{stat.value}</strong> <span>{stat.label}</span></li>)}
        </ul>
        <div className="se-panel__actions">
          <a className="se-button se-button--primary" href={roboticsTeam.history}>The Blue Alliance</a>
          <a className="se-button" href={roboticsTeam.firstRecord}>FIRST record</a>
          <a className="se-button" href={roboticsTeam.website}>Team website</a>
        </div>
      </article>

      <h3 className="se-subhead">Season results</h3>
      <Source href={`https://www.thebluealliance.com/team/${roboticsTeam.number}`} />
      <ol className="se-results se-results--seasons">
        {robotSeasons.map((season) => (
          <li className="se-season" key={season.year}>
            <span className="se-season__year" aria-hidden="true">{season.year}</span>
            <div className="se-season__body">
              <h4>
                <a className="se-result__title" href={seasonHref(season.year)}><span className="sr-only">{season.year} season: </span>{season.robot}</a>
              </h4>{" "}
              <p className="se-season__result">{season.summary}</p>{" "}
              {(season.wins > 0 || season.championship) && (
                <ul className="se-chips" aria-label={`${season.year} highlights`}>
                  {season.wins > 0 && <li>{season.wins} event {season.wins === 1 ? "win" : "wins"}</li>}
                  {season.championship && <li>FIRST Championship</li>}
                  {season.year === roboticsTeam.captainYear && <li>My captain season</li>}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="se-note">
        Team results, not individual awards. Match scores are alliance totals, and the 2018 Turing result is a
        division finish. Records: <a href={roboticsTeam.history}>The Blue Alliance</a> and <a href={roboticsTeam.firstRecord}>FIRST</a>.
      </p>

      <h3 className="se-subhead">Images</h3>
      <ul className="se-images" ref={imagesRef} aria-label="Robotics photos" tabIndex={imagesScroll ? 0 : undefined}>
        {photos.map((photo) => <ImageResult key={photo.src} photo={photo} />)}
      </ul>

      <h3 className="se-subhead">Videos</h3>
      <ul className="se-videos">
        {featuredMatches.map((match) => <VideoResult key={match.id} match={match} />)}
      </ul>

      <h3 className="se-subhead">More from the workshop and field</h3>
      <ul className="se-links">
        {archiveVideos.map((video) => (
          <li key={video.href}>
            <a href={video.href}>{video.title}</a>
            <span>{video.description}{video.credit && ` Video: ${video.credit}.`}</span>
          </li>
        ))}
        <li>
          <a href={roboticsTeam.gallery}>Original robot gallery</a>
          <span>All six robots{otherRobots.length > 0 && `, including ${otherRobots.join(" and ")},`} on the Pitt Pirates website.</span>
        </li>
        {robotCode.map((code) => (
          <li key={code.href}>
            <a href={code.href}>{code.label}</a>
            <span>Archived on GitHub.</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default RoboticsSection;
