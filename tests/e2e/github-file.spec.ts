import { expect, test, type Page, type Route } from "@playwright/test";
import {
  fileBlobUrl, fileRawUrl, fileTargetFromUrl, formatFileTarget, parseFileTarget, resolveImage, resolveLink, MAX_FILE_TARGET_LENGTH, type GitHubFile
} from "../../src/features/views/os/github/fileTarget";
import { parseMarkdown, plainText, type Block } from "../../src/features/views/os/github/markdown";

const githubWin = '.os-win[data-app="github"]';
const searchWin = '.os-win[data-app="search"]';
const NOTE_PATH = "sidagarwal-labs/models/main/notes";
const noteUrl = (name: string) => `https://github.com/sidagarwal-labs/models/blob/main/notes/${name}`;
const note: GitHubFile = { owner: "sidagarwal-labs", repo: "models", ref: "main", path: ["notes", "ai-capex.md"] };

/* ---------- Target parsing and link resolution ---------- */

test.describe("file targets", () => {
  test("accept Markdown files in the owner's repositories and round-trip them", () => {
    expect(parseFileTarget("sidagarwal-labs/models/blob/main/notes/ai-capex.md")).toEqual(note);
    expect(parseFileTarget("https://github.com/SidAgarwal-Labs/models/blob/main/notes/ai-capex.md")).toEqual(note);
    expect(parseFileTarget("https://www.github.com/sidagarwal-labs/models/blob/main/notes/ai-capex.md?plain=1")).toEqual(note);
    expect(parseFileTarget("sidagarwal-labs/models/blob/main/README.markdown")).toEqual({ ...note, path: ["README.markdown"] });
    expect(parseFileTarget("sidagarwal-labs/models/blob/main/notes/ai-capex.md#user-content-five-hyperscaler")).toEqual({ ...note, anchor: "five-hyperscaler" });
    // A section id GitHub would never produce is dropped; the file still opens.
    expect(parseFileTarget("sidagarwal-labs/models/blob/main/notes/ai-capex.md#a<b")).toEqual(note);

    const spaced = parseFileTarget("sidagarwal-labs/models/blob/v1.2/My%20Notes/Q3%20review.md#summary")!;
    expect(spaced).toEqual({ owner: "sidagarwal-labs", repo: "models", ref: "v1.2", path: ["My Notes", "Q3 review.md"], anchor: "summary" });
    expect(formatFileTarget(spaced)).toBe("sidagarwal-labs/models/blob/v1.2/My%20Notes/Q3%20review.md#summary");
    expect(parseFileTarget(formatFileTarget(spaced))).toEqual(spaced);
    expect(fileBlobUrl(spaced, true)).toBe("https://github.com/sidagarwal-labs/models/blob/v1.2/My%20Notes/Q3%20review.md#summary");
    expect(fileRawUrl(spaced)).toBe("https://raw.githubusercontent.com/sidagarwal-labs/models/v1.2/My%20Notes/Q3%20review.md");
  });

  test("reject other owners, other pages, traversal and odd input", () => {
    for (const value of [
      "",
      "sidagarwal-labs",
      "sidagarwal-labs/models",
      "someone-else/models/blob/main/notes/ai-capex.md",
      "https://github.com/someone-else/models/blob/main/notes/ai-capex.md",
      "https://evil.example/sidagarwal-labs/models/blob/main/notes/ai-capex.md",
      "https://github.com:8443/sidagarwal-labs/models/blob/main/notes/ai-capex.md",
      "https://user@github.com/sidagarwal-labs/models/blob/main/notes/ai-capex.md",
      "ftp://github.com/sidagarwal-labs/models/blob/main/notes/ai-capex.md",
      "javascript:alert(1)//sidagarwal-labs/models/blob/main/x.md",
      "//github.com/sidagarwal-labs/models/blob/main/notes/ai-capex.md",
      "sidagarwal-labs/models/tree/main/notes",
      "sidagarwal-labs/models/commit/abc123",
      "sidagarwal-labs/models/blob/main/src/model.py",
      "sidagarwal-labs/models/blob/main/notes/ai-capex.md.html",
      "sidagarwal-labs/models/blob/main/notes/../secrets.md",
      "sidagarwal-labs/models/blob/main/notes/%2e%2e/secrets.md",
      "sidagarwal-labs/models/blob/main/notes/./ai-capex.md",
      "sidagarwal-labs/models/blob/main/notes//ai-capex.md",
      "sidagarwal-labs/models/blob/main/notes%2Fai-capex.md",
      "sidagarwal-labs/models/blob/main/notes%5Cai-capex.md",
      "sidagarwal-labs/models/blob/main/notes/%00.md",
      "sidagarwal-labs/models/blob/main/notes/%E0%A4%A.md",
      "sidagarwal-labs/models/blob/main/notes/ai capex.md",
      "sidagarwal-labs/models/blob/main/notes\\ai-capex.md",
      "sidagarwal-labs/models/blob/main/notes/ai-capex.md?raw=1",
      "sidagarwal-labs/../blob/main/notes/ai-capex.md",
      "sidagarwal-labs/models/blob/../notes/ai-capex.md",
      "sidagarwal-labs/models/blob/main..evil/notes/ai-capex.md",
      "sidagarwal-labs/models/blob/-main/notes/ai-capex.md",
      "sidagarwal-labs/mo%2Fdels/blob/main/notes/ai-capex.md",
      `sidagarwal-labs/models/blob/main/${"a/".repeat(30)}x.md`
    ]) {
      expect(parseFileTarget(value), value).toBeNull();
    }
  });

  test("routes github.com Markdown links within Lab OS's target limit", () => {
    expect(fileTargetFromUrl(new URL(noteUrl("ai-capex.md")))).toBe("sidagarwal-labs/models/blob/main/notes/ai-capex.md");
    expect(fileTargetFromUrl(new URL(`${noteUrl("ai-capex.md")}#user-content-intro`))).toBe("sidagarwal-labs/models/blob/main/notes/ai-capex.md#intro");
    expect(fileTargetFromUrl(new URL("https://github.com/sidagarwal-labs/models/blob/main/notes/model.py"))).toBeUndefined();
    expect(fileTargetFromUrl(new URL("https://github.com/sidagarwal-labs/models"))).toBeUndefined();

    // A long section is dropped before the file itself is given up on.
    const longName = `${"n".repeat(MAX_FILE_TARGET_LENGTH - 60)}.md`;
    expect(fileTargetFromUrl(new URL(`${noteUrl(longName)}#${"s".repeat(100)}`))).toBe(`sidagarwal-labs/models/blob/main/notes/${longName}`);
    expect(fileTargetFromUrl(new URL(noteUrl(`${"n".repeat(MAX_FILE_TARGET_LENGTH)}.md`)))).toBeUndefined();
  });

  test("resolve links and images in a note like GitHub, allowing only safe protocols", () => {
    expect(resolveLink("ai-adoption.md#technical-employment-evidence", note)).toEqual({
      kind: "file",
      file: { ...note, path: ["notes", "ai-adoption.md"], anchor: "technical-employment-evidence" },
      href: `${noteUrl("ai-adoption.md")}#technical-employment-evidence`
    });
    expect(resolveLink("../README.md", note)).toMatchObject({ kind: "file", file: { path: ["README.md"] } });
    expect(resolveLink("/notes/gpu-prices.md", note)).toMatchObject({ kind: "file", file: { path: ["notes", "gpu-prices.md"] } });
    expect(resolveLink("#user-content-revisions", note)).toEqual({ kind: "anchor", anchor: "revisions", href: `${noteUrl("ai-capex.md")}#revisions` });
    expect(resolveLink(`${noteUrl("ai-capex.md")}#revisions`, note)).toMatchObject({ kind: "anchor", anchor: "revisions" });
    expect(resolveLink("https://example.com/report.pdf#page=27", note)).toEqual({ kind: "external", href: "https://example.com/report.pdf#page=27" });
    expect(resolveLink("data.csv", note)).toEqual({ kind: "external", href: noteUrl("data.csv") });
    expect(resolveLink("https://github.com/sidagarwal-labs/models", note)).toMatchObject({ kind: "external" });
    expect(resolveLink("https://github.com/someone-else/repo/blob/main/x.md", note)).toMatchObject({ kind: "external" });
    expect(resolveLink("mailto:hello@example.com", note)).toEqual({ kind: "external", href: "mailto:hello@example.com" });
    for (const unsafe of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd", ""]) {
      expect(resolveLink(unsafe, note), unsafe).toBeNull();
    }

    expect(resolveImage("images/chart.png", note)).toBe(`https://raw.githubusercontent.com/${NOTE_PATH}/images/chart.png`);
    expect(resolveImage("/assets/logo.svg", note)).toBe("https://raw.githubusercontent.com/sidagarwal-labs/models/main/assets/logo.svg");
    expect(resolveImage("https://github.com/sidagarwal-labs/models/blob/main/assets/a.png", note)).toBe("https://raw.githubusercontent.com/sidagarwal-labs/models/main/assets/a.png");
    expect(resolveImage("https://example.com/a.png", note)).toBe("https://example.com/a.png");
    for (const unsafe of ["javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "blob:https://example.com/x", ""]) {
      expect(resolveImage(unsafe, note), unsafe).toBeNull();
    }
  });
});

/* ---------- Markdown parsing ---------- */

const blocksOf = (doc: { blocks: Block[] }) => doc.blocks.map((block) => block.type);

test.describe("Markdown parser", () => {
  test("reads the GitHub-flavored blocks research notes use", () => {
    const doc = parseMarkdown(
      [
        "# GPU & Memory Prices",
        "",
        "Intro with **bold**, _italic_, ND96is_MI300X_v5 and `a * b`.",
        "",
        "| Item | Value | Note |",
        "| :--- | ---: | :---: |",
        "| Alpha \\| Beta | $1.5B | ok |",
        "",
        "- One",
        "  - Nested",
        "- Two",
        "",
        "3. Third",
        "4. Fourth",
        "",
        "> Quoted",
        "",
        "```python",
        "print('<b>')",
        "```",
        "",
        "***",
        "",
        "Setext",
        "------",
        "",
        "## GPU & Memory Prices"
      ].join("\n")
    );
    expect(blocksOf(doc)).toEqual(["heading", "paragraph", "table", "list", "list", "blockquote", "code", "hr", "heading", "heading"]);
    const [h1, intro, table, bullets, numbers, , code, , setext, repeat] = doc.blocks;
    expect(h1).toMatchObject({ level: 1, id: "gpu--memory-prices" });
    expect(repeat).toMatchObject({ level: 2, id: "gpu--memory-prices-1" });
    expect(setext).toMatchObject({ level: 2, id: "setext" });
    expect(intro.type === "paragraph" && intro.content.map((node) => node.type)).toEqual(["text", "strong", "text", "em", "text", "code", "text"]);
    expect(intro.type === "paragraph" && plainText(intro.content)).toBe("Intro with bold, italic, ND96is_MI300X_v5 and a * b.");
    expect(table).toMatchObject({ align: ["left", "right", "center"] });
    expect(table.type === "table" && plainText(table.rows[0][0])).toBe("Alpha | Beta");
    expect(bullets).toMatchObject({ ordered: false, tight: true, items: [{ children: [{ type: "paragraph" }, { type: "list" }] }, {}] });
    expect(numbers).toMatchObject({ ordered: true, start: 3 });
    expect(code).toEqual({ type: "code", lang: "python", value: "print('<b>')" });
  });

  test("keeps raw HTML as text and URLs unresolved", () => {
    const doc = parseMarkdown('<script>alert(1)</script>\n\nA <img src=x onerror="alert(1)"> and <!-- hidden --> and [x](javascript:alert(1)) and <https://example.com>.');
    expect(blocksOf(doc)).toEqual(["paragraph", "paragraph"]);
    expect(doc.blocks[0].type === "paragraph" && plainText(doc.blocks[0].content)).toBe("<script>alert(1)</script>");
    const second = doc.blocks[1].type === "paragraph" ? doc.blocks[1].content : [];
    expect(plainText(second)).toBe('A <img src=x onerror="alert(1)"> and  and x and https://example.com.');
    expect(second.filter((node) => node.type === "link")).toEqual([
      { type: "link", href: "javascript:alert(1)", children: [{ type: "text", value: "x" }] },
      { type: "link", href: "https://example.com", children: [{ type: "text", value: "https://example.com" }] }
    ]);
  });

  test("numbers footnotes in order of reference", () => {
    const doc = parseMarkdown("Claim[^b] and another[^a] and again[^b].\n\n[^a]: First note.\n[^b]: Second note.");
    expect(doc.footnotes.map((footnote) => [footnote.id, footnote.number])).toEqual([["b", 1], ["a", 2]]);
  });
});

/* ---------- The file view in Lab OS ---------- */

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const filler = (count: number) => Array.from({ length: count }, (_, i) => `Filler paragraph ${i + 1} keeps this section below the fold.`).join("\n\n");

const TEST_NOTE = [
  "# Test Note",
  "",
  "Research with **bold**, _italic_, `inline code` and a [source report](https://example.com/report.pdf#page=3).",
  "",
  "## Data & Tables",
  "",
  "| Item | Value | Status |",
  "| :--- | ---: | :---: |",
  "| Alpha | $1.5B | ok |",
  "| Beta | $22.0B | watch |",
  "",
  "- First item",
  "- Second item",
  "  - Nested item",
  "",
  "```python",
  "total = capex * share  # <b>not bold</b>",
  "```",
  "",
  "> A quoted line.",
  "",
  "![Capex chart](images/chart.png)",
  "",
  "---",
  "",
  "See [the other note](other-note.md#deep-section), the [readme](../README.md) and [jump to tables](#data--tables).",
  "",
  filler(30)
].join("\n");

const OTHER_NOTE = ["# Other Note", "", filler(40), "", "## Deep Section", "", "Back to the [test note](ai-capex.md)."].join("\n");

const HOSTILE_NOTE = [
  "# Hostile Note",
  "",
  '<script>window.__xss = "script"</script>',
  "",
  '<img src="x" onerror="window.__xss = \'img\'"> and <iframe src="javascript:window.__xss=\'frame\'"></iframe>',
  "",
  "[Run me](javascript:window.__xss='link') and [Data link](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==) and [VB](vbscript:msgbox(1)).",
  "",
  "![Pixel](javascript:window.__xss='image')",
  "",
  '<a href="javascript:window.__xss=\'raw\'">Raw anchor</a>',
  "",
  "<javascript:window.__xss='autolink'>",
  "",
  "[Ref link][evil]",
  "",
  "[evil]: javascript:window.__xss='ref'"
].join("\n");

type NoteFiles = Record<string, string | number>;

/* Serves notes from raw.githubusercontent.com: a string is the file, a number an HTTP status (-1 a network error), and a
   missing file is a 404. Returns the Markdown paths requested. */
async function mockNotes(page: Page, files: NoteFiles) {
  const requests: string[] = [];
  const headers = { "access-control-allow-origin": "*" };
  await page.route("https://raw.githubusercontent.com/**", (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(".png")) return route.fulfill({ contentType: "image/png", headers, body: PIXEL });
    requests.push(url.pathname);
    const name = decodeURIComponent(url.pathname.replace(/^\/sidagarwal-labs\/models\/main\//, ""));
    const file = files[name];
    if (file === -1) return route.abort();
    if (typeof file === "number") return route.fulfill({ status: file, headers, body: "" });
    if (file === undefined) return route.fulfill({ status: 404, contentType: "text/plain", headers, body: "404: Not Found" });
    return route.fulfill({ contentType: "text/plain; charset=utf-8", headers, body: file });
  });
  return requests;
}

function trackNewTabs(page: Page) {
  const opened: string[] = [];
  page.context().on("page", (tab) => opened.push(tab.url()));
  return opened;
}

/* The taskbar button minimizes the active window, so only click it when another window is in front. */
async function bringSearchForward(page: Page) {
  const win = page.locator(searchWin);
  if (!/\bis-active\b/.test((await win.getAttribute("class")) ?? "")) await page.locator(".os-task", { hasText: "Sid Search" }).click();
  await expect(win).toHaveClass(/is-active/);
}

/* Opens the collapsed "All research notes" list first when the note is not one of the three featured notes. */
const clickNote = async (page: Page, slug: string) => {
  const link = page.frameLocator(`${searchWin} iframe`).locator(`#writing a[href="${noteUrl(`${slug}.md`)}"]`).first();
  await link.evaluate((anchor) => {
    const details = anchor.closest("details");
    if (details) details.open = true;
  });
  await link.click();
};

/* Opens Lab OS with Sid Search, then a research note from its Writing section. */
async function openNote(page: Page, files: NoteFiles, { phone = false, slug = "ai-capex" } = {}) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(phone ? { width: 390, height: 760 } : { width: 1440, height: 900 });
  // Registered first so the note mocks registered later take precedence.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
  const requests = await mockNotes(page, files);
  await page.goto(phone ? "./?view=os#writing" : "./");
  await clickNote(page, slug);
  const win = page.locator(githubWin);
  await expect(win).toHaveClass(/is-active/);
  return { win, requests };
}

test("a research note link in Sid Search opens the GitHub app's file view with rendered Markdown", async ({ page }) => {
  const opened = trackNewTabs(page);
  const { win, requests } = await openNote(page, { "notes/ai-capex.md": TEST_NOTE });

  const article = win.getByRole("article", { name: "Test Note" });
  await expect(article).toBeVisible();
  await expect(win.getByRole("heading", { level: 3, name: "Test Note" })).toBeFocused();
  expect(requests).toEqual([`/${NOTE_PATH}/ai-capex.md`]);

  const crumbs = win.getByRole("navigation", { name: "File path" });
  await expect(crumbs.getByRole("link")).toHaveText(["sidagarwal-labs", "models", "notes"]);
  await expect(crumbs.getByRole("link", { name: "notes" })).toHaveAttribute("href", "https://github.com/sidagarwal-labs/models/tree/main/notes");
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText("ai-capex.md");
  const openOnGitHub = win.locator(".gh-file__head").getByRole("link", { name: "Open on GitHub" });
  await expect(openOnGitHub).toHaveAttribute("href", noteUrl("ai-capex.md"));
  await expect(openOnGitHub).toHaveAttribute("target", "_blank");
  await expect(win.locator(".gh-file__meta")).toHaveText(/^\d+ lines · [\d.]+ KB$/);

  const tables = article.getByRole("heading", { level: 4, name: "Data & Tables" });
  await expect(tables).toHaveAttribute("id", "user-content-data--tables");
  await expect(article.locator("strong")).toHaveText("bold");
  await expect(article.locator("em")).toHaveText("italic");
  await expect(article.locator("p > code")).toHaveText("inline code");

  const table = article.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Item", "Value", "Status"]);
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("cell", { name: "$22.0B" })).toHaveCSS("text-align", "right");
  await expect(table.getByRole("cell", { name: "watch" })).toHaveCSS("text-align", "center");

  await expect(article.locator("ul > li")).toHaveText(["First item", /^Second item\s*Nested item$/, "Nested item"]);
  await expect(article.locator("ul ul > li")).toHaveText("Nested item");
  await expect(article.locator("pre code")).toHaveText("total = capex * share  # <b>not bold</b>");
  await expect(article.locator("pre b")).toHaveCount(0);
  await expect(article.locator("blockquote")).toHaveText("A quoted line.");
  await expect(article.locator("hr")).toHaveCount(1);

  const image = article.getByRole("img", { name: "Capex chart" });
  await expect(image).toHaveAttribute("src", `https://raw.githubusercontent.com/${NOTE_PATH}/images/chart.png`);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

  const source = article.getByRole("link", { name: "source report" });
  await expect(source).toHaveAttribute("href", "https://example.com/report.pdf#page=3");
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(source).toHaveAttribute("rel", "noopener noreferrer");
  await expect(article.getByRole("link", { name: "the other note" })).toHaveAttribute("href", `${noteUrl("other-note.md")}#deep-section`);
  await expect(article.getByRole("link", { name: "readme" })).toHaveAttribute("href", "https://github.com/sidagarwal-labs/models/blob/main/README.md");
  expect(opened).toEqual([]);
});

