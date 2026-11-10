/**
 * A small GitHub-flavored Markdown parser for research notes. It returns a plain tree that the file view renders
 * as React elements, so nothing here is ever HTML: raw HTML stays literal text (comments are dropped and <br> is
 * a line break), and link and image URLs are kept raw for the renderer to resolve and allowlist.
 *
 * Supported: ATX and setext headings, paragraphs, nested ordered/unordered/task lists, GFM tables with alignment,
 * fenced and indented code, blockquotes, thematic breaks, inline and reference links, images, autolinks (including
 * bare URLs), emphasis, strong, strikethrough, code spans, escapes, entities, hard breaks, and footnotes.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "em" | "strong" | "del"; children: Inline[] }
  | { type: "link"; href: string; title?: string; children: Inline[] }
  | { type: "image"; src: string; alt: string; title?: string }
  | { type: "break" }
  | { type: "footnoteRef"; id: string; number: number; occurrence: number };

export type Align = "left" | "center" | "right" | null;

type BlockOf<I> =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; id: string; content: I }
  | { type: "paragraph"; content: I }
  | { type: "list"; ordered: boolean; start: number; tight: boolean; items: { checked: boolean | null; children: BlockOf<I>[] }[] }
  | { type: "table"; align: Align[]; head: I[]; rows: I[][] }
  | { type: "code"; lang: string; value: string }
  | { type: "blockquote"; children: BlockOf<I>[] }
  | { type: "hr" };

export type Block = BlockOf<Inline[]>;
export type ListItem = Extract<Block, { type: "list" }>["items"][number];
export type Footnote = { id: string; number: number; children: Block[] };
export type MarkdownDocument = { blocks: Block[]; footnotes: Footnote[] };

type RawBlock = BlockOf<string>;
type LinkDef = { href: string; title?: string };
type Context = {
  defs: Map<string, LinkDef>;
  notes: Map<string, RawBlock[]>;
  /* Footnotes in order of first reference. */
  noteOrder: Map<string, { id: string; number: number; refs: number }>;
  slug: (text: string) => string;
};

/* ---------- Shared helpers ---------- */

const PUNCT = /[\p{P}\p{S}]/u;
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const isSpace = (char: string) => char === "" || /\s/.test(char);
const isPunct = (char: string) => PUNCT.test(char);
const isBlank = (line: string) => /^[ \t]*$/.test(line);
const indentOf = (line: string) => line.length - line.replace(/^ +/, "").length;

/** Link labels match case-insensitively with collapsed whitespace. */
export const normalizeLabel = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();

/** GitHub's heading id: lowercase, punctuation other than "-" and "_" removed, spaces to hyphens. */
export const slugBase = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");

/** Repeated headings get "-1", "-2", ... like GitHub. */
export function createSlugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugBase(text);
    let slug = base;
    while (seen.has(slug)) {
      const next = (seen.get(base) ?? 0) + 1;
      seen.set(base, next);
      slug = `${base}-${next}`;
    }
    seen.set(slug, 0);
    return slug;
  };
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", copy: "©", reg: "®", trade: "™", hellip: "…",
  mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", times: "×",
  divide: "÷", deg: "°", plusmn: "±", middot: "·", bull: "•", rarr: "→", larr: "←", harr: "↔", uarr: "↑", darr: "↓",
  le: "≤", ge: "≥", ne: "≠", asymp: "≈", euro: "€", pound: "£", yen: "¥", cent: "¢", sect: "§", para: "¶",
  frac12: "½", frac14: "¼", frac34: "¾", sup2: "²", sup3: "³", micro: "µ", check: "✓", hyphen: "‐", shy: "\u00ad"
};
const ENTITY = /^&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/;

function decodeEntity(match: RegExpExecArray): string | null {
  if (match[3]) return ENTITIES[match[3]] ?? null;
  const code = match[1] ? Number.parseInt(match[1], 10) : Number.parseInt(match[2], 16);
  return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "\ufffd" : String.fromCodePoint(code);
}

/** Backslash escapes and entities in link destinations, titles, and code info strings. */
function unescapeText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "\\" && ASCII_PUNCT.test(value[i + 1] ?? "")) {
      out += value[++i];
    } else if (char === "&") {
      const match = ENTITY.exec(value.slice(i));
      const decoded = match && decodeEntity(match);
      if (match && decoded !== null) {
        out += decoded;
        i += match[0].length - 1;
      } else out += char;
    } else out += char;
  }
  return out;
}

