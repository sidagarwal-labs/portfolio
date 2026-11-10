import { expect, test, type Page } from "@playwright/test";

const searchWin = '.os-win[data-app="search"]';

/* Records every new tab or window, so routed links can prove they stayed inside Lab OS. */
function trackNewTabs(page: Page) {
  const opened: string[] = [];
  page.context().on("page", (tab) => opened.push(tab.url()));
  return opened;
}

async function openSearch(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com|avatars\.githubusercontent\.com)\//, (route) => route.abort());
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.goto("./");
  const frame = page.frameLocator(`${searchWin} iframe`);
  await expect(frame.locator("#se-query")).toHaveValue("Sid Agarwal");
  return frame;
}

/* The taskbar button minimizes the active window, so only click it when another window is in front. */
async function bringSearchForward(page: Page) {
  const win = page.locator(searchWin);
  if (!/\bis-active\b/.test((await win.getAttribute("class")) ?? "")) await page.locator(".os-task", { hasText: "Sid Search" }).click();
  await expect(win).toHaveClass(/is-active/);
}

test("Microsoft links in Sid Search open their summaries in one Reader window", async ({ page }) => {
  const opened = trackNewTabs(page);
  const frame = await openSearch(page);

  await frame.getByRole("link", { name: "Power BI", exact: true }).first().click();
  const reader = page.locator('.os-win[data-app="reader"]');
  await expect(reader).toHaveClass(/is-active/);
  await expect(reader.getByRole("article", { name: "Copilot in Power BI" })).toBeVisible();
  await expect(reader.getByRole("heading", { name: "Copilot in Power BI", level: 2 })).toBeFocused();

  await bringSearchForward(page);
  await frame.getByRole("link", { name: "Copilot Connectors", exact: true }).first().click();
  await expect(reader).toHaveClass(/is-active/);
  await expect(reader.getByRole("article", { name: "Microsoft 365 Copilot connectors" })).toBeVisible();
  await expect(reader).toHaveCount(1);
  expect(opened).toEqual([]);
});

test("book and podcast links open the Library on that title", async ({ page }) => {
  const opened = trackNewTabs(page);
  const frame = await openSearch(page);

  await frame.locator("#library").getByRole("link", { name: "The Nvidia Way" }).click();
  const library = page.locator('.os-win[data-app="library"]');
  await expect(library).toHaveClass(/is-active/);
  await expect(library.getByRole("complementary", { name: "The Nvidia Way" })).toBeVisible();

  await bringSearchForward(page);
  await frame.locator("#se-query").fill("Acquired");
  await frame.locator("#se-query").press("Enter");
  await frame.locator('a[href^="https://open.spotify.com/show/7Fj0XEuUQLUqoMZQdsLXqp"]').first().click();
  await expect(library.getByRole("complementary", { name: "Acquired" })).toBeVisible();
  await expect(library).toHaveCount(1);
  expect(opened).toEqual([]);
});

test("links to Sid's GitHub open the GitHub app, while deeper GitHub pages and other sites open a new tab", async ({ page }) => {
  await page.context().route(/^https:\/\/(www\.linkedin\.com|github\.com)\//, (route) => route.fulfill({ contentType: "text/html", body: "<p>Outside site</p>" }));
  const frame = await openSearch(page);

  await frame.locator("#contact").getByRole("link", { name: "GitHub", exact: true }).click();
  const github = page.locator('.os-win[data-app="github"]');
  await expect(github).toHaveClass(/is-active/);
  await expect(github.getByRole("heading", { name: "Sid Agarwal", level: 3 })).toBeVisible();
  await page.getByRole("button", { name: "Close GitHub" }).click();
  await expect(github).toHaveCount(0);

  await bringSearchForward(page);
  await frame.getByRole("link", { name: "arXiv Search on GitHub" }).first().click();
  await expect(github).toHaveClass(/is-active/);
  const repo = github.locator('.gh-repo[data-repo="arxiv-search"]');
  await expect(repo).toHaveClass(/is-highlighted/);
  await expect(repo).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "Close GitHub" }).click();

  await page.locator(".os-quick").getByRole("link", { name: "GitHub", exact: true }).click();
  await expect(github).toHaveClass(/is-active/);

  await bringSearchForward(page);
  const linkedIn = page.context().waitForEvent("page");
  await frame.locator("#contact").getByRole("link", { name: "LinkedIn", exact: true }).click();
  await expect(await linkedIn).toHaveURL("https://www.linkedin.com/in/sid-agarwal-labs/");

  const note = page.context().waitForEvent("page");
  await frame.locator('a[href^="https://github.com/sidagarwal-labs/models/blob/"]').first().click();
  await expect(await note).toHaveURL(/^https:\/\/github\.com\/sidagarwal-labs\/models\/blob\//);
  await expect(page.locator('.os-win[data-app="github"]')).toHaveCount(1);
});

