import { expect, test, type Page } from "@playwright/test";

const arxivWin = '.os-win[data-app="arxiv"]';
const githubWin = '.os-win[data-app="github"]';
const searchWin = '.os-win[data-app="search"]';
const projects = ["NVDocs RAG", "HireMe.AI", "Financial models", "Reader"];

/* Stands in for arxiv.agarwal-labs.com. Like the live site's portfolio.js, the ready variant posts only to the origin
   named by the frame's referrer, so it also proves the frame sends one. */
const mockSite = (ready: boolean) => `<!doctype html><html><head><title>arXiv Search</title></head><body>
<h1>Mock arXiv Search</h1><p id="where"></p>
<script>
document.getElementById("where").textContent = location.pathname + location.search;
${ready ? `try { if (parent !== window) parent.postMessage({ type: "arxiv-search:ready" }, new URL(document.referrer).origin); } catch (error) {}` : ""}
</script></body></html>`;

/* Every request to the live site is answered locally; the ready flag can change between loads. */
async function mockArxiv(page: Page, ready: boolean) {
  const state = { ready, requests: [] as { url: string; referer: string | null }[] };
  await page.route("https://arxiv.agarwal-labs.com/**", async (route) => {
    state.requests.push({ url: route.request().url(), referer: await route.request().headerValue("referer") });
    await route.fulfill({ contentType: "text/html", body: mockSite(state.ready) });
  });
  return state;
}

async function blockOutside(page: Page) {
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://finnhub.io/**", (route) => route.abort());
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com|avatars\.githubusercontent\.com|s3\.tradingview\.com|datasets-server\.huggingface\.co)\//, (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
}

function trackNewTabs(page: Page) {
  const opened: string[] = [];
  page.context().on("page", (tab) => opened.push(tab.url()));
  return opened;
}

async function openDesktop(page: Page, style = "modern") {
  await blockOutside(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`./?view=os&style=${style}`);
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
}

async function showDesktop(page: Page) {
  const button = page.locator(".os-show-desktop");
  if ((await button.getAttribute("aria-label")) === "Show desktop") await button.click();
  await expect(page.locator(".os-win:not(.is-minimized)")).toHaveCount(0);
}

async function openProjectsFolder(page: Page) {
  await page.locator(".os-icons .os-icon", { hasText: "Projects" }).click();
  const folder = page.getByRole("list", { name: "Projects apps", exact: true });
  await expect(folder).toBeVisible();
  return folder;
}

async function openArxiv(page: Page, style = "modern") {
  await openDesktop(page, style);
  await page.locator(".os-icons").getByRole("button", { name: "arXiv Search", exact: true }).click();
  const win = page.locator(arxivWin);
  await expect(win).toHaveClass(/is-active/);
  return win;
}

const iconLabels = {
  search: "Sid Search", projects: "Projects", arxiv: "arXiv Search", library: "Library", github: "GitHub",
  forward: "Forward pass", designs: "Other designs",
  games: "Games", markets: "Markets", launches: "Launches", leaderboards: "AI leaderboards",
  resume: "Resume.pdf", readme: "README.txt"
};
type IconId = keyof typeof iconLabels;
type Layout = Partial<Record<IconId, { col: number; row: number }>>;