/* ---------- Blocks ---------- */

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const ATX = /^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$/;
const HR = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const QUOTE = /^ {0,3}> ?/;
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;
const MARKER = /^( {0,3})([-+*]|\d{1,9}[.)])( *)(.*)$/;
const TABLE_DELIM = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const LINK_DEF = /^ {0,3}\[((?:[^\]\\]|\\.){1,999})\]:[ \t]*(<[^>\n]*>|\S+)(?:[ \t]+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^)\\]|\\.)*\)))?[ \t]*$/;
const FOOTNOTE_DEF = /^ {0,3}\[\^([^\]\s]{1,100})\]:[ \t]?(.*)$/;
const TASK = /^\[([ xX])\][ \t]+/;

type Marker = { indent: number; ordered: boolean; kind: string; start: number; contentIndent: number; rest: string };

function listMarker(line: string): Marker | null {
  const match = MARKER.exec(line);
  if (!match || (match[3] === "" && match[4] !== "")) return null;
  const [, lead, marker, spaces, rest] = match;
  const ordered = /\d/.test(marker);
  const width = lead.length + marker.length;
  const empty = rest === "";
  /* Five or more spaces after the marker start indented code inside the item. */
  const gap = empty || spaces.length > 4 ? 1 : spaces.length;
  return {
    indent: lead.length,
    ordered,
    kind: ordered ? marker.slice(-1) : marker,
    start: ordered ? Number.parseInt(marker, 10) : 1,
    contentIndent: width + gap,
    rest: empty ? "" : spaces.slice(gap) + rest
  };
}

const startsBlock = (line: string) => ATX.test(line) || FENCE.test(line) || HR.test(line) || QUOTE.test(line) || listMarker(line) !== null;

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < row.length; i++) {
    if (row[i] === "\\" && row[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (row[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else cell += row[i];
  }
  cells.push(cell.trim());
  return cells;
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  return left && right ? "center" : right ? "right" : left ? "left" : null;
}

function parseBlocks(lines: string[], ctx: Context): RawBlock[] {
  const out: RawBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: "paragraph", content: para.join("\n") });
    para = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      flush();
      i++;
      continue;
    }

    if (para.length && SETEXT.test(line)) {
      out.push({ type: "heading", level: line.trim()[0] === "=" ? 1 : 2, id: "", content: para.join("\n") });
      para = [];
      i++;
      continue;
    }

    if (!para.length && /^ {4}/.test(line)) {
      const code: string[] = [];
      while (i < lines.length && (isBlank(lines[i]) || /^ {4}/.test(lines[i]))) code.push(lines[i++].slice(4));
      while (code.length && isBlank(code[code.length - 1])) code.pop();
      out.push({ type: "code", lang: "", value: code.join("\n") });
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence && !(fence[2][0] === "`" && fence[3].includes("`"))) {
      flush();
      const [, lead, marker, info] = fence;
      const code: string[] = [];
      i++;
      while (i < lines.length) {
        const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[i]);
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) {
          i++;
          break;
        }
        code.push(lines[i].slice(Math.min(lead.length, indentOf(lines[i]))));
        i++;
      }
      out.push({ type: "code", lang: unescapeText(info.trim().split(/\s+/)[0] ?? ""), value: code.join("\n") });
      continue;
    }

    const atx = ATX.exec(line);
    if (atx) {
      flush();
      const text = atx[2].trim().replace(/(^|[ \t])#+$/, "$1").trim();
      out.push({ type: "heading", level: atx[1].length as 1 | 2 | 3 | 4 | 5 | 6, id: "", content: text });
      i++;
      continue;
    }

    if (HR.test(line)) {
      flush();
      out.push({ type: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      flush();
      const quoted: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        if (QUOTE.test(next)) quoted.push(next.replace(QUOTE, ""));
        /* A lazy line continues the quote's paragraph. */ else if (!isBlank(next) && quoted.length && !isBlank(quoted[quoted.length - 1]) && !startsBlock(next)) quoted.push(next);
        else break;
        i++;
      }
      out.push({ type: "blockquote", children: parseBlocks(quoted, ctx) });
      continue;
    }

    const marker = HR.test(line) ? null : listMarker(line);
    /* Only a bullet or a list starting at 1, with content, may interrupt a paragraph. */
    if (marker && !(para.length && (marker.rest === "" || (marker.ordered && marker.start !== 1)))) {
      flush();
      i = parseList(lines, i, out, ctx);
      continue;
    }

    if (/^ {0,3}<!--/.test(line)) {
      flush();
      while (i < lines.length && !lines[i].includes("-->")) i++;
      i++;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1])) {
      const head = splitRow(line);
      const delims = splitRow(lines[i + 1]);
      if (head.length === delims.length) {
        flush();
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) {
          const cells = splitRow(lines[i++]);
          rows.push(head.map((_, column) => cells[column] ?? ""));
        }
        out.push({ type: "table", align: delims.map(alignOf), head, rows });
        continue;
      }
    }

    if (!para.length) {
      const note = FOOTNOTE_DEF.exec(line);
      if (note) {
        const body = [note[2]];
        i++;
        while (i < lines.length && (/^ {4}/.test(lines[i]) || (isBlank(lines[i]) && /^ {4}/.test(lines[i + 1] ?? "")) || (!isBlank(lines[i]) && !isBlank(body[body.length - 1]) && !startsBlock(lines[i]) && !FOOTNOTE_DEF.test(lines[i])))) {
          body.push(lines[i].replace(/^ {4}/, ""));
          i++;
        }
        const label = normalizeLabel(note[1]);
        if (!ctx.notes.has(label)) ctx.notes.set(label, parseBlocks(body, ctx));
        continue;
      }
      const def = LINK_DEF.exec(line);
      if (def) {
        const label = normalizeLabel(def[1]);
        const href = def[2].startsWith("<") ? def[2].slice(1, -1) : def[2];
        if (label && !ctx.defs.has(label)) ctx.defs.set(label, { href: unescapeText(href), title: def[3] ? unescapeText(def[3].slice(1, -1)) : undefined });
        i++;
        continue;
      }
    }

    para.push(line.replace(/^[ \t]+/, ""));
    i++;
  }
  flush();
  return out;
}

