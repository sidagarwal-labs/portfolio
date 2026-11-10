import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import JournalLayout from "../../components/JournalLayout";
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
  type RobotPhoto as RobotPhotoEntry
} from "../../content/robotics";
import MatchPlayer from "./MatchPlayer";

function RobotPhoto({ photo, lead = false }: { photo: RobotPhotoEntry; lead?: boolean }) {
  const [failed, setFailed] = useState(false);

  return (
    <figure className={`robotics-photo${lead ? " robotics-photo--lead" : ""}`}>
      <a className="robotics-photo__image" href={photo.src} aria-label={`Original photo: ${photo.alt}`}>
        {failed ? <span>Photo unavailable</span> : (
          <img src={photo.src} alt={photo.alt} loading={lead ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />
        )}
      </a>
      <figcaption>{photo.caption} <a href={photo.source}>Photo: Pitt Pirates Robotics</a>.</figcaption>
    </figure>
  );
}

function MatchVideo({ match }: { match: FeaturedMatch }) {
  return (
    <section className="robotics-match" aria-labelledby={`match-${match.id}`}>
      <h3 id={`match-${match.id}`}>{match.title}</h3>
      <p className="entry-meta">{match.event}</p>
      <MatchPlayer match={match} className="robotics-video" />
      <p className="robotics-match__result">{match.result}</p>
      <p>{match.description}</p>
      <p className="robotics-media-source">
        <a href={youtubeWatchUrl(match.id)}>Watch on YouTube</a>
        <span>Video: {match.publisher}</span>
        <a href={match.record}>Match record</a>
      </p>
    </section>
  );
}

function RoboticsPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Pitt Pirates, Team 2642 | Sid Agarwal";
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <JournalLayout>
      <article className="article-page robotics-page">
        <Link className="small-link" to="/#impact">Back to background</Link>
        <h1>Pitt Pirates, Team 2642</h1>
        <p className="article-meta">2013-2018 &middot; Team captain, 2017 FIRST Steamworks</p>
        <div className="article-body">
          <p>
            I was part of the Pitt Pirates, FRC Team 2642 in Pitt County, North Carolina,
            from 2013 through 2018. In 2017, I served as team captain for FIRST Steamworks,
            the game with fuel balls, gears, and an endgame rope climb.
          </p>
          <p>
            Our robot that year was Gemini. The team won two district events and competed
            at the FIRST Championship in Houston. These are some of the robots we built,
            matches we played, and team accomplishments from those six seasons.
          </p>

          <RobotPhoto lead photo={leadPhoto} />

          <section className="journal-section" aria-labelledby="robotics-matches-heading">
            <h2 id="robotics-matches-heading">Two matches from my captain season</h2>
            {featuredMatches.map((match) => <MatchVideo key={match.id} match={match} />)}
          </section>

          <section className="journal-section" aria-labelledby="robotics-results-heading">
            <h2 id="robotics-results-heading">What the team accomplished</h2>
            <p>
              During my 2013-2018 tenure, Team 2642 won <strong>five official events</strong> and
              made <strong>four FIRST Championship appearances</strong>: 2014, 2016, 2017,
              and 2018. These are team results, not individual awards.
            </p>
            <ul className="robotics-accolades">
              {robotSeasons.map((season) => (
                <li key={season.year}><a href={seasonHref(season.year)}>{season.year}, {season.robot}</a>: {season.summary}</li>
              ))}
            </ul>
            <p className="robotics-source-note">
              Records: <a href={roboticsTeam.history}>The Blue Alliance</a> and <a href={roboticsTeam.firstRecord}>FIRST</a>.
              Match scores are alliance totals. The Turing result is a division finish, not overall World Championship runner-up.
            </p>
          </section>

          <div className="robotics-gallery">
            {galleryPhotos.map((photo) => <RobotPhoto key={photo.src} photo={photo} />)}
          </div>

          <section className="journal-section" aria-labelledby="robotics-archive-heading">
            <h2 id="robotics-archive-heading">More from the workshop and field</h2>
            <ul className="robotics-archive">
              {archiveVideos.map((video) => (
                <li key={video.href}><a href={video.href}>{video.title}</a>. {video.description}{video.credit && ` Video: ${video.credit}.`}</li>
              ))}
            </ul>
            <p>
              The <a href={roboticsTeam.gallery}>original robot gallery</a> spans all six of my seasons:
              {" "}{robotNames.slice(0, -1).join(", ")}, and {robotNames[robotNames.length - 1]}.
              The team's <a href={robotCode[0].href}>{robotCode[0].label}</a> and <a href={robotCode[1].href}>{robotCode[1].label}</a> are also archived on GitHub.
            </p>
          </section>
        </div>
      </article>
    </JournalLayout>
  );
}

export default RoboticsPage;