/* Opens the desktop with an icon arrangement already saved in browser storage. */
async function openSavedDesktop(page: Page, saved: Layout, viewport = { width: 1440, height: 900 }) {
  await page.addInitScript((layout) => localStorage.setItem("lab-os-icons-v2", JSON.stringify(layout)), saved);
  await blockOutside(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
}

/* Each desktop icon's grid cell, read from where it renders, and the number of columns that fit. */
async function desktopCells(page: Page) {
  const desk = (await page.locator(".os-desktop").boundingBox())!;
  const items = await page.locator(".os-icons > li").evaluateAll((list) => list.map((item) => {
    const { x, y } = item.getBoundingClientRect();
    return { label: item.querySelector(".os-icon__label")?.textContent ?? "", x, y };
  }));
  const ids = Object.keys(iconLabels) as IconId[];
  const cells: Layout = {};
  for (const { label, x, y } of items) {
    const id = ids.find((key) => iconLabels[key] === label);
    if (!id) throw new Error(`Unexpected desktop icon "${label}"`);
    cells[id] = { col: (x - desk.x - 8) / 92, row: (y - desk.y - 8) / 92 };
  }
  return { cells, columns: Math.floor((desk.width - 16) / 92) };
}

function expectNoOverlap(cells: Layout) {
  const slots = Object.values(cells).map(({ col, row }) => `${col},${row}`);
  expect(slots).toHaveLength(Object.keys(iconLabels).length);
  expect(new Set(slots).size, "no two icons share a slot").toBe(slots.length);
}

async function expectRepoInGitHub(page: Page, repo: string) {
  const github = page.locator(githubWin);
  await expect(github).toHaveClass(/is-active/);
  const card = github.locator(`.gh-repo[data-repo="${repo.toLowerCase()}"]`);
  await expect(card).toHaveClass(/is-highlighted/);
  await expect(card).toHaveAttribute("aria-current", "true");
}

test("the desktop shows arXiv Search right after the Projects folder, which lists the other four projects", async ({ page }) => {
  await openDesktop(page);
  const desktopLabels = await page.locator(".os-icons .os-icon__label").allTextContents();
  expect(desktopLabels.slice(0, 5)).toEqual(["Sid Search", "Projects", "arXiv Search", "Library", "GitHub"]);
  for (const title of projects) expect(desktopLabels).not.toContain(title);

  const icons = page.locator(".os-icons");
  const projectsBox = (await icons.getByRole("button", { name: "Projects", exact: true }).boundingBox())!;
  const arxivIcon = icons.getByRole("button", { name: "arXiv Search", exact: true });
  const arxivBox = (await arxivIcon.boundingBox())!;
  expect(arxivBox.x, "arXiv Search sits one column right of Projects").toBe(projectsBox.x + 92);
  expect(arxivBox.y).toBe(projectsBox.y);

  const folder = await openProjectsFolder(page);
  await expect(folder.locator(".os-icon__label")).toHaveText(projects);
  await expect(folder.locator(".os-icon", { hasText: "arXiv Search" })).toHaveCount(0);

  await showDesktop(page);
  await arxivIcon.click();
  const win = page.locator(arxivWin);
  await expect(win).toHaveClass(/is-active/);
  await expect(win.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(win.locator(".ax-stat__value").first()).toBeVisible();
});

test("arXiv Search is a top-level app in the Start menu and on the phone home screen", async ({ page }) => {
  await openDesktop(page);
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  const appList = menu.getByRole("list", { name: "Apps", exact: true });
  await expect(appList.locator(":scope > li > button", { hasText: "Reader" })).toHaveCount(0);
  await expect(appList.locator(":scope > li > button").nth(1)).toHaveText("arXiv Search");
  await appList.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(menu.getByRole("list", { name: "Projects", exact: true }).getByRole("button")).toHaveText(projects);
  const search = menu.getByRole("searchbox", { name: "Search apps" });
  const results = menu.getByRole("list", { name: "Search results", exact: true });
  await search.fill("arxiv");
  await expect(results.getByRole("button", { name: "arXiv Search", exact: true })).toHaveAccessibleDescription("");
  await search.fill("reader");
  await expect(results.getByRole("button", { name: "Reader", exact: true })).toHaveAccessibleDescription("in Projects");
  await search.fill("");
  await appList.getByRole("button", { name: "arXiv Search", exact: true }).click();
  await expect(page.locator(arxivWin)).toHaveClass(/is-active/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?view=os");
  const home = page.locator(".os-home").getByRole("list", { name: "Apps", exact: true });
  await expect(home.locator(".os-icon__label").nth(1)).toHaveText("arXiv Search");
  await expect(home.locator(".os-icon")).toHaveCount(14);
  await expect(home.locator(".os-icon", { hasText: "Reader" })).toHaveCount(0);
  await home.locator(".os-icon", { hasText: "Projects" }).click();
  const phoneFolder = page.getByRole("list", { name: "Projects apps", exact: true });
  await expect(phoneFolder.locator(".os-icon__label")).toHaveText(projects);
  await page.locator('.os-win[data-app="projects"]').getByRole("button", { name: "Home" }).click();
  await home.getByRole("button", { name: "arXiv Search", exact: true }).click();
  const win = page.locator(arxivWin);
  await expect(win).toHaveClass(/is-active/);
  expect((await win.boundingBox())?.width).toBe(390);
  await expect(win.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(win.locator(".ax-stat__value").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("a desktop arrangement saved before arXiv Search had an icon puts it beside Projects", async ({ page }) => {
  const saved: Layout = {
    search: { col: 0, row: 0 }, projects: { col: 1, row: 0 }, library: { col: 2, row: 0 }, github: { col: 3, row: 0 },
    forward: { col: 0, row: 1 }, designs: { col: 1, row: 1 },
    games: { col: 0, row: 2 }, markets: { col: 1, row: 2 }, launches: { col: 2, row: 2 }, leaderboards: { col: 3, row: 2 },
    resume: { col: 0, row: 8 }, readme: { col: 1, row: 8 }
  };
  await openSavedDesktop(page, saved);
  const { cells } = await desktopCells(page);
  expect(cells, "arXiv Search sits right of Projects; Library and GitHub move one column right; nothing else moves").toEqual({
    ...saved, arxiv: { col: 2, row: 0 }, library: { col: 3, row: 0 }, github: { col: 4, row: 0 }
  });
  expectNoOverlap(cells);

  /* Moving any icon saves the whole arrangement, arXiv Search included, so later visits match. */
  await page.locator(".os-icons").getByRole("button", { name: "GitHub", exact: true }).focus();
  await page.keyboard.press("Shift+ArrowRight");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lab-os-icons-v2") ?? "{}"));
  expect(stored).toMatchObject({ projects: { col: 1, row: 0 }, arxiv: { col: 2, row: 0 }, library: { col: 3, row: 0 }, github: { col: 5, row: 0 } });

  /* The phone home screen lists apps in menu order, whatever the desktop arrangement. */
  await page.setViewportSize({ width: 390, height: 844 });
  const home = page.locator(".os-home").getByRole("list", { name: "Apps", exact: true });
  await expect(home.locator(".os-icon__label").nth(1)).toHaveText("arXiv Search");
  await expect(home.locator(".os-icon")).toHaveCount(13);
});

test("when the shift does not fit a full row, arXiv Search takes the nearest free slot in that row", async ({ page }) => {
  const saved: Layout = {
    search: { col: 0, row: 0 }, projects: { col: 2, row: 0 }, library: { col: 3, row: 0 }, github: { col: 4, row: 0 },
    games: { col: 5, row: 0 }, markets: { col: 6, row: 0 }, launches: { col: 7, row: 0 },
    forward: { col: 0, row: 1 }, designs: { col: 1, row: 1 }, leaderboards: { col: 0, row: 2 },
    resume: { col: 0, row: 3 }, readme: { col: 1, row: 3 }
  };
  await openSavedDesktop(page, saved, { width: 800, height: 600 });
  const { cells, columns } = await desktopCells(page);
  expect(columns, "the narrowest desktop has eight columns, so row 0 is full from Projects on").toBe(8);
  expect(cells, "saved icons keep their places; arXiv Search takes the gap left of Projects, not a new row").toEqual({ ...saved, arxiv: { col: 1, row: 0 } });
  expectNoOverlap(cells);
});

test("arXiv Search goes beside Projects where the user moved it", async ({ page }) => {
  const saved: Layout = {
    search: { col: 0, row: 0 }, library: { col: 2, row: 0 }, github: { col: 3, row: 0 },
    forward: { col: 0, row: 1 }, designs: { col: 1, row: 1 }, projects: { col: 2, row: 1 },
    games: { col: 0, row: 2 }, markets: { col: 1, row: 2 }, launches: { col: 2, row: 2 }, leaderboards: { col: 3, row: 2 },
    resume: { col: 0, row: 8 }, readme: { col: 1, row: 8 }
  };
  await openSavedDesktop(page, saved);
  const { cells } = await desktopCells(page);
  expect(cells).toEqual({ ...saved, arxiv: { col: 3, row: 1 } });
  expectNoOverlap(cells);
});

test("a saved arXiv Search position is kept", async ({ page }) => {
  const saved: Layout = {
    search: { col: 0, row: 0 }, projects: { col: 1, row: 0 }, library: { col: 3, row: 0 }, github: { col: 4, row: 0 },
    forward: { col: 0, row: 1 }, designs: { col: 1, row: 1 }, arxiv: { col: 6, row: 3 },
    games: { col: 0, row: 2 }, markets: { col: 1, row: 2 }, launches: { col: 2, row: 2 }, leaderboards: { col: 3, row: 2 },
    resume: { col: 0, row: 8 }, readme: { col: 1, row: 8 }
  };
  await openSavedDesktop(page, saved);
  const { cells } = await desktopCells(page);
  expect(cells, "no icon moves into arXiv Search's default slot, and arXiv Search stays where it was saved").toEqual(saved);
});

test("NVDocs RAG, HireMe.AI, and Financial models open their repositories in GitHub, and Reader opens from the folder", async ({ page }) => {
  await openDesktop(page);
  for (const [title, repo] of [["NVDocs RAG", "NVDocs_RAG"], ["HireMe.AI", "HireMe-AI"], ["Financial models", "models"]]) {
    await showDesktop(page);
    const folder = await openProjectsFolder(page);
    await folder.locator(".os-icon", { hasText: title }).click();
    await expectRepoInGitHub(page, repo);
    await expect(page.locator(githubWin)).toHaveCount(1);
  }
  await expect(page.locator('.os-win[data-app="nvdocs"], .os-win[data-app="hireme"], .os-win[data-app="finmodels"]')).toHaveCount(0);

  await showDesktop(page);
  const folder = await openProjectsFolder(page);
  await folder.locator(".os-icon", { hasText: "Reader" }).click();
  const reader = page.locator('.os-win[data-app="reader"]');
  await expect(reader).toHaveClass(/is-active/);
  await expect(reader.getByRole("article", { name: "Microsoft 365 Copilot", exact: true })).toBeVisible();
});

test("the arXiv Search overview shows the headline metrics, the hill-climbing chart, and its data table", async ({ page }) => {
  const opened = trackNewTabs(page);
  const site = await mockArxiv(page, true);
  const win = await openArxiv(page);
  await expect(win.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(win.getByRole("tab", { name: "Try it live" })).toHaveAttribute("aria-selected", "false");

  const stats = win.locator(".ax-stats");
  await expect(stats.locator("dt")).toHaveText(["nDCG@10", "Source R@10", "Source MRR@10", "Papers"]);
  await expect(stats.locator(".ax-stat__value")).toHaveText(["0.5068 → 0.8418", "93%", "0.7659", "23,304"]);
  await expect(stats).not.toContainText("0.7007");

  const chart = win.getByRole("img", { name: /Line chart of nDCG@10 across 10 milestones/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator(".ax-point")).toHaveCount(10);
  await expect(chart.locator(".ax-stage__name")).toHaveText(["Stage 1", "Stage 2"]);

  const table = win.getByRole("region", { name: "Hill-climbing milestones" }).getByRole("table");
  const rows = table.locator("tbody tr");
  await expect(rows.locator("th")).toHaveText(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10"]);
  await expect(rows.first()).toContainText("Tuned BM25");
  await expect(rows.first().locator("td").nth(2)).toHaveText("0.5068");
  await expect(rows.nth(6).locator("td").nth(2)).toHaveText("0.7007");
  await expect(rows.last().locator("td").nth(2)).toHaveText("0.8418*");
  await expect(rows.last().locator("td").nth(4)).toHaveText("0.7659");
  await expect(rows.last().locator("td").nth(5)).toHaveText("93%");
  await expect(table.locator('tbody tr[data-stage="1"]')).toHaveCount(7);
  await expect(table.locator('tbody tr[data-stage="2"]')).toHaveCount(3);
  await expect(table).toHaveAccessibleName(/^Hill-climbing milestones on 100 dev queries \(3,579 judgments; \* 3,678\)$/);

  const caveats = win.locator(".ax-caveats");
  await expect(caveats).toContainText("100 development queries");
  await expect(caveats).toContainText("M1 is tuned BM25, not the original plain-BM25 control");
  await expect(caveats).toContainText("3,678 judgments");
  await expect(caveats.getByRole("link", { name: /docs\/06-charts\.md/ })).toHaveAttribute("href", /^https:\/\/github\.com\/sidagarwal-labs\/arxiv-search\/blob\/[0-9a-f]{40}\/docs\/06-charts\.md#/);

  await expect(win.getByRole("link", { name: "Open live site" })).toHaveAttribute("href", "https://arxiv.agarwal-labs.com/");
  await expect(win.getByRole("link", { name: "Open live site" })).toHaveAttribute("target", "_blank");
  expect(site.requests, "the live site only loads once Try it live opens").toEqual([]);

  await win.getByRole("button", { name: "Code on GitHub" }).click();
  await expectRepoInGitHub(page, "arxiv-search");

  await page.locator(".os-task", { hasText: "arXiv Search" }).click();
  await win.locator('.ax-card[data-card="nvdocs"]').getByRole("button", { name: "Open NVDocs RAG in GitHub" }).click();
  await expectRepoInGitHub(page, "NVDocs_RAG");

  await page.locator(".os-task", { hasText: "arXiv Search" }).click();
  await win.locator('.ax-card[data-card="rankit"]').getByRole("button", { name: "Play Rank It" }).click();
  await expect(page.locator('.os-win[data-app="rankit"]')).toHaveClass(/is-active/);
  expect(opened).toEqual([]);
});

test("Try it live shows the site once it reports ready", async ({ page }) => {
  const site = await mockArxiv(page, true);
  const win = await openArxiv(page);
  await win.getByRole("tab", { name: "Try it live" }).click();
  await expect(win.getByRole("tab", { name: "Try it live" })).toHaveAttribute("aria-selected", "true");

  const live = win.locator(".ax-live");
  await expect(live).toHaveAttribute("data-phase", "ready");
  const frame = win.locator("iframe.ax-live__frame");
  await expect(frame).toHaveAttribute("src", "https://arxiv.agarwal-labs.com/");
  await expect(frame).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  await expect(frame).toHaveAttribute("sandbox", /allow-scripts/);
  await expect(frame).toHaveAttribute("sandbox", /allow-same-origin/);
  await expect(frame).toHaveAttribute("sandbox", /allow-popups/);
  await expect(page.frameLocator(`${arxivWin} iframe.ax-live__frame`).getByRole("heading", { name: "Mock arXiv Search" })).toBeVisible();
  await expect(win.locator(".ax-live__cover")).toBeHidden();
  await expect(win.locator(".ax-fallback")).toHaveCount(0);
  await expect(win.locator(".os-address__text")).toHaveText("arxiv.agarwal-labs.com");

  const origin = new URL(page.url()).origin;
  expect(site.requests).toEqual([{ url: "https://arxiv.agarwal-labs.com/", referer: `${origin}/` }]);

  const newTab = win.locator(".ax-live__bar").getByRole("link", { name: "Open in new tab" });
  await expect(newTab).toBeVisible();
  await expect(newTab).toHaveAttribute("href", "https://arxiv.agarwal-labs.com/");
  await expect(newTab).toHaveAttribute("target", "_blank");

  // Switching tabs keeps the live session instead of reloading it.
  await win.getByRole("tab", { name: "Overview" }).click();
  await win.getByRole("tab", { name: "Try it live" }).click();
  await expect(live).toHaveAttribute("data-phase", "ready");
  expect(site.requests).toHaveLength(1);

  // Clicking into the site's frame brings its window forward.
  await page.locator(".os-start").click();
  await page.getByRole("dialog", { name: "Start menu" }).getByRole("list", { name: "Documents", exact: true }).getByRole("button", { name: "README.txt", exact: true }).click();
  const other = page.locator('.os-win[data-app="readme"]');
  await expect(other).toHaveClass(/is-active/);
  await expect(win).not.toHaveClass(/is-active/);
  const frameBox = (await win.locator("iframe.ax-live__frame").boundingBox())!;
  const otherBox = (await other.boundingBox())!;
  const covered = (x: number, y: number) => x >= otherBox.x && x <= otherBox.x + otherBox.width && y >= otherBox.y && y <= otherBox.y + otherBox.height;
  const spots = [0.05, 0.5, 0.95].flatMap((fx) => [0.05, 0.5, 0.95].map((fy) => ({ x: frameBox.x + frameBox.width * fx, y: frameBox.y + frameBox.height * fy })));
  const spot = spots.find(({ x, y }) => !covered(x, y));
  expect(spot, "part of the arXiv frame is visible beside README.txt").toBeDefined();
  await page.mouse.click(spot!.x, spot!.y);
  await expect(win).toHaveClass(/is-active/);
  await expect(other).not.toHaveClass(/is-active/);
  await expect(win.locator(".ax-live__shield")).toBeHidden();
  await page.frameLocator(`${arxivWin} iframe.ax-live__frame`).getByRole("heading", { name: "Mock arXiv Search" }).click();
});

test("Try it live falls back to a new tab when the site never reports ready", async ({ page }) => {
  const site = await mockArxiv(page, false);
  const win = await openArxiv(page);
  await win.getByRole("button", { name: "Try it here" }).click();
  await expect(win.getByRole("tab", { name: "Try it live" })).toHaveAttribute("aria-selected", "true");
  await expect(win.getByRole("tab", { name: "Try it live" })).toBeFocused();
  await expect(win.locator(".ax-live__cover")).toContainText("Connecting to arXiv Search");
  await expect(win.locator(".ax-live__bar").getByRole("link", { name: "Open in new tab" })).toBeVisible();

  // A ready message from anywhere but the site's frame does not count.
  await page.evaluate(() => window.postMessage({ type: "arxiv-search:ready" }, "*"));

  const fallback = win.locator(".ax-fallback");
  await expect(fallback).toBeVisible({ timeout: 10_000 });
  await expect(win.locator(".ax-live")).toHaveAttribute("data-phase", "blocked");
  await expect(fallback.getByRole("heading", { name: "arXiv Search didn't load in this window" })).toBeVisible();
  const open = fallback.getByRole("link", { name: "Open arXiv Search in a new tab" });
  await expect(open).toHaveAttribute("href", "https://arxiv.agarwal-labs.com/");
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(win.locator(".ax-live__bar").getByRole("link", { name: "Open in new tab" })).toBeVisible();
  await expect(win.locator("iframe.ax-live__frame")).toHaveAttribute("aria-hidden", "true");

  const tab = page.context().waitForEvent("page");
  await open.click();
  const popup = await tab;
  await expect(popup).toHaveURL("https://arxiv.agarwal-labs.com/");
  await popup.close();

  // Once the site answers, Try again reveals it.
  site.ready = true;
  await fallback.getByRole("button", { name: "Try again" }).click();
  await expect(win.locator(".ax-live")).toHaveAttribute("data-phase", "ready");
  await expect(fallback).toHaveCount(0);
  await expect(page.frameLocator(`${arxivWin} iframe.ax-live__frame`).getByRole("heading", { name: "Mock arXiv Search" })).toBeVisible();
});

test("links to arxiv.agarwal-labs.com in Sid Search open the arXiv Search app inside Lab OS", async ({ page }) => {
  const opened = trackNewTabs(page);
  const site = await mockArxiv(page, true);
  await blockOutside(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  const frame = page.frameLocator(`${searchWin} iframe`);
  await expect(frame.locator("#se-query")).toHaveValue("Sid Agarwal");

  const project = frame.locator("#lab .se-results .se-result").filter({
    has: frame.getByRole("heading", { name: "arXiv Search", exact: true })
  });
  await expect(project).toBeVisible();
  await project.getByRole("link", { name: "arXiv Search", exact: true }).click();
  const win = page.locator(arxivWin);
  await expect(win).toHaveClass(/is-active/);
  await expect(win.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");

  await page.locator(".os-task", { hasText: "Sid Search" }).click();
  await expect(page.locator(searchWin)).toHaveClass(/is-active/);
  await project.getByRole("link", { name: "arXiv Search on GitHub" }).click();
  await expectRepoInGitHub(page, "arxiv-search");

  // A link to a page on the site opens it in Try it live, in the same window.
  const deepLink = "https://arxiv.agarwal-labs.com/?q=dense%20retrieval";
  await page.locator(".os-task", { hasText: "Sid Search" }).click();
  await expect(page.locator(searchWin)).toHaveClass(/is-active/);
  await frame.locator("body").evaluate((body, href) => {
    const link = Object.assign(document.createElement("a"), { href, textContent: "Dense retrieval papers" });
    link.style.cssText = "position: fixed; top: 8px; left: 8px; z-index: 99999; background: #fff;";
    body.append(link);
  }, deepLink);
  await frame.getByRole("link", { name: "Dense retrieval papers" }).click();
  await expect(win).toHaveClass(/is-active/);
  await expect(page.locator(arxivWin)).toHaveCount(1);
  await expect(win.getByRole("tab", { name: "Try it live" })).toHaveAttribute("aria-selected", "true");
  await expect(win.locator("iframe.ax-live__frame")).toHaveAttribute("src", deepLink);
  await expect(win.locator(".os-address__text")).toHaveText("arxiv.agarwal-labs.com/?q=dense%20retrieval");
  await expect(win.locator(".ax-live")).toHaveAttribute("data-phase", "ready");
  await expect(page.frameLocator(`${arxivWin} iframe.ax-live__frame`).locator("#where")).toHaveText("/?q=dense%20retrieval");
  expect(site.requests.map(({ url }) => url)).toEqual([deepLink]);
  expect(opened).toEqual([]);
});

test("Sid Search shows arXiv Search as a regular project and links to the live site outside Lab OS", async ({ page }) => {
  await mockArxiv(page, false);
  await blockOutside(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=search");

  await expect(page.locator(".se-featured")).toHaveCount(0);

  const lab = page.locator("#lab");
  await expect(lab.locator(".se-results .se-result__title")).toHaveText(["arXiv Search", "NVDocs RAG", "HireMe.AI", "Financial models"]);
  await expect(lab.getByRole("link", { name: "arXiv Search on GitHub" })).toHaveAttribute("href", "https://github.com/sidagarwal-labs/arxiv-search");

  const query = page.getByLabel("Search Sid's work");
  for (const term of ["arxiv", "RAG", "retrieval"]) {
    await query.fill(term);
    await expect(page.locator(".se-matches .se-result h3", { hasText: "arXiv Search" }), term).toHaveCount(1);
  }
  await expect(page.locator(".se-matches .se-featured")).toHaveCount(0);
  await query.fill("robotics");
  await expect(page.locator(".se-matches .se-result h3", { hasText: "arXiv Search" })).toHaveCount(0);
  await query.fill("");

  const open = lab.getByRole("link", { name: "arXiv Search", exact: true });
  await expect(open).toHaveAttribute("href", "https://arxiv.agarwal-labs.com/");
  await open.click();
  await expect(page).toHaveURL("https://arxiv.agarwal-labs.com/");
  await expect(page.getByRole("heading", { name: "Mock arXiv Search" })).toBeVisible();
});

test("the arXiv Search app follows the retro style", async ({ page }) => {
  await mockArxiv(page, true);
  const win = await openArxiv(page, "retro");
  await expect(page.locator(".os")).toHaveClass(/os--retro/);
  await expect(win.getByRole("tab", { name: "Overview" })).toHaveCSS("border-radius", "0px");
  await expect(win.locator(".ax-stat").first()).toHaveCSS("border-radius", "0px");
  await win.getByRole("tab", { name: "Try it live" }).click();
  await expect(win.locator(".ax-live")).toHaveAttribute("data-phase", "ready");
});
