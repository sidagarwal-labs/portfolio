import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { archivedResearchNotes, featuredResearchNotes, researchNotes } from "../../src/content/journalContent";

const noteLinks = 'a[href^="https://github.com/sidagarwal-labs/models/blob/main/notes/"]';
const views = ["journal", "search", "forward", "training", "terminal"] as const;
const insightsName = "Markets › Insights";

/* The tracker sheet, quotes, charts, launches, and GitHub never reach the network. */
async function blockNetwork(page: Page) {
  await page.route(/^https:\/\/(docs\.google\.com|finnhub\.io|s3\.tradingview\.com|ll\.thespacedevs\.com|api\.github\.com|i\.scdn\.co|m\.media-amazon\.com|avatars\.githubusercontent\.com)\//, (route) => route.abort());
}

const insightsLink = (scope: Page | FrameLocator) => scope.locator("#writing").getByRole("link", { name: insightsName, exact: true });

test("the featured notes are the newest AI buildout edition, then the most recently updated topics", () => {
  expect(featuredResearchNotes.map((note) => note.title)).toEqual(["AI buildout: October 2026", "Foundation labs", "AI memory & storage"]);
  expect(archivedResearchNotes.map((note) => note.title)).toEqual([
    "GPU & memory prices", "AI capital expenditure", "AI adoption", "Cloud growth", "AI buildout: September 2026"
  ]);
  expect([...featuredResearchNotes, ...archivedResearchNotes].map((note) => note.slug).sort()).toEqual(researchNotes.map((note) => note.slug).sort());
});

for (const view of views) {
  test(`?view=${view} shows three notes, links to Markets Insights, and keeps the rest under All research notes`, async ({ page }) => {
    await blockNetwork(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`./?view=${view}`);
    const writing = page.locator("#writing");
    const archive = writing.locator("details");
    await expect(archive).toHaveCount(1);
    await expect(archive.locator("summary")).toHaveText("All research notes");
    await expect(archive).not.toHaveAttribute("open", "");

    const featured = writing.locator(`${noteLinks}:not(details ${noteLinks})`);
    // Sid Search's note cards also hold a source line and date, so match the titles within each link.
    await expect(featured).toHaveCount(featuredResearchNotes.length);
    await expect(featured).toContainText(featuredResearchNotes.map((note) => note.title));
    for (const link of await featured.all()) await expect(link).toBeVisible();
    await expect(archive.locator(noteLinks)).toHaveText(archivedResearchNotes.map((note) => note.title));
    await expect(writing.locator(noteLinks)).toHaveCount(researchNotes.length);
    for (const link of await writing.locator(noteLinks).all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }

    await expect(insightsLink(page)).toHaveAttribute("href", "/markets?tab=insights");
    await expect(writing.locator(".notes-insights")).toContainText("Charts and deep dives built from these notes");
    // Essays from profileContent.writing stay in the main list, counted with the featured notes below.
    const essays = writing.locator('a[href^="/writing/"]:not(details a)');
    for (const essay of await essays.all()) await expect(essay).toBeVisible();
    const essayCount = await essays.count();

    if (view === "terminal") {
      const items = featuredResearchNotes.length + essayCount;
      await expect(writing.locator(".tm-panel__meta")).toHaveText(`${items} ${items === 1 ? "item" : "items"}`);
      await expect(writing.locator(".tm-wire > li")).toHaveCount(items);
    }
    if (view === "training") {
      const rows = featuredResearchNotes.length + essayCount;
      await expect(writing.locator(".tr-table__index")).toHaveText(Array.from({ length: rows }, (_, index) => String(index)));
    }

    await archive.locator("summary").click();
    await expect(archive.locator(noteLinks).last()).toBeVisible();
  });
}

test("outside Lab OS, every view's Markets Insights link opens the Insights tab", async ({ page }) => {
  await blockNetwork(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const view of views) {
    await page.goto(`./?view=${view}`);
    await insightsLink(page).click();
    await expect(page, view).toHaveURL(/\/markets\?tab=insights$/);
    await expect(page.getByRole("tab", { name: "Insights" })).toHaveAttribute("aria-selected", "true");
  }
});

const designApps = { journal: "Journal", training: "Training run", terminal: "Terminal" } as const;

async function openFromStart(page: Page, app: "forward" | keyof typeof designApps) {
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  if (app === "forward") await menu.getByLabel("Apps", { exact: true }).getByRole("button", { name: "Forward pass", exact: true }).click();
  else {
    await menu.getByRole("button", { name: "Other designs", exact: true }).click();
    await menu.getByRole("list", { name: "Other designs", exact: true }).getByRole("button", { name: designApps[app], exact: true }).click();
  }
  await expect(page.locator(`.os-win[data-app="${app}"]`)).toHaveClass(/is-active/);
  return page.frameLocator(`.os-win[data-app="${app}"] iframe`);
}

test("in Lab OS, the Markets Insights link in every view opens Markets on the Insights tab", async ({ page }) => {
  const opened: string[] = [];
  page.context().on("page", (tab) => opened.push(tab.url()));
  await blockNetwork(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  const markets = page.locator('.os-win[data-app="markets"]');
  const address = markets.locator(".os-address__text");
  const app = page.frameLocator('.os-win[data-app="markets"] iframe');
  const insightsTab = app.getByRole("tab", { name: "Insights" });

  const search = page.frameLocator('.os-win[data-app="search"] iframe');
  await expect(search.locator("#se-query")).toHaveValue("Sid Agarwal");
  await insightsLink(search).click();
  await expect(markets).toHaveClass(/is-active/);
  await expect(address).toHaveText("agarwal-labs.com/markets?tab=insights");
  await expect(insightsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('.os-win[data-app="search"] .os-address__text')).toHaveText(/^agarwal-labs\.com\/search\?q=/);

  for (const view of ["forward", "journal", "training", "terminal"] as const) {
    // An open Markets window on the Stack tab is navigated to Insights, not duplicated.
    await app.getByRole("tab", { name: "Stack" }).click();
    await expect(address).toHaveText("agarwal-labs.com/markets");
    const frame = await openFromStart(page, view);
    await insightsLink(frame).click();
    await expect(markets, view).toHaveClass(/is-active/);
    await expect(address, view).toHaveText("agarwal-labs.com/markets?tab=insights");
    await expect(insightsTab, view).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`.os-win[data-app="${view}"] .os-address__text`)).not.toHaveText(/markets/);
  }
  await expect(markets).toHaveCount(1);
  expect(opened).toEqual([]);
});