function parseList(lines: string[], start: number, out: RawBlock[], ctx: Context): number {
  const first = listMarker(lines[start])!;
  const items: { checked: boolean | null; children: RawBlock[] }[] = [];
  let tight = true;
  let i = start;

  while (i < lines.length) {
    const marker = HR.test(lines[i]) ? null : listMarker(lines[i]);
    if (!marker || marker.ordered !== first.ordered || marker.kind !== first.kind) break;
    const body = [marker.rest];
    let blank = false;
    i++;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) {
        body.push("");
        blank = true;
        i++;
        continue;
      }
      const indent = indentOf(line);
      if (indent >= marker.contentIndent) {
        /* A blank line between two blocks of this item (not of a nested list) makes the list loose. */
        if (blank && indent < marker.contentIndent + 2 && body.some((entry) => !isBlank(entry))) tight = false;
        body.push(line.slice(marker.contentIndent));
        blank = false;
        i++;
        continue;
      }
      if (blank || startsBlock(line)) break;
      body.push(line.replace(/^ +/, ""));
      i++;
    }
    while (body.length && isBlank(body[body.length - 1])) body.pop();
    if (blank && i < lines.length) {
      const next = HR.test(lines[i]) ? null : listMarker(lines[i]);
      if (next && next.ordered === first.ordered && next.kind === first.kind) tight = false;
    }
    const task = TASK.exec(body[0] ?? "");
    if (task) body[0] = body[0].slice(task[0].length);
    items.push({ checked: task ? task[1] !== " " : null, children: parseBlocks(body, ctx) });
  }

  out.push({ type: "list", ordered: first.ordered, start: first.start, tight, items });
  return i;
}

/* ---------- Inlines ---------- */

type Delim = { type: "delim"; char: "*" | "_" | "~"; count: number; length: number; canOpen: boolean; canClose: boolean };
type Node = Inline | Delim;

const isDelim = (node: Node): node is Delim => node.type === "delim";
const BARE_URL = /^(?:https?:\/\/|www\.)[^\s<]*/i;
const AUTOLINK = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/;
const EMAIL_AUTOLINK = /^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)>/;
const BREAK_TAG = /^<br\s*\/?>/i;
const SPECIAL = new Set(["\\", "`", "!", "[", "<", "*", "_", "~", "&", "\n"]);

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text" || node.type === "code") return node.value;
      if (node.type === "em" || node.type === "strong" || node.type === "del" || node.type === "link") return inlineText(node.children);
      return "";
    })
    .join("");
}

/** Plain text of inline content, e.g. a heading's text for its id. */
export const plainText = inlineText;