/* The tracker sheet, quotes, charts, and launches never reach the network; the stack view falls back to its snapshot. */
async function blockLiveData(page: Page) {
  await page.route(/^https:\/\/(docs\.google\.com|finnhub\.io|s3\.tradingview\.com|ll\.thespacedevs\.com)\//, (route) => route.abort());
}

test("AI / LLM Stack Tracker links open the Markets window at the AI stack view", async ({ page }) => {
  await blockLiveData(page);
  const opened = trackNewTabs(page);
  const frame = await openSearch(page);
  const tracker = frame.locator("#writing").getByRole("link", { name: "AI / LLM Stack Tracker", exact: true });
  await expect(tracker).toHaveAttribute("href", "/markets?view=stack");
  await tracker.click();

  const markets = page.locator('.os-win[data-app="markets"]');
  const address = markets.locator(".os-address__text");
  const app = page.frameLocator('.os-win[data-app="markets"] iframe');
  await expect(markets).toHaveClass(/is-active/);
  await expect(address).toHaveText("agarwal-labs.com/markets?view=stack");
  await expect(app.locator(".mk-status")).toHaveAttribute("data-source", "snapshot");
  await expect(app.getByRole("heading", { name: "Chips", level: 2 })).toBeVisible();
  await expect(page.locator(`${searchWin} .os-address__text`)).toHaveText(/^agarwal-labs\.com\/search\?q=/);
  await expect(frame.locator("#se-query")).toHaveValue("Sid Agarwal");

  /* An open Markets window is navigated rather than duplicated, and keeps its own history. */
  await app.getByRole("navigation", { name: "Markets views" }).getByRole("link", { name: "Watchlist" }).click();
  await expect(address).toHaveText("agarwal-labs.com/markets");
  await bringSearchForward(page);
  await tracker.click();
  await expect(markets).toHaveClass(/is-active/);
  await expect(markets).toHaveCount(1);
  await expect(address).toHaveText("agarwal-labs.com/markets?view=stack");
  await expect(app.getByRole("heading", { name: "Chips", level: 2 })).toBeVisible();
  await markets.getByRole("button", { name: "Back" }).click();
  await expect(address).toHaveText("agarwal-labs.com/markets");

  /* Links between the live pages open each page's own app too. */
  await app.getByRole("navigation", { name: "Live pages" }).getByRole("link", { name: "Launches" }).click();
  const launches = page.locator('.os-win[data-app="launches"]');
  await expect(launches).toHaveClass(/is-active/);
  await expect(launches.locator(".os-address__text")).toHaveText("agarwal-labs.com/launches");
  await expect(address).toHaveText("agarwal-labs.com/markets");
  expect(opened).toEqual([]);
});

test("outside Lab OS, AI / LLM Stack Tracker links go to the Markets AI stack view", async ({ page }) => {
  await blockLiveData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=search");
  await page.locator("#writing").getByRole("link", { name: "AI / LLM Stack Tracker", exact: true }).click();
  await expect(page).toHaveURL(/\/markets\?view=stack$/);
  await expect(page.getByRole("heading", { name: "Chips", level: 2 })).toBeVisible();

  await page.goBack();
  const query = page.getByLabel("Search Sid's work");
  await query.fill("stack tracker");
  const result = page.locator(".se-matches .se-result").filter({ has: page.getByRole("link", { name: "AI / LLM Stack Tracker", exact: true }) });
  await expect(result.locator(".se-source__url")).toHaveText("agarwal-labs.com › markets");
  await result.getByRole("link", { name: "AI / LLM Stack Tracker", exact: true }).click();
  await expect(page).toHaveURL(/\/markets\?view=stack$/);
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "snapshot");
});
