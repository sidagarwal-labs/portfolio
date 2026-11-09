import { Link } from "react-router-dom";
import JournalLayout from "../../components/JournalLayout";
import { courseworkProjects, currentResearchNotes, earlierBuildoutEditions, selectedProjects } from "../../content/journalContent";
import { profileContent } from "../../content/siteContent";
import { useResearchNoteDates } from "../../hooks/useResearchNoteDates";

const noteDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
});

function NoteDate({ value }: { value: string }) {
  return (
    <time className="entry-meta" dateTime={value} title={`Last GitHub commit: ${value}`}>
      {noteDateFormatter.format(new Date(value))}
    </time>
  );
}

function JournalHomePage() {
  const noteDates = useResearchNoteDates();
  const earlierProjects = profileContent.projects.filter((project) =>
    project.href?.includes("github.com") && !selectedProjects.some((selected) => selected.href === project.href)
  );
  const marketTracker = profileContent.projects.find((project) => project.slug === "ai-llm-stack-tracker");

  return (
    <JournalLayout home>
          <div className="introduction">
            <p>
              I'm Sid, a Senior Product Manager at Microsoft working on search and retrieval
              quality for <a href="https://www.microsoft.com/en-us/microsoft-365-copilot">Microsoft 365 Copilot</a>.
              I started there as a product manager intern in 2021, and since then I've shipped{" "}
              <a href="https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction">Power BI</a> and{" "}
              <a href="https://techcommunity.microsoft.com/blog/viva_engage_blog/viva-engage-public-content-is-now-available-in-microsoft-365-copilot/4443512">Viva Engage</a>{" "}
              as Copilot content sources, led retrieval quality for{" "}
              <a href="https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-copilot-connector">Copilot Connectors</a>,
              and helped take Copilot from zero to over 30 million paid seats.
            </p>
            <p>
              Outside work, I build small software projects and write about AI,
              markets, and the businesses behind the technology.
            </p>
          </div>

          <section className="journal-section" id="lab" aria-labelledby="projects-heading">
            <h2 id="projects-heading">Selected projects</h2>
            <ul className="project-list">
              {selectedProjects.map((project) => (
                <li key={project.href}>
                  <a className="project-title" href={project.websiteHref ?? project.href}>{project.title}</a>
                  {project.websiteHref && (
                    <a className="project-github" href={project.href} aria-label={`${project.title} on GitHub`}>GitHub</a>
                  )}
                  <p>{project.description}</p>
                </li>
              ))}
            </ul>
            <details className="project-archive">
              <summary>Earlier projects</summary>
              <ul>
                {courseworkProjects.map((project) => (
                  <li key={project.href}>
                    <a href={project.href}>{project.title}</a>
                    <span className="project-archive__note"> &middot; {project.note}</span>
                  </li>
                ))}
                {earlierProjects.map((project) => <li key={project.slug}><a href={project.href}>{project.title}</a></li>)}
              </ul>
            </details>
            <a className="small-link" href="https://github.com/sidagarwal-labs?tab=repositories">All repositories on GitHub</a>
          </section>

          <section className="journal-section" id="writing" aria-labelledby="writing-heading">
            <h2 id="writing-heading">Writing &amp; notes</h2>
            {marketTracker && (
              <p className="section-lede">
                I follow the AI buildout: where the capital goes, what becomes a bottleneck,
                and which businesses turn that investment into earnings. My{" "}
                <a href={marketTracker.href}>AI / LLM Stack Tracker</a> maps public
                companies across chips, power, data centers, and applications.
              </p>
            )}
            <ul className="writing-list">
              {currentResearchNotes.map((note) => (
                <li key={note.slug}>
                  <a href={note.href}>{note.title}</a>
                  <NoteDate value={noteDates[note.slug]} />
                </li>
              ))}
              {profileContent.writing.map((entry) => (
                <li key={entry.slug}>
                  <Link to={`/writing/${entry.slug}`}>{entry.title}</Link>
                  <span className="entry-meta">{entry.date}</span>
                </li>
              ))}
            </ul>
            {earlierBuildoutEditions.length > 0 && (
              <details className="project-archive note-archive">
                <summary>Earlier AI buildout editions</summary>
                <ul>
                  {earlierBuildoutEditions.map((note) => (
                    <li key={note.slug}>
                      <a href={note.href}>{note.title}</a> <NoteDate value={noteDates[note.slug]} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="disclaimer">Research for my own learning, not investment advice.</p>
          </section>

          <section className="journal-section" id="impact" aria-labelledby="about-heading">
            <h2 id="about-heading">A little background</h2>
            <p>
              I studied business and operations at UNC Charlotte, with a minor in
              economics. In 2020, I interned as a product manager at Amazon, designing
              weather and route-closure safety alerts for Middle Mile drivers. I also
              captained and mentored <Link to="/robotics">the Pitt Pirates, FRC Team 2642</Link>.
            </p>
            <p>
              I'm now pursuing an M.S. in Data Science and
              Business Analytics.
            </p>
            <a className="small-link" href={profileContent.resumeHref}>Resume (PDF)</a>
          </section>

          <section className="journal-section" id="library" aria-labelledby="reading-heading">
            <h2 id="reading-heading">On my bookshelf</h2>
            <ul className="reading-list">
              {profileContent.books.map((book) => (
                <li key={book.slug}>
                  <img
                    className="book-cover"
                    src={book.cover}
                    alt=""
                    width="34"
                    height="50"
                    loading="lazy"
                    decoding="async"
                    onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                  />
                  <a href={book.href}>{book.title}</a>
                  <span>{book.author}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="journal-section contact-section" id="contact" aria-labelledby="contact-heading">
            <h2 id="contact-heading">Say hello</h2>
            <p>Always happy to talk about AI, products, markets, or a good book.</p>
            <div className="contact-links">
              {profileContent.socials.filter((social) => social.label !== "Resume").map((social) => (
                <a key={social.label} href={social.href}>{social.label}</a>
              ))}
            </div>
          </section>
    </JournalLayout>
  );
}

export default JournalHomePage;