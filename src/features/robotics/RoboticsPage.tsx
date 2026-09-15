import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Link } from "react-router-dom";
import JournalLayout from "../../components/JournalLayout";

const teamGallery = "https://www.pittpiratesrobotics.com/about-us/our-robots/";

const featuredMatches = [
  {
    id: "23Ge6Ods51A",
    title: "Gemini at the World Championship",
    event: "2017 Houston Championship, Roebling Qualification 14",
    result: "370-255 alliance win",
    description: "Our alliance completed all four rotors and all three endgame climbs. Team 2642 is on the red alliance in this match from my captain season.",
    publisher: "Felix Giffard",
    record: "https://www.thebluealliance.com/match/2017roe_qm14"
  },
  {
    id: "VzhwTXsN2io",
    title: "The match that clinched Raleigh",
    event: "2017 Raleigh District, Final 3",
    result: "305-256 alliance win",
    description: "After losing the first final by one point, our alliance won the next two to take the event. Team 2642 captained the winning alliance with teams 5190 and 6004.",
    publisher: "Team2059Archive",
    record: "https://www.thebluealliance.com/match/2017ncral_f1m3"
  }
];

function RobotPhoto({ src, alt, caption, source = teamGallery, lead = false }: {
  src: string; alt: string; caption: string; source?: string; lead?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <figure className={`robotics-photo${lead ? " robotics-photo--lead" : ""}`}>
      <a className="robotics-photo__image" href={src} aria-label={`Original photo: ${alt}`}>
        {failed ? <span>Photo unavailable</span> : (
          <img src={src} alt={alt} loading={lead ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />
        )}
      </a>
      <figcaption>{caption} <a href={source}>Photo: Pitt Pirates Robotics</a>.</figcaption>
    </figure>
  );
}

function MatchVideo({ match }: { match: typeof featuredMatches[number] }) {
  const [playing, setPlaying] = useState(false);

  return (
    <section className="robotics-match" aria-labelledby={`match-${match.id}`}>
      <h3 id={`match-${match.id}`}>{match.title}</h3>
      <p className="entry-meta">{match.event}</p>
      <div className="robotics-video">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${match.id}?autoplay=1&rel=0`}
            title={match.event}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" className="robotics-video__play" aria-label={`Play ${match.event}`} onClick={() => setPlaying(true)}>
            <img src={`https://i.ytimg.com/vi/${match.id}/hqdefault.jpg`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
            <span className="robotics-video__icon"><Play size={26} aria-hidden="true" /></span>
          </button>
        )}
      </div>
      <p className="robotics-match__result">{match.result}</p>
      <p>{match.description}</p>
      <p className="robotics-media-source">
        <a href={`https://www.youtube.com/watch?v=${match.id}`}>Watch on YouTube</a>
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
        <Link className="small-link" to="/#lab">Back to projects</Link>
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

          <RobotPhoto
            lead
            src="https://www.pittpiratesrobotics.com/wp-content/uploads/2012/01/20170401-11351834.jpg"
            alt="Gemini, Team 2642's 2017 robot, with its gear mechanism and fuel hopper in the pit"
            caption="Gemini, 2017."
          />

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
              <li><a href="https://www.thebluealliance.com/team/2642/2013">2013, Ashley Whippet</a>: Innovation in Control Award at the North Carolina Regional.</li>
              <li><a href="https://www.thebluealliance.com/team/2642/2014">2014, JoJo</a>: North Carolina Regional Chairman's Award and a Championship appearance.</li>
              <li><a href="https://www.thebluealliance.com/team/2642/2016">2016, Excalibot</a>: Wake County district win and District Chairman's Award.</li>
              <li><a href="https://www.thebluealliance.com/team/2642/2017">2017, Gemini</a>: Pitt County and Raleigh district wins, the North Carolina State Championship Chairman's Award, and Raleigh's Industrial Design Award. Third in the district points standings.</li>
              <li><a href="https://www.thebluealliance.com/team/2642/2018">2018, Riptide</a>: Pitt County and UNC Pembroke district wins, including an undefeated 18-0 Pembroke event, and a Turing division-finalist finish at the Houston Championship.</li>
            </ul>
            <p className="robotics-source-note">
              Records: <a href="https://www.thebluealliance.com/team/2642/history">The Blue Alliance</a> and <a href="https://frc-events.firstinspires.org/2017/team/2642">FIRST</a>.
              Match scores are alliance totals. The Turing result is a division finish, not overall World Championship runner-up.
            </p>
          </section>

          <div className="robotics-gallery">
            <RobotPhoto
              src="https://www.pittpiratesrobotics.com/wp-content/uploads/2018/09/20180317-13135308.jpg"
              alt="Riptide, Team 2642's 2018 robot, handling a cube on the competition field"
              caption="Riptide, 2018."
            />
            <RobotPhoto
              src="https://www.pittpiratesrobotics.com/wp-content/uploads/2014/03/ChairmansAward.jpg"
              alt="The Pitt Pirates team with the 2014 North Carolina Regional Chairman's Award"
              caption="The team at the 2014 North Carolina Regional."
              source="https://www.pittpiratesrobotics.com/"
            />
          </div>

          <section className="journal-section" aria-labelledby="robotics-archive-heading">
            <h2 id="robotics-archive-heading">More from the workshop and field</h2>
            <ul className="robotics-archive">
              <li><a href="https://www.youtube.com/watch?v=oVavO59NeDs">2018 Championship: Turing semifinal tiebreaker</a>. A 408-220 alliance win that took Riptide to the division finals. Video: FIRST Robotics Competition.</li>
              <li><a href="https://www.youtube.com/watch?v=p_e_RpT-vnY">2018 UNC Pembroke: Final 2</a>. A 471-220 alliance win to finish the event undefeated. Video: FIRST North Carolina.</li>
              <li><a href="https://www.youtube.com/watch?v=B4OKe2IWJcg">2017 season leading to World Championship</a>. The Pitt Pirates' season recap.</li>
              <li><a href="https://www.youtube.com/watch?v=F51RatuKock">Gemini unveiling</a>. The team's 2017 robot reveal.</li>
              <li><a href="https://www.youtube.com/watch?v=cc83lHpkctc">2017 Chairman's Award video</a>. The team's outreach and community story.</li>
            </ul>
            <p>
              The <a href={teamGallery}>original robot gallery</a> spans all six of my seasons:
              Ashley Whippet, JoJo, The Pickup Line, Excalibot, Gemini, and Riptide.
              The team's <a href="https://github.com/FRC2642/2017Robot">2017 robot code</a> and <a href="https://github.com/FRC2642/2018Robot">2018 robot code</a> are also archived on GitHub.
            </p>
          </section>
        </div>
      </article>
    </JournalLayout>
  );
}

export default RoboticsPage;