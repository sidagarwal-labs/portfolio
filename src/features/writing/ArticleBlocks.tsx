import { useState, type CSSProperties } from "react";
import type { ArticleBlock } from "../../types/content";
import { articleAssetUrl, headingSlug } from "./articleContent";

type ImageBlock = Extract<ArticleBlock, { type: "image" }>;

function ArticleImage({ block }: { block: ImageBlock }) {
  const [failed, setFailed] = useState(false);
  const ratio = block.width / block.height;
  /* Tall photos get a 4:3 frame on wide screens so they don't fill the page, and their own shape on phones. */
  const style = { "--figure-ratio": Math.max(ratio, 4 / 3), "--figure-ratio-narrow": Math.max(ratio, 3 / 4) } as CSSProperties;
  return (
    <figure className="article-figure" style={style}>
      <div className="article-figure__frame">
        {failed ? (
          <div className="article-figure__missing" role="img" aria-label={`${block.alt} (photo unavailable)`}>
            <span aria-hidden="true">Photo unavailable</span>
          </div>
        ) : (
          <img
            src={articleAssetUrl(block.src)}
            alt={block.alt}
            width={block.width}
            height={block.height}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

/* Renders an article's blocks. Headings start at headingLevel so the article fits under its page or window title. */
export default function ArticleBlocks({ blocks, headingLevel = 2, idPrefix = "" }: { blocks: ArticleBlock[]; headingLevel?: 2 | 3; idPrefix?: string }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${index}`;
        if (typeof block === "string") return <p key={key}>{block}</p>;
        switch (block.type) {
          case "paragraph":
            return <p key={key}>{block.text}</p>;
          case "heading":
            return <Heading key={key} id={`${idPrefix}${headingSlug(block.text)}`} className="article-heading">{block.text}</Heading>;
          case "image":
            return <ArticleImage key={key} block={block} />;
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return <List key={key} className="article-list">{block.items.map((item) => <li key={item}>{item}</li>)}</List>;
          }
          case "note":
            return (
              <div key={key} className="article-note" role="note">
                <p>{block.title && <strong>{block.title} </strong>}{block.text}</p>
              </div>
            );
        }
      })}
    </>
  );
}