test("on a phone, the Markets Insights link in every Lab OS app opens Markets full screen on Insights", async ({ page }) => {
  const opened: string[] = [];
  page.context().on("page", (tab) => opened.push(tab.url()));
  await blockNetwork(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?view=os");
  const home = page.locator(".os-home");
  const markets = page.locator('.os-win[data-app="markets"]');
  const titles = { search: "Sid Search", forward: "Forward pass", ...designApps };

  for (const [app, title] of Object.entries(titles)) {
    await expect(home).toBeVisible();
    if (app in designApps) {
      await home.locator(".os-icon", { hasText: "Other designs" }).click();
      await page.getByRole("list", { name: "Other designs apps", exact: true }).locator(".os-icon", { hasText: title }).click();
    } else await home.locator(".os-home__grid .os-icon", { hasText: title }).click();
    await expect(page.locator(`.os-win[data-app="${app}"]`)).toHaveClass(/is-active/);
    await insightsLink(page.frameLocator(`.os-win[data-app="${app}"] iframe`)).click();
    await expect(markets, app).toHaveClass(/is-active/);
    expect((await markets.boundingBox())?.width).toBe(390);
    const insightsTab = page.frameLocator('.os-win[data-app="markets"] iframe').getByRole("tab", { name: "Insights" });
    await expect(insightsTab, app).toHaveAttribute("aria-selected", "true");
    await markets.getByRole("button", { name: "Home" }).click();
  }
  await expect(markets).toHaveCount(1);
  expect(opened).toEqual([]);
});