test("note links stay in the viewer, Back returns to the profile, and the repository crumb opens GitHub", async ({ page }) => {
  await page.context().route("https://github.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Repository</p>" }));
  const opened = trackNewTabs(page);
  const { win, requests } = await openNote(page, { "notes/ai-capex.md": TEST_NOTE, "notes/other-note.md": OTHER_NOTE });
  const body = win.locator(".os-win__body");
  const article = win.getByRole("article");
  await expect(article).toHaveAccessibleName("Test Note");

  /* The heading sits below the sticky toolbar, inside the visible part of the window. */
  const expectInView = async (name: string) => {
    const heading = article.getByRole("heading", { name });
    await expect(heading).toBeFocused();
    await expect
      .poll(async () => {
        const [box, toolbar, view] = await Promise.all([heading.boundingBox(), win.locator(".gh-toolbar").boundingBox(), body.boundingBox()]);
        return box!.y >= toolbar!.y + toolbar!.height - 1 && box!.y + box!.height <= view!.y + view!.height;
      })
      .toBe(true);
  };

  await article.getByRole("link", { name: "jump to tables" }).click();
  await expectInView("Data & Tables");

  await article.getByRole("link", { name: "the other note" }).click();
  await expect(article).toHaveAccessibleName("Other Note");
  await expect(win.locator('.gh-crumbs [aria-current="page"]')).toHaveText("other-note.md");
  await expectInView("Deep Section");
  expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(200);

  await article.getByRole("link", { name: "test note" }).click();
  await expect(article).toHaveAccessibleName("Test Note");
  await expect(win.getByRole("heading", { level: 3, name: "Test Note" })).toBeFocused();
  expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
  // Files already opened come from memory.
  expect(requests).toEqual([`/${NOTE_PATH}/ai-capex.md`, `/${NOTE_PATH}/other-note.md`]);

  await win.getByRole("button", { name: /^Back to / }).click();
  await expect(win.locator(".gh-file")).toHaveCount(0);
  await expect(win.getByRole("heading", { level: 3, name: "Sid Agarwal" })).toBeVisible();
  await expect(win.getByRole("button", { name: /^Back to / })).toHaveCount(0);

  expect(opened).toEqual([]);

  // The repository crumb opens the actual repository without replacing the note.
  await bringSearchForward(page);
  await clickNote(page, "ai-capex");
  await expect(win.getByRole("article", { name: "Test Note" })).toBeVisible();
  const crumb = win.getByRole("navigation", { name: "File path" }).getByRole("link", { name: "models" });
  await expect(crumb).toHaveAttribute("target", "_blank");
  await expect(crumb).toHaveAttribute("rel", "noopener noreferrer");
  const tabOpened = page.context().waitForEvent("page");
  await crumb.click();
  const tab = await tabOpened;
  await expect(tab).toHaveURL("https://github.com/sidagarwal-labs/models");
  expect(await tab.evaluate(() => window.opener === null)).toBe(true);
  await tab.close();
  await expect(article).toHaveAccessibleName("Test Note");
  await expect(win.locator(".gh-pane")).toBeHidden();
  expect(opened).toHaveLength(1);
});