/* Finds the "]" closing the "[" at `start`, skipping escapes, code spans, and nested brackets. */
function labelEnd(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length && i - start < 1000; i++) {
    const char = src[i];
    if (char === "\\") i++;
    else if (char === "`") {
      const run = /^`+/.exec(src.slice(i))![0];
      const close = src.indexOf(run, i + run.length);
      if (close > 0) i = close + run.length - 1;
      else i += run.length - 1;
    } else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) return i;
  }
  return -1;
}

type LinkParts = { end: number; label: string; href: string; title?: string };

/* "[label](dest "title")", "[label][ref]", "[label][]", or "[label]" with a definition. */
function linkAt(src: string, start: number, ctx: Context): LinkParts | null {
  const close = labelEnd(src, start);
  if (close < 0) return null;
  const label = src.slice(start + 1, close);
  let p = close + 1;

  if (src[p] === "(") {
    p++;
    while (/[ \t\n]/.test(src[p] ?? "")) p++;
    let href = "";
    if (src[p] === "<") {
      const end = src.indexOf(">", p);
      if (end < 0 || src.slice(p, end).includes("\n")) return null;
      href = src.slice(p + 1, end);
      p = end + 1;
    } else {
      let depth = 0;
      const from = p;
      while (p < src.length) {
        const char = src[p];
        if (char === "\\" && ASCII_PUNCT.test(src[p + 1] ?? "")) p += 2;
        else if (/[\s\u0000-\u001f]/.test(char)) break;
        else if (char === "(") {
          depth++;
          p++;
        } else if (char === ")") {
          if (depth === 0) break;
          depth--;
          p++;
        } else p++;
      }
      href = src.slice(from, p);
    }
    let title: string | undefined;
    const beforeTitle = p;
    while (/[ \t\n]/.test(src[p] ?? "")) p++;
    const quote = src[p];
    if (p > beforeTitle && (quote === '"' || quote === "'" || quote === "(")) {
      const closer = quote === "(" ? ")" : quote;
      let q = p + 1;
      while (q < src.length && src[q] !== closer) q += src[q] === "\\" ? 2 : 1;
      if (q >= src.length) return null;
      title = unescapeText(src.slice(p + 1, q));
      p = q + 1;
      while (/[ \t\n]/.test(src[p] ?? "")) p++;
    }
    if (src[p] !== ")") return null;
    return { end: p + 1, label, href: unescapeText(href), title };
  }

  if (src[p] === "[") {
    const refEnd = labelEnd(src, p);
    if (refEnd > 0) {
      const ref = src.slice(p + 1, refEnd);
      const def = ctx.defs.get(normalizeLabel(ref || label));
      return def ? { end: refEnd + 1, label, ...def } : null;
    }
  }
  const def = ctx.defs.get(normalizeLabel(label));
  return def ? { end: p, label, ...def } : null;
}

/* GFM extended autolinks: trailing punctuation and an unbalanced ")" are not part of the URL. */
function bareUrlEnd(url: string): string {
  let end = url.length;
  for (;;) {
    const last = url[end - 1];
    if (/[?!.,:*_~'"]/.test(last)) end--;
    else if (last === ")" && (url.slice(0, end).match(/\(/g)?.length ?? 0) < (url.slice(0, end).match(/\)/g)?.length ?? 0)) end--;
    else if (last === ";" && /&[A-Za-z0-9]+;$/.test(url.slice(0, end))) end = url.slice(0, end).lastIndexOf("&");
    else break;
  }
  return url.slice(0, end);
}

function parseInline(src: string, ctx: Context, links = true): Inline[] {
  const nodes: Node[] = [];
  let text = "";
  const flush = () => {
    if (text) nodes.push({ type: "text", value: text });
    text = "";
  };
  const push = (node: Node) => {
    flush();
    nodes.push(node);
  };

  let pos = 0;
  while (pos < src.length) {
    const char = src[pos];
    const rest = src.slice(pos, pos + 2048);

    if (char === "\\") {
      const next = src[pos + 1] ?? "";
      if (next === "\n") {
        push({ type: "break" });
        pos += 2;
      } else if (ASCII_PUNCT.test(next)) {
        text += next;
        pos += 2;
      } else {
        text += char;
        pos++;
      }
      continue;
    }

    if (char === "`") {
      const run = /^`+/.exec(rest)![0];
      let close = src.indexOf(run, pos + run.length);
      while (close > 0 && (src[close + run.length] === "`" || src[close - 1] === "`")) close = src.indexOf(run, close + 1);
      if (close < 0) {
        text += run;
        pos += run.length;
        continue;
      }
      let code = src.slice(pos + run.length, close).replace(/\n/g, " ");
      if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
      push({ type: "code", value: code });
      pos = close + run.length;
      continue;
    }

    if (char === "!" && src[pos + 1] === "[") {
      const link = linkAt(src, pos + 1, ctx);
      if (link) {
        push({ type: "image", src: link.href, alt: inlineText(parseInline(link.label, ctx, false)), title: link.title });
        pos = link.end;
        continue;
      }
      text += char;
      pos++;
      continue;
    }

    if (char === "[") {
      const note = /^\[\^([^\]\s]{1,100})\]/.exec(rest);
      const label = note && normalizeLabel(note[1]);
      if (label && ctx.notes.has(label)) {
        let entry = ctx.noteOrder.get(label);
        if (!entry) {
          entry = { id: slugBase(label) || String(ctx.noteOrder.size + 1), number: ctx.noteOrder.size + 1, refs: 0 };
          ctx.noteOrder.set(label, entry);
        }
        entry.refs++;
        push({ type: "footnoteRef", id: entry.id, number: entry.number, occurrence: entry.refs });
        pos += note[0].length;
        continue;
      }
      const link = links ? linkAt(src, pos, ctx) : null;
      if (link) {
        push({ type: "link", href: link.href, title: link.title, children: parseInline(link.label, ctx, false) });
        pos = link.end;
        continue;
      }
      text += char;
      pos++;
      continue;
    }

    if (char === "<") {
      if (rest.startsWith("<!--")) {
        const end = src.indexOf("-->", pos + 4);
        if (end >= 0) {
          pos = end + 3;
          continue;
        }
      }
      const auto = AUTOLINK.exec(rest);
      const email = auto ? null : EMAIL_AUTOLINK.exec(rest);
      if (auto || email) {
        const target = (auto ?? email)![1];
        const href = email ? `mailto:${target}` : target;
        if (links) push({ type: "link", href, children: [{ type: "text", value: target }] });
        else text += target;
        pos += (auto ?? email)![0].length;
        continue;
      }
      const br = BREAK_TAG.exec(rest);
      if (br) {
        push({ type: "break" });
        pos += br[0].length;
        continue;
      }
      text += char;
      pos++;
      continue;
    }

    if (char === "*" || char === "_" || char === "~") {
      const run = (char === "~" ? /^~+/ : char === "*" ? /^\*+/ : /^_+/).exec(rest)![0];
      const before = src[pos - 1] ?? "";
      const after = src[pos + run.length] ?? "";
      const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
      const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
      if (char === "~" && run.length > 2) text += run;
      else
        push({
          type: "delim",
          char,
          count: run.length,
          length: run.length,
          canOpen: char === "_" ? left && (!right || isPunct(before)) : left,
          canClose: char === "_" ? right && (!left || isPunct(after)) : right
        });
      pos += run.length;
      continue;
    }

    if (char === "&") {
      const match = ENTITY.exec(rest);
      const decoded = match && decodeEntity(match);
      if (match && decoded !== null) {
        text += decoded;
        pos += match[0].length;
        continue;
      }
      text += char;
      pos++;
      continue;
    }

    if (char === "\n") {
      const hard = / {2,}$/.test(text);
      text = text.replace(/ +$/, "");
      if (hard) push({ type: "break" });
      else text += "\n";
      pos++;
      while (src[pos] === " ") pos++;
      continue;
    }

    if (links && /[hHwW]/.test(char) && (pos === 0 || /[\s*_~(]/.test(src[pos - 1]))) {
      const match = BARE_URL.exec(rest);
      const url = match ? bareUrlEnd(match[0]) : "";
      const domain = url.replace(/^(?:https?:\/\/)/i, "").split(/[/?#]/)[0];
      if (url && /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*(?::\d+)?$/.test(domain) && (domain.includes(".") || /^https?:\/\/localhost/i.test(url))) {
        push({ type: "link", href: /^www\./i.test(url) ? `http://${url}` : url, children: [{ type: "text", value: url }] });
        pos += url.length;
        continue;
      }
    }

    let end = pos + 1;
    while (end < src.length && !SPECIAL.has(src[end]) && !/[hHwW]/.test(src[end])) end++;
    text += src.slice(pos, end);
    pos = end;
  }
  flush();
  return resolveEmphasis(nodes);
}

