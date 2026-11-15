import type { ArticleBlock } from "../../types/content";

/* The readable text of a block, for search. Image file names aren't content, so only alt text and captions count. */
export function articleBlockText(block: ArticleBlock): string {
  if (typeof block === "string") return block;
  switch (block.type) {
    case "paragraph":
    case "heading":
      return block.text;
    case "image":
      return [block.alt, block.caption ?? ""].join(" ").trim();
    case "list":
      return block.items.join(" ");
    case "note":
      return [block.title ?? "", block.text].join(" ").trim();
  }
}

export function articleText(blocks: ArticleBlock[]) {
  return blocks.map(articleBlockText).join(" ");
}

export function headingSlug(text: string) {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/* Paths in content are relative to the site's public folder, so they keep working under a non-root deploy base. */
export function articleAssetUrl(src: string) {
  return /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith("data:") ? src : `${import.meta.env.BASE_URL}${src.replace(/^\/+/, "")}`;
}