test("a hostile note cannot run script or produce unsafe links", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const { win } = await openNote(page, { "notes/ai-capex.md": HOSTILE_NOTE });
  const article = win.getByRole("article", { name: "Hostile Note" });
  await expect(article).toBeVisible();

  await expect(article).toContainText('<script>window.__xss = "script"</script>');
  await expect(article).toContainText("<img src=\"x\" onerror=\"window.__xss = 'img'\">");
  await expect(article.locator("script, iframe, img, object, embed, [onerror], [onclick], [srcdoc]")).toHaveCount(0);
  await expect(article.locator('a[href]:not([href^="https:"]):not([href^="http:"]):not([href^="mailto:"])')).toHaveCount(0);
  for (const name of ["Run me", "Data link", "VB", "Raw anchor", "Ref link"]) {
    await expect(article.getByRole("link", { name })).toHaveCount(0);
  }
  await expect(article).toContainText("Run me and Data link and VB.");
  await expect(article).toContainText("Pixel");

  await article.getByText("Run me").click();
  await article.getByText("Ref link").click();
  expect(await page.evaluate(() => (window as Window & { __xss?: unknown }).__xss)).toBeUndefined();
  expect(dialogs).toEqual([]);
});

test("a missing note or a network failure offers GitHub instead", async ({ page }) => {
  const files: NoteFiles = { "notes/ai-capex.md": 404 };
  const { win } = await openNote(page, files);
  const alert = win.getByRole("alert");
  await expect(alert).toContainText("not on GitHub at this address");
  await expect(alert.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute("href", noteUrl("ai-capex.md"));
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(win.getByRole("article")).toHaveCount(0);

  files["notes/ai-capex.md"] = -1;
  await bringSearchForward(page);
  await clickNote(page, "ai-capex");
  await expect(alert).toContainText("GitHub could not be reached");
  await expect(alert.getByRole("link", { name: "Open on GitHub" })).toBeVisible();

  files["notes/ai-capex.md"] = TEST_NOTE;
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(win.getByRole("article", { name: "Test Note" })).toBeVisible();
  await expect(win.getByRole("alert")).toHaveCount(0);
});

test("the file view fits a phone, with wide tables and code scrolling in place", async ({ page }) => {
  const wide = [
    "# Wide Note",
    "",
    `| ${Array.from({ length: 8 }, (_, i) => `Column heading ${i + 1}`).join(" | ")} |`,
    `| ${Array.from({ length: 8 }, () => "---:").join(" | ")} |`,
    `| ${Array.from({ length: 8 }, (_, i) => `$${i + 1}00.25B`).join(" | ")} |`,
    "",
    "```",
    `practical_fleet = tokens_per_second / achieved_tokens_per_second_per_gpu * peak_factor / schedulable_fraction # ${"x".repeat(80)}`,
    "```",
    "",
    `A long link: [${"https://example.com/".repeat(4)}](https://example.com/) and ${"Supercalifragilistic".repeat(4)}.`
  ].join("\n");
  const { win } = await openNote(page, { "notes/ai-capex.md": wide }, { phone: true });
  const article = win.getByRole("article", { name: "Wide Note" });
  await expect(article).toBeVisible();
  await expect(win.getByRole("heading", { level: 3, name: "Wide Note" })).toBeFocused();

  const overflow = () =>
    page.evaluate((selector) => {
      const body = document.querySelector(`${selector} .os-win__body`)!;
      const table = document.querySelector(`${selector} .gh-md__table`)!;
      const pre = document.querySelector(`${selector} .gh-md pre`)!;
      return {
        page: document.documentElement.scrollWidth - window.innerWidth,
        body: body.scrollWidth - body.clientWidth,
        tableScrolls: table.scrollWidth > table.clientWidth,
        codeScrolls: pre.scrollWidth > pre.clientWidth
      };
    }, githubWin);
  expect(await overflow()).toEqual({ page: 0, body: 0, tableScrolls: true, codeScrolls: true });

  // Linux CI falls back to wider fonts than Windows; a wide font catches overflow either way.
  await page.addStyleTag({ content: "*, *::before, *::after { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }" });
  expect(await overflow()).toEqual({ page: 0, body: 0, tableScrolls: true, codeScrolls: true });
  const crumbs = (await win.locator(".gh-crumbs").boundingBox())!;
  expect(crumbs.x + crumbs.width).toBeLessThanOrEqual(390);
});
