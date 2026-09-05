import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import JournalLayout from "../../components/JournalLayout";
import { profileContent } from "../../content/siteContent";

function ArticlePage() {
  const { slug } = useParams();
  const entry = profileContent.writing.find((article) => article.slug === slug);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${entry?.title ?? "Note not found"} | ${profileContent.shortName}`;
    return () => { document.title = previousTitle; };
  }, [entry]);

  return (
    <JournalLayout>
      <article className="article-page">
        <Link className="small-link" to="/#writing">Back to writing</Link>
        <h1>{entry?.title ?? "Note not found"}</h1>
        {entry ? (
          <>
            <p className="article-meta">{entry.date} &middot; {entry.readTime} read</p>
            <div className="article-body">
              {entry.content.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </>
        ) : <p>This note isn't here. You can find the current writing on the home page.</p>}
      </article>
    </JournalLayout>
  );
}

export default ArticlePage;