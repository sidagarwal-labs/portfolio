import { Fragment, type MouseEvent, type ReactNode } from "react";
import { fileBlobUrl, resolveImage, resolveLink, type GitHubFile } from "../fileTarget";
import type { Block, Inline, MarkdownDocument } from "../markdown";

/* Heading ids carry GitHub's prefix so a note's headings cannot collide with ids elsewhere in Lab OS. */
export const HEADING_ID_PREFIX = "user-content-";

type RenderContext = {
  file: GitHubFile;
  /* Markdown level + offset = HTML level, so the note's top heading sits below the window title. */
  offset: number;
  onOpenFile: (file: GitHubFile) => void;
  onAnchor: (anchor: string) => void;
};

const isPlainClick = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

function Link({ node, ctx }: { node: Extract<Inline, { type: "link" }>; ctx: RenderContext }) {
  const children = renderInlines(node.children, ctx);
  const link = resolveLink(node.href, ctx.file);
  /* Unsafe or unreadable URLs (javascript:, data:, ...) keep their text but lose the link. */
  if (!link) return <>{children}</>;
  if (link.kind === "external") {
    const mail = link.href.startsWith("mailto:");
    return (
      <a href={link.href} title={node.title} target={mail ? undefined : "_blank"} rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    if (link.kind === "file") ctx.onOpenFile(link.file);
    else ctx.onAnchor(link.anchor);
  };
  return (
    <a href={link.href} title={node.title} onClick={onClick}>
      {children}
    </a>
  );
}

function Image({ node, ctx }: { node: Extract<Inline, { type: "image" }>; ctx: RenderContext }) {
  const src = resolveImage(node.src, ctx.file);
  if (!src) return <>{node.alt}</>;
  return <img src={src} alt={node.alt} title={node.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}

function renderInlines(nodes: Inline[], ctx: RenderContext): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.value}</Fragment>;
      case "code":
        return <code key={index}>{node.value}</code>;
      case "em":
        return <em key={index}>{renderInlines(node.children, ctx)}</em>;
      case "strong":
        return <strong key={index}>{renderInlines(node.children, ctx)}</strong>;
      case "del":
        return <del key={index}>{renderInlines(node.children, ctx)}</del>;
      case "link":
        return <Link key={index} node={node} ctx={ctx} />;
      case "image":
        return <Image key={index} node={node} ctx={ctx} />;
      case "break":
        return <br key={index} />;
      case "footnoteRef": {
        const suffix = node.occurrence > 1 ? `-${node.occurrence}` : "";
        return (
          <sup key={index} className="gh-md__fnref">
            <a
              id={`${HEADING_ID_PREFIX}fnref-${node.id}${suffix}`}
              href={`${fileBlobUrl(ctx.file)}#fn-${encodeURIComponent(node.id)}`}
              aria-describedby="gh-md-footnotes"
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                ctx.onAnchor(`fn-${node.id}`);
              }}
            >
              {node.number}
            </a>
          </sup>
        );
      }
    }
  });
}

type Level = 1 | 2 | 3 | 4 | 5 | 6;

