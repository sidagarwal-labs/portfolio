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

test("Pitt Pirates links stay in Sid Search and its match videos play in the window", async ({ page }) => {
  const opened = trackNewTabs(page);
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Player</p>" }));
  await page.route(/^https:\/\/(i\.ytimg\.com|www\.pittpiratesrobotics\.com)\//, (route) => route.abort());
  const frame = await openSearch(page);
  const address = page.locator(`${searchWin} .os-address__text`);
  const windows = await page.locator(".os-win").count();

  await frame.locator(".se-panel").getByRole("link", { name: "the Pitt Pirates, FRC Team 2642", exact: true }).click();
  await expect(address).toHaveText(/#robotics$/);
  await expect(frame.getByRole("heading", { name: "Robotics", exact: true, level: 2 })).toBeInViewport();
  await expect(frame.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Robotics", exact: true })).toHaveAttribute("aria-current", "location");

  await frame.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "About", exact: true }).click();
  await expect(address).toHaveText(/#impact$/);
  await frame.locator("#impact").getByRole("link", { name: "the Pitt Pirates, FRC Team 2642", exact: true }).click();
  await expect(address).toHaveText(/#robotics$/);
  await expect(frame.locator("#robotics")).toBeInViewport();

  await frame.getByRole("button", { name: "Play 2017 Raleigh District, Final 3" }).click();
  await expect(frame.locator("#robotics iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/VzhwTXsN2io?autoplay=1&rel=0");
  await expect(page.locator(".os-win")).toHaveCount(windows);
  await expect(page.locator(searchWin)).toHaveClass(/is-active/);
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

test("Sid Search's Library filters in place and opens its titles and the app in the Library window", async ({ page }) => {
  const opened = trackNewTabs(page);
  const frame = await openSearch(page);
  const address = page.locator(`${searchWin} .os-address__text`);
  const library = page.locator('.os-win[data-app="library"]');

  await frame.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Library", exact: true }).click();
  await expect(address).toHaveText(/#library$/);
  const section = frame.locator("#library");
  const founders = section.getByRole("button", { name: /^Founders & companies/ });
  await founders.click();
  await expect(founders).toHaveAttribute("aria-pressed", "true");
  await expect(section.locator(".se-shelf > li")).toHaveCount(8);
  await expect(section.getByRole("status")).toContainText("Founders & companies: 4 books and 4 podcasts");
  await expect(address).toHaveText(/#library$/);

  await section.getByRole("link", { name: /Acquired/ }).click();
  await expect(library).toHaveClass(/is-active/);
  await expect(library.getByRole("complementary", { name: "Acquired" })).toBeVisible();
  await page.getByRole("button", { name: "Close Library" }).click();
  await expect(library).toHaveCount(0);

  await bringSearchForward(page);
  await expect(section.getByRole("link", { name: "Open Lab OS" })).toHaveCount(0);
  await section.getByRole("button", { name: "Open Library" }).click();
  await expect(library).toHaveClass(/is-active/);
  await bringSearchForward(page);
  await section.getByRole("button", { name: "Open Library" }).click();
  await expect(library).toHaveClass(/is-active/);
  await expect(library).toHaveCount(1);
  await expect(founders).toHaveAttribute("aria-pressed", "true");
  expect(opened).toEqual([]);
});

test("links to Sid's GitHub open the GitHub app, research notes open in its file view, and other pages open a new tab", async ({ page }) => {
  await page.context().route(/^https:\/\/(www\.linkedin\.com|github\.com)\//, (route) => route.fulfill({ contentType: "text/html", body: "<p>Outside site</p>" }));
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({ contentType: "text/plain; charset=utf-8", headers: { "access-control-allow-origin": "*" }, body: "# Routed Note\n\nFrom Sid Search.\n" })
  );
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

  await bringSearchForward(page);
  await frame.locator('a[href^="https://github.com/sidagarwal-labs/models/blob/"][href$=".md"]').first().click();
  await expect(github).toHaveClass(/is-active/);
  await expect(github.getByRole("article", { name: "Routed Note" })).toBeVisible();
  await expect(github).toHaveCount(1);

  // Code and other files on GitHub are not routed.
  const codeUrl = "https://github.com/sidagarwal-labs/models/blob/main/src/model.py";
  await bringSearchForward(page);
  await frame.locator("body").evaluate((body, href) => {
    const link = Object.assign(document.createElement("a"), { href, textContent: "Model code" });
    link.style.cssText = "position: fixed; top: 8px; left: 8px; z-index: 99999; background: #fff;";
    body.append(link);
  }, codeUrl);
  const code = page.context().waitForEvent("page");
  await frame.getByRole("link", { name: "Model code" }).click();
  await expect(await code).toHaveURL(codeUrl);
  await expect(github.getByRole("article", { name: "Routed Note" })).toBeAttached();
  await expect(github).toHaveCount(1);
});

/* The tracker sheet, quotes, charts, and launches never reach the network; the stack view falls back to its snapshot. */
async function blockLiveData(page: Page) {
  await page.route(/^https:\/\/(docs\.google\.com|finnhub\.io|s3\.tradingview\.com|ll\.thespacedevs\.com)\//, (route) => route.abort());
}

test("AI / LLM Stack Tracker links open the Markets window", async ({ page }) => {
  await blockLiveData(page);
  const opened = trackNewTabs(page);
  const frame = await openSearch(page);
  const tracker = frame.locator("#writing").getByRole("link", { name: "AI / LLM Stack Tracker", exact: true });
  await expect(tracker).toHaveAttribute("href", "/markets");
  await tracker.click();

  const markets = page.locator('.os-win[data-app="markets"]');
  const address = markets.locator(".os-address__text");
  const app = page.frameLocator('.os-win[data-app="markets"] iframe');
  await expect(markets).toHaveClass(/is-active/);
  await expect(address).toHaveText("agarwal-labs.com/markets");
  await expect(app.locator(".mk-status")).toHaveAttribute("data-source", "snapshot");
  await expect(app.getByRole("heading", { name: "Chips", level: 2 })).toBeVisible();
  await expect(page.locator(`${searchWin} .os-address__text`)).toHaveText(/^agarwal-labs\.com\/search\?q=/);
  await expect(frame.locator("#se-query")).toHaveValue("Sid Agarwal");

  /* An open Markets window is navigated rather than duplicated, and keeps its own history. Picking a company replaces
     the window's page instead of adding to it. */
  await app.locator("#mk-layer-chips").getByRole("link", { name: /^NVDA/ }).click();
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=NVDA");
  await expect(app.locator("#mk-preview-title")).toHaveText("NVIDIA");
  await expect(markets.getByRole("button", { name: "Back" })).toBeDisabled();
  await bringSearchForward(page);
  await tracker.click();
  await expect(markets).toHaveClass(/is-active/);
  await expect(markets).toHaveCount(1);
  await expect(address).toHaveText("agarwal-labs.com/markets");
  await expect(app.locator("#mk-preview-title")).toHaveText("MP Materials");
  await markets.getByRole("button", { name: "Back" }).click();
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=NVDA");
  await expect(app.locator("#mk-preview-title")).toHaveText("NVIDIA");

  /* Links between the live pages open each page's own app too. */
  await app.getByRole("navigation", { name: "Live pages" }).getByRole("link", { name: "Launches" }).click();
  const launches = page.locator('.os-win[data-app="launches"]');
  await expect(launches).toHaveClass(/is-active/);
  await expect(launches.locator(".os-address__text")).toHaveText("agarwal-labs.com/launches");
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=NVDA");
  expect(opened).toEqual([]);
});

test("old AI stack links open Markets in Lab OS without leaving the old address in its history", async ({ page }) => {
  await blockLiveData(page);
  const frame = await openSearch(page);
  /* Pages written before Markets became only the AI stack linked to /markets?view=stack. */
  const legacyLink = async (href: string) => {
    await bringSearchForward(page);
    await frame.locator("#writing").evaluate((section, value) => {
      section.querySelector("[data-test-legacy]")?.remove();
      const link = document.createElement("a");
      link.href = value;
      link.textContent = "Old stack link";
      link.dataset.testLegacy = "";
      section.prepend(link);
    }, href);
    await frame.getByRole("link", { name: "Old stack link" }).click();
  };

  await legacyLink("/markets?view=stack&symbol=NVDA");
  const markets = page.locator('.os-win[data-app="markets"]');
  const address = markets.locator(".os-address__text");
  const app = page.frameLocator('.os-win[data-app="markets"] iframe');
  await expect(markets).toHaveClass(/is-active/);
  await expect(app.locator("#mk-preview-title")).toHaveText("NVIDIA");
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=NVDA");
  await expect(markets.getByRole("button", { name: "Back" })).toBeDisabled();

  await legacyLink("/markets?view=stack");
  await expect(markets).toHaveCount(1);
  await expect(address).toHaveText("agarwal-labs.com/markets");
  await expect(app.locator("#mk-preview-title")).toHaveText("MP Materials");
  await markets.getByRole("button", { name: "Back" }).click();
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=NVDA");
  await expect(markets.getByRole("button", { name: "Back" })).toBeDisabled();
  await markets.getByRole("button", { name: "Forward" }).click();
  await expect(address).toHaveText("agarwal-labs.com/markets");
  await expect(app.locator("#mk-preview-title")).toHaveText("MP Materials");
});

test("outside Lab OS, AI / LLM Stack Tracker links go to Markets", async ({ page }) => {
  await blockLiveData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=search");
  await page.locator("#writing").getByRole("link", { name: "AI / LLM Stack Tracker", exact: true }).click();
  await expect(page).toHaveURL(/\/markets$/);
  await expect(page.getByRole("heading", { name: "Chips", level: 2 })).toBeVisible();

  await page.goBack();
  const query = page.getByLabel("Search Sid's work");
  await query.fill("stack tracker");
  const result = page.locator(".se-matches .se-result").filter({ has: page.getByRole("link", { name: "AI / LLM Stack Tracker", exact: true }) });
  await expect(result.locator(".se-source__url")).toHaveText("agarwal-labs.com › markets");
  await result.getByRole("link", { name: "AI / LLM Stack Tracker", exact: true }).click();
  await expect(page).toHaveURL(/\/markets$/);
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "snapshot");
});