const asInline = (node: Node): Inline => (isDelim(node) ? { type: "text", value: node.char.repeat(node.count) } : node);

function mergeText(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (node.type === "text" && last?.type === "text") out[out.length - 1] = { type: "text", value: last.value + node.value };
    else if (node.type !== "text" || node.value) out.push(node);
  }
  return out;
}

/* CommonMark's delimiter algorithm, including the "rule of three"; "~" pairs only with a run of the same length. */
function resolveEmphasis(nodes: Node[]): Inline[] {
  const bottoms = new Map<string, number>();
  let index = 0;
  while (index < nodes.length) {
    const closer = nodes[index];
    if (!isDelim(closer) || !closer.canClose || closer.count === 0) {
      index++;
      continue;
    }
    const key = `${closer.char}${closer.canOpen ? 1 : 0}${closer.length % 3}`;
    let openerAt = -1;
    for (let k = index - 1; k >= (bottoms.get(key) ?? 0); k--) {
      const opener = nodes[k];
      if (!isDelim(opener) || opener.char !== closer.char || !opener.canOpen || opener.count === 0) continue;
      if (closer.char === "~") {
        if (opener.count !== closer.count) continue;
      } else if ((opener.canClose || closer.canOpen) && (opener.length + closer.length) % 3 === 0 && !(opener.length % 3 === 0 && closer.length % 3 === 0)) continue;
      openerAt = k;
      break;
    }
    if (openerAt < 0) {
      bottoms.set(key, index);
      index++;
      continue;
    }
    const opener = nodes[openerAt] as Delim;
    const use = closer.char === "~" ? closer.count : closer.count >= 2 && opener.count >= 2 ? 2 : 1;
    const wrapped: Inline = { type: closer.char === "~" ? "del" : use === 2 ? "strong" : "em", children: mergeText(nodes.slice(openerAt + 1, index).map(asInline)) };
    opener.count -= use;
    closer.count -= use;
    nodes.splice(openerAt + 1, index - openerAt - 1, wrapped);
    index = openerAt + 2;
    bottoms.forEach((value, name) => {
      if (value > openerAt) bottoms.set(name, openerAt);
    });
    if (opener.count === 0) {
      nodes.splice(openerAt, 1);
      index--;
    }
    if (closer.count === 0) nodes.splice(index, 1);
  }
  return mergeText(nodes.map(asInline));
}