function renderBlocks(blocks: Block[], ctx: RenderContext, tight = false, tail?: ReactNode): ReactNode[] {
  return blocks.map((block, index) => {
    const end = index === blocks.length - 1 ? tail : undefined;
    switch (block.type) {
      case "heading": {
        const Tag = `h${Math.min(6, block.level + ctx.offset) as Level}` as const;
        return (
          <Tag key={index} id={block.id ? `${HEADING_ID_PREFIX}${block.id}` : undefined} className={`gh-md__h gh-md__h${block.level}`} tabIndex={-1}>
            {renderInlines(block.content, ctx)}
          </Tag>
        );
      }
      case "paragraph":
        return tight ? (
          <Fragment key={index}>
            {renderInlines(block.content, ctx)}
            {end}
          </Fragment>
        ) : (
          <p key={index}>
            {renderInlines(block.content, ctx)}
            {end}
          </p>
        );
      case "list": {
        const items = block.items.map((item, itemIndex) => (
          <li key={itemIndex} className={item.checked === null ? undefined : "gh-md__task"}>
            {item.checked !== null && <input type="checkbox" checked={item.checked} disabled readOnly />}
            {renderBlocks(item.children, ctx, block.tight)}
          </li>
        ));
        return block.ordered ? (
          <ol key={index} start={block.start === 1 ? undefined : block.start}>
            {items}
          </ol>
        ) : (
          <ul key={index}>{items}</ul>
        );
      }
      case "table":
        return (
          <div key={index} className="gh-md__table">
            <table>
              <thead>
                <tr>
                  {block.head.map((cell, column) => (
                    <th key={column} style={block.align[column] ? { textAlign: block.align[column]! } : undefined}>
                      {renderInlines(cell, ctx)}
                    </th>
                  ))}
                </tr>
              </thead>
              {block.rows.length > 0 && (
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, column) => (
                        <td key={column} style={block.align[column] ? { textAlign: block.align[column]! } : undefined}>
                          {renderInlines(cell, ctx)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        );
      case "code":
        return (
          <pre key={index} className="gh-md__pre">
            <code data-lang={block.lang || undefined}>{block.value}</code>
          </pre>
        );
      case "blockquote":
        return <blockquote key={index}>{renderBlocks(block.children, ctx)}</blockquote>;
      case "hr":
        return <hr key={index} />;
    }
  });
}

/** The lowest heading level in the document, so the top heading can map to a fixed HTML level. */
export function topHeadingLevel(blocks: Block[]): number {
  let top = 7;
  const visit = (list: Block[]) => {
    for (const block of list) {
      if (block.type === "heading") top = Math.min(top, block.level);
      else if (block.type === "blockquote") visit(block.children);
      else if (block.type === "list") block.items.forEach((item) => visit(item.children));
    }
  };
  visit(blocks);
  return top === 7 ? 1 : top;
}

type MarkdownProps = {
  doc: MarkdownDocument;
  file: GitHubFile;
  /** The HTML level for the document's top heading. */
  topLevel: number;
  onOpenFile: (file: GitHubFile) => void;
  onAnchor: (anchor: string) => void;
};

/** Renders a parsed Markdown document as React elements; nothing is ever inserted as HTML. */
export function Markdown({ doc, file, topLevel, onOpenFile, onAnchor }: MarkdownProps) {
  const ctx: RenderContext = { file, offset: topLevel - topHeadingLevel(doc.blocks), onOpenFile, onAnchor };
  const FootnotesHeading = `h${Math.min(6, topLevel + 1) as Level}` as const;
  return (
    <>
      {renderBlocks(doc.blocks, ctx)}
      {doc.footnotes.length > 0 && (
        <section className="gh-md__footnotes" aria-labelledby="gh-md-footnotes">
          <FootnotesHeading id="gh-md-footnotes" className="sr-only">
            Footnotes
          </FootnotesHeading>
          <ol>
            {doc.footnotes.map((note) => {
              const back = (
                <a
                  className="gh-md__fnback"
                  href={`${fileBlobUrl(file)}#fnref-${encodeURIComponent(note.id)}`}
                  aria-label={`Back to reference ${note.number}`}
                  onClick={(event) => {
                    if (!isPlainClick(event)) return;
                    event.preventDefault();
                    onAnchor(`fnref-${note.id}`);
                  }}
                >
                  ↩
                </a>
              );
              const last = note.children[note.children.length - 1];
              return (
                <li key={note.id} id={`${HEADING_ID_PREFIX}fn-${note.id}`} tabIndex={-1}>
                  {last?.type === "paragraph" ? renderBlocks(note.children, ctx, false, <> {back}</>) : <>{renderBlocks(note.children, ctx)}{back}</>}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
}
