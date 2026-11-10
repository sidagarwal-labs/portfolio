import { expect, test, type Frame, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { researchNotes } from "../../src/content/journalContent";
import { sources } from "../../src/content/marketInsights";
import { slugBase } from "../../src/features/views/os/github/markdown";

/* Issue #43: a research note opens in the GitHub app's file view (or on GitHub), never in an unrelated view. */

const githubWin = '.os-win[data-app="github"]';
const searchWin = '.os-win[data-app="search"]';
const noteUrl = (slug: string) => `https://github.com/sidagarwal-labs/models/blob/main/notes/${slug}.md`;
const noteLinks = 'a[href^="https://github.com/sidagarwal-labs/models/blob/main/notes/"]';
const COMMIT_DATE = "2026-11-02T09:30:00Z";
const UPDATED = "Updated Nov 2, 2026";

const filler = (count: number) => Array.from({ length: count }, (_, i) => `Filler paragraph ${i + 1} keeps this section below the fold.`).join("\n\n");
const noteBody = (title: string) =>
  [`# ${title} (note)`, "", "An intro with **bold** text.", "", filler(30), "", "## Data & Tables", "", "| Item | Value |", "| :--- | ---: |", "| Alpha | $1.5B |", "", "- First item", "- Second item", "", "```", "total = capex * share", "```", "", filler(30)].join("\n");

type Files = Record<string, string | number | "hang">;

/* Every request leaves the machine only through these mocks: notes from raw.githubusercontent.com (a number is an HTTP
   status, -1 a network error, "hang" never answers), last-commit dates from the GitHub API, and github.com pages in
   new tabs. */
async function mockNetwork(page: Page, files: Files) {
  const headers = { "access-control-allow-origin": "*" };
  // Registered first so the mocks registered later take precedence.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
  await page.route("https://api.github.com/repos/sidagarwal-labs/models/commits?*", (route) =>
    route.fulfill({ headers, json: [{ commit: { committer: { date: COMMIT_DATE } } }] })
  );
  await page.route("https://raw.githubusercontent.com/sidagarwal-labs/models/main/notes/**", (route) => {
    const slug = new URL(route.request().url()).pathname.replace(/^.*\/notes\//, "").replace(/\.md$/, "");
    const file = files[slug];
    if (file === "hang") return;
    if (file === -1) return route.abort();
    if (typeof file === "number") return route.fulfill({ status: file, headers, body: "" });
    if (file === undefined) return route.fulfill({ status: 404, headers, body: "404: Not Found" });
    return route.fulfill({ contentType: "text/plain; charset=utf-8", headers, body: file });
  });
  await page.context().route(/^https:\/\/github\.com\//, (route) => route.fulfill({ contentType: "text/html", body: "<title>GitHub</title><p>GitHub</p>" }));
}

const allNotes = Object.fromEntries(researchNotes.map((note) => [note.slug, noteBody(note.title)]));

async function openLabOS(page: Page, files: Files = allNotes, { phone = false, path = "./" } = {}) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(phone ? { width: 390, height: 760 } : { width: 1440, height: 900 });
  await mockNetwork(page, files);
  await page.goto(path);
  const search = page.frameLocator(`${searchWin} iframe`);
  await expect(search.locator(noteLinks).first()).toBeAttached();
  return search;
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

/* Earlier AI buildout editions sit in a collapsed list. */
const clickNoteIn = async (frame: FrameLocator, slug: string) => {
  const link = frame.locator(`${noteLinks}[href="${noteUrl(slug)}"]`).first();
  await link.evaluate((anchor) => {
    const details = anchor.closest("details");
    if (details) details.open = true;
  });
  await link.click();
};

async function expectNote(win: Locator, slug: string, anchor?: string) {
  const note = researchNotes.find((entry) => entry.slug === slug)!;
  await expect(win).toHaveClass(/is-active/);
  await expect(win.getByRole("article", { name: `${note.title} (note)` })).toBeVisible();
  await expect(win.locator('.gh-crumbs [aria-current="page"]')).toHaveText(`${slug}.md`);
  const info = win.locator(".gh-file__note");
  await expect(info.locator("strong")).toHaveText(note.title);
  await expect(info).toContainText("Research note");
  await expect(info).toContainText(UPDATED);
  await expect(info.locator("time")).toHaveAttribute("datetime", COMMIT_DATE);
  const open = win.locator(".gh-file__head").getByRole("link", { name: "Open on GitHub" });
  await expect(open).toHaveAttribute("href", anchor ? `${noteUrl(slug)}#${anchor}` : noteUrl(slug));
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", "noopener noreferrer");
  // Never the profile or a repository standing in for the note.
  await expect(win.locator(".gh-pane")).toBeHidden();
  await expect(win.locator(".gh-repo.is-highlighted")).toBeHidden();
}

/* Adds a link to a window's page, as the Insights tab (#39) links to a section of a note. */
async function addLink(frame: FrameLocator, href: string, text: string) {
  await frame.locator("body").evaluate(
    (body, link) => {
      const anchor = document.createElement("a");
      anchor.href = link.href;
      anchor.textContent = link.text;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.style.cssText = "position: fixed; top: 4px; left: 4px; z-index: 2147483647; padding: 4px; background: #fff;";
      body.append(anchor);
    },
    { href, text }
  );
  return frame.getByRole("link", { name: text, exact: true });
}

async function expectSectionInView(win: Locator, name: string) {
  const heading = win.getByRole("heading", { name, exact: true });
  await expect(heading).toBeFocused();
  await expect
    .poll(async () => {
      const [box, toolbar, view] = await Promise.all([heading.boundingBox(), win.locator(".gh-toolbar").boundingBox(), win.locator(".os-win__body").boundingBox()]);
      return box!.y >= toolbar!.y + toolbar!.height - 1 && box!.y + box!.height <= view!.y + view!.height;
    })
    .toBe(true);
}

test("every research note in Sid Search opens that note, also when the GitHub window is already open", async ({ page }) => {
  const opened = trackNewTabs(page);
  const search = await openLabOS(page);

  // The GitHub window starts on the profile overview, as when Sid opened it before clicking a note.
  await page.locator(".os-start").click();
  await page.getByRole("dialog", { name: "Start menu" }).getByRole("button", { name: "GitHub", exact: true }).click();
  const win = page.locator(githubWin);
  await expect(win.getByRole("heading", { level: 3, name: "Top repositories" })).toBeVisible();

  for (const note of researchNotes) {
    await bringSearchForward(page);
    await clickNoteIn(search, note.slug);
    await expectNote(win, note.slug);
  }
  await expect(win).toHaveCount(1);

  await win.getByRole("button", { name: /^Back to / }).click();
  await expect(win.getByRole("heading", { level: 3, name: "Top repositories" })).toBeVisible();
  expect(opened).toEqual([]);
});

test("notes in the Journal, Forward pass, Training run, and Terminal windows open the note too", async ({ page }) => {
  const opened = trackNewTabs(page);
  await openLabOS(page);
  const github = page.locator(githubWin);
  const views = [
    { app: "forward", label: "Forward pass", slug: "ai-buildout-2026-10" },
    { app: "training", label: "Training run", slug: "memory-storage" },
    { app: "terminal", label: "Terminal", slug: "gpu-prices" },
    { app: "journal", label: "Journal", slug: "ai-buildout-2026-09" }
  ];
  for (const view of views) {
    await page.locator(".os-start").click();
    const menu = page.getByRole("dialog", { name: "Start menu" });
    await menu.getByRole("searchbox", { name: "Search apps" }).fill(view.label);
    await menu.getByRole("list", { name: "Search results" }).getByRole("button", { name: view.label, exact: true }).click();
    const win = page.locator(`.os-win[data-app="${view.app}"]`);
    await expect(win).toHaveClass(/is-active/);
    const frame = page.frameLocator(`.os-win[data-app="${view.app}"] iframe`);
    await expect(frame.locator(noteLinks)).toHaveCount(researchNotes.length);
    await clickNoteIn(frame, view.slug);
    await expectNote(github, view.slug);
  }
  await expect(github).toHaveCount(1);
  expect(opened).toEqual([]);
});

test("links to a section of a note scroll to that section, with or without GitHub's user-content- prefix", async ({ page }) => {
  const search = await openLabOS(page);
  const win = page.locator(githubWin);

  await (await addLink(search, `${noteUrl("ai-capex")}#data--tables`, "Capex tables")).click();
  await expectNote(win, "ai-capex", "data--tables");
  await expectSectionInView(win, "Data & Tables");

  await bringSearchForward(page);
  await (await addLink(search, `${noteUrl("cloud-growth")}#user-content-data--tables`, "Cloud tables")).click();
  await expectNote(win, "cloud-growth", "data--tables");
  await expectSectionInView(win, "Data & Tables");
  expect(await win.locator(".os-win__body").evaluate((body) => body.scrollTop)).toBeGreaterThan(200);
});

test("every Markets Insights source opens its note at the cited section", async ({ page }) => {
  test.setTimeout(60_000);
  // Each label reads "<file>.md › <heading>"; the mocked notes carry those headings far apart.
  const cited = Object.values(sources).map(({ label, href }) => {
    const [file, heading] = label.split(" › ");
    return { href, slug: file.replace(/\.md$/, ""), heading, anchor: new URL(href).hash.slice(1) };
  });
  const files: Files = { ...allNotes };
  for (const note of researchNotes) {
    const headings = [...new Set(cited.filter((source) => source.slug === note.slug).map((source) => source.heading))];
    if (headings.length) files[note.slug] = [`# ${note.title} (note)`, ...headings.flatMap((heading) => [filler(30), `## ${heading}`]), filler(30)].join("\n\n");
  }
  const opened = trackNewTabs(page);
  await openLabOS(page, files);
  await page.getByRole("button", { name: "Open Markets" }).click();
  const markets = page.locator('.os-win[data-app="markets"]');
  const frame = page.frameLocator('.os-win[data-app="markets"] iframe');
  await frame.getByRole("tab", { name: "Insights" }).click();
  const win = page.locator(githubWin);

  for (const source of cited) {
    expect(source.anchor).toBe(slugBase(source.heading));
    if (!/\bis-active\b/.test((await markets.getAttribute("class")) ?? "")) await page.locator(".os-task", { hasText: "Markets" }).click();
    await expect(markets).toHaveClass(/is-active/);
    const link = frame.locator(`a[href="${source.href}"]`).first();
    await link.click();
    await expectNote(win, source.slug, source.anchor);
    await expectSectionInView(win, source.heading);
  }
  await expect(win).toHaveCount(1);
  expect(opened).toEqual([]);
});

test("on a phone, a note and its sections open full screen in the GitHub app", async ({ page }) => {
  const search = await openLabOS(page, allNotes, { phone: true, path: "./?view=os#writing" });
  const win = page.locator(githubWin);

  await clickNoteIn(search, "foundation-labs");
  await expectNote(win, "foundation-labs");
  await expect(win.getByRole("heading", { level: 3, name: "Foundation labs (note)" })).toBeFocused();
  const fits = () => page.evaluate((selector) => {
    const body = document.querySelector(`${selector} .os-win__body`)!;
    return { page: document.documentElement.scrollWidth - window.innerWidth, body: body.scrollWidth - body.clientWidth };
  }, githubWin);
  expect(await fits()).toEqual({ page: 0, body: 0 });

  // The GitHub window is already open when the next link asks for a section of another note.
  await win.getByRole("button", { name: "Home" }).click();
  await expect(win).toHaveClass(/is-minimized/);
  await page.locator(".os-home__grid .os-icon", { hasText: "Sid Search" }).click();
  await expect(page.locator(searchWin)).toHaveClass(/is-active/);
  await (await addLink(search, `${noteUrl("ai-adoption")}#data--tables`, "Adoption tables")).click();
  await expectNote(win, "ai-adoption", "data--tables");
  await expectSectionInView(win, "Data & Tables");
});

test("a note that cannot load explains why and opens on GitHub in a new tab", async ({ page }) => {
  const files: Files = { ...allNotes, "ai-capex": 404, "gpu-prices": -1, "cloud-growth": 500 };
  const search = await openLabOS(page, files);
  const win = page.locator(githubWin);

  for (const [slug, message] of [
    ["ai-capex", "not on GitHub at this address"],
    ["gpu-prices", "GitHub could not be reached"],
    ["cloud-growth", "GitHub could not be reached"]
  ]) {
    await bringSearchForward(page);
    await clickNoteIn(search, slug);
    const alert = win.getByRole("alert");
    await expect(alert).toContainText(message);
    await expect(win.getByRole("article")).toHaveCount(0);
    await expect(win.locator(".gh-pane")).toBeHidden();
    await expect(win.locator(".gh-file__note strong")).toHaveText(researchNotes.find((note) => note.slug === slug)!.title);
    const open = alert.getByRole("link", { name: "Open on GitHub" });
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", "noopener noreferrer");
    const [tab] = await Promise.all([page.context().waitForEvent("page"), open.click()]);
    await tab.waitForLoadState();
    expect(tab.url()).toBe(noteUrl(slug));
    await tab.close();
  }
});

test("a note that never finishes loading times out to the GitHub fallback", async ({ page }) => {
  await page.clock.install();
  const search = await openLabOS(page, { ...allNotes, "ai-adoption": "hang" });
  const win = page.locator(githubWin);
  await clickNoteIn(search, "ai-adoption");
  await expect(win.getByRole("status").filter({ hasText: "Loading ai-adoption.md" })).toBeVisible();
  await page.clock.fastForward(15_100);
  const alert = win.getByRole("alert");
  await expect(alert).toContainText("GitHub could not be reached");
  await expect(alert.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute("href", noteUrl("ai-adoption"));
});

/* Lab OS keeps the build it booted with while windows load the latest deploy. An OS from before the file view (#35)
   read a note's target as its repository and showed the profile overview, so windows hand links only to an OS
   running their own build and otherwise open them in a new tab. */
test("a window running a different build than Lab OS opens notes on GitHub instead of handing them to the OS", async ({ page }) => {
  const search = await openLabOS(page);
  const entry = page.locator('script[type="module"][src]');
  const current = (await entry.getAttribute("src"))!;
  await entry.evaluate((script) => script.setAttribute("src", "/assets/index-0lderbu1ld.js"));

  const [tab] = await Promise.all([page.context().waitForEvent("page"), clickNoteIn(search, "memory-storage")]);
  await tab.waitForLoadState();
  expect(tab.url()).toBe(noteUrl("memory-storage"));
  await tab.close();
  await expect(page.locator(githubWin)).toHaveCount(0);
  await expect(page.locator(`${searchWin} .os-address__text`)).not.toContainText("github");

  // The same build hands the note to the GitHub app again.
  await entry.evaluate((script, src) => script.setAttribute("src", src), current);
  await clickNoteIn(search, "memory-storage");
  await expectNote(page.locator(githubWin), "memory-storage");
});

/* A target this GitHub app cannot show (a newer kind of link, or another GitHub page) offers that page on GitHub. */
test("a GitHub page the app cannot show is offered on GitHub, never as the profile", async ({ page }) => {
  const opened = trackNewTabs(page);
  await openLabOS(page);
  const frame = page.frames().find((candidate: Frame) => candidate.name() === "labos:search")!;
  const post = (target: string) =>
    frame.evaluate((value) => window.parent.postMessage({ type: "labos:link", app: "github", target: value }, window.location.origin), target);
  const win = page.locator(githubWin);
  const notice = win.locator(".gh-away").getByRole("alert");

  for (const [target, href] of [
    ["sidagarwal-labs/models/blob/main/notes/data.csv", "https://github.com/sidagarwal-labs/models/blob/main/notes/data.csv"],
    ["https://github.com/sidagarwal-labs/models/tree/main/notes", "https://github.com/sidagarwal-labs/models/tree/main/notes"],
    ["sidagarwal-labs/models/blob/main/notes/memory-storage.md?plain=1", "https://github.com/sidagarwal-labs/models/blob/main/notes/memory-storage.md?plain=1"],
    ["javascript:alert(1)", "https://github.com/sidagarwal-labs"],
    ["https://evil.example/sidagarwal-labs/models", "https://github.com/sidagarwal-labs"]
  ]) {
    await post(target);
    await expect(win).toHaveClass(/is-active/);
    await expect(notice).toContainText("can't be shown here");
    const open = notice.getByRole("link", { name: "Open on GitHub" });
    await expect(open).toHaveAttribute("href", href);
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", "noopener noreferrer");
    await expect(win.locator(".gh-pane")).toBeHidden();
    await expect(win.locator(".gh-file__box")).toHaveCount(0);
  }

  // A note after the notice shows the note; a repository still shows the profile with that repository.
  await post("sidagarwal-labs/models/blob/main/notes/ai-capex.md");
  await expectNote(win, "ai-capex");
  await expect(win.locator(".gh-away")).toHaveCount(0);
  await post("sidagarwal-labs/models/blob/main/notes/data.csv");
  await expect(notice).toBeVisible();
  await win.getByRole("button", { name: /^Back to / }).click();
  await expect(win.locator(".gh-away")).toHaveCount(0);
  await expect(win.getByRole("heading", { level: 3, name: "Top repositories" })).toBeVisible();
  expect(opened).toEqual([]);
});

for (const view of ["journal", "search", "forward", "training", "terminal"]) {
  test(`outside Lab OS, ?view=${view} opens research notes on GitHub in a new tab`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockNetwork(page, allNotes);
    await page.goto(`./?view=${view}`);
    const links = page.locator(`#writing ${noteLinks}`);
    await expect(links).toHaveCount(researchNotes.length);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    const home = page.url();
    const [tab] = await Promise.all([page.context().waitForEvent("page"), links.first().click()]);
    await tab.waitForLoadState();
    expect(tab.url()).toBe(await links.first().getAttribute("href"));
    expect(page.url()).toBe(home);

    if (view === "search") {
      await page.getByLabel("Search Sid's work").fill("memory storage");
      const result = page.locator(".se-matches .se-result").filter({ hasText: "AI memory & storage" }).getByRole("link", { name: "AI memory & storage", exact: true });
      await expect(result).toHaveAttribute("href", noteUrl("memory-storage"));
      await expect(result).toHaveAttribute("target", "_blank");
      await expect(result).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
}