/* ---------- Document ---------- */

function finish(blocks: RawBlock[], ctx: Context): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const content = parseInline(block.content, ctx);
        out.push({ ...block, id: ctx.slug(inlineText(content)), content });
        break;
      }
      case "paragraph": {
        const content = parseInline(block.content.replace(/[ \t]+$/, ""), ctx);
        if (content.length) out.push({ type: "paragraph", content });
        break;
      }
      case "list":
        out.push({ ...block, items: block.items.map((item) => ({ checked: item.checked, children: finish(item.children, ctx) })) });
        break;
      case "table":
        out.push({ ...block, head: block.head.map((cell) => parseInline(cell, ctx)), rows: block.rows.map((row) => row.map((cell) => parseInline(cell, ctx))) });
        break;
      case "blockquote":
        out.push({ type: "blockquote", children: finish(block.children, ctx) });
        break;
      default:
        out.push(block);
    }
  }
  return out;
}

export function parseMarkdown(source: string): MarkdownDocument {
  const lines = source
    .replace(/^\ufeff/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "\ufffd")
    .split("\n")
    .map((line) => line.replace(/^[ \t]+/, (lead) => lead.replace(/\t/g, "    ")));
  const ctx: Context = { defs: new Map(), notes: new Map(), noteOrder: new Map(), slug: createSlugger() };
  const blocks = finish(parseBlocks(lines, ctx), ctx);
  const footnotes: Footnote[] = [];
  /* Footnotes can reference later footnotes, so the order can grow while it is read. */
  const done = new Set<string>();
  for (let pass = 0; pass < 100 && done.size < ctx.noteOrder.size; pass++) {
    for (const [label, entry] of Array.from(ctx.noteOrder)) {
      if (done.has(label)) continue;
      done.add(label);
      footnotes.push({ id: entry.id, number: entry.number, children: finish(ctx.notes.get(label) ?? [], ctx) });
    }
  }
  footnotes.sort((a, b) => a.number - b.number);
  return { blocks, footnotes };
}
