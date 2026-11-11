import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { FALLBACK_FX, MAX_PLAUSIBLE_MARKET_CAP_B, fillPending, parseAiStack, type AiStackRow, type FxRates } from "../../src/content/aiStackSheet.mjs";

const upcomingApi = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/**";
const previousApi = "https://ll.thespacedevs.com/2.3.0/launches/previous/**";
const stackCsv = "https://docs.google.com/spreadsheets/**";
const hour = 60 * 60 * 1000;

const stackSnapshot = JSON.parse(readFileSync(new URL("../../src/content/generated/ai-stack.json", import.meta.url), "utf8")) as { rows: AiStackRow[]; fx: FxRates };

/* A slice of the AI / LLM Stack Tracker in its published CSV form: quoted thousands and commas, #N/A cells, a ticker
   at two levels, and the sheet's trailing blank columns and rows. */
const stackSheet = [
  "Stock,Area,Layer,Level,Price,MCAP (b),Daily Price Change,EPS,Price to Earnings,Beta,52 week high,52 week low,Current - High,% from high,Current - Low,% from low,,",
  'NVDA,Designing,Chips,1,$150.00,"$3,650",2.50%,$3.00,50.00,1.80,$200.00,$100.00,-$50.00,-25.00%,$50.00,150.00%,,',
  "AMD,Designing,Chips,1,$120.00,$195,-1.00%,$2.00,60.00,1.90,$240.00,$80.00,-$120.00,-50.00%,$40.00,150.00%,,",
  "SAMSUNG,Memory - HBM,Chips,5,#N/A,#N/A,#N/A,#N/A,#N/A,#N/A,#N/A,#N/A,#N/A,#N/A,#N/A,#N/A,,",
  "VRT,Cooling,Data Center,8,$90.00,$34,-3.00%,$1.50,60.00,1.70,$100.00,$45.00,-$10.00,-10.00%,$45.00,200.00%,,",
  'MSFT,Servers,Data Center,13,$400.00,"$2,970",0.50%,$12.00,33.33,0.90,$500.00,$320.00,-$100.00,-20.00%,$80.00,125.00%,,',
  'SNOW,"Cloud, analytics",Data,15,$180.00,$60,1.00%,#N/A,#N/A,1.10,$200.00,$120.00,-$20.00,-10.00%,$60.00,150.00%,,',
  'MSFT,Software productivity,Application,16,$400.00,"$2,970",0.50%,$12.00,33.33,0.90,$500.00,$320.00,-$100.00,-20.00%,$80.00,125.00%,,',
  ",,,,,,,,,,,,,,,,,"
].join("\r\n");

/* SK hynix as the sheet lists it: its market cap in billions of won (about $650B), not billions of dollars. */
const skhyInWon = 'SKHY,Memory - HBM,Chips,5,$129.66,"$874,399",-3.51%,$17.00,7.63,#N/A,$199.87,$122.50,-$70.21,-35.13%,$7.16,105.84%,,';
/* TSMC and ASE as the sheet lists them: market caps in billions of Taiwan dollars (about $1.8T and $82B). */
const tsmInTwd = 'TSM,Foundry,Chips,6,$396.48,"$60,552",2.02%,$14.99,26.44,1.42,$487.47,$266.82,-$90.99,-19%,$129.66,149%,,';
const asxInTwd = 'ASX,Packaging,Chips,4,$35.48,"$2,702",3.26%,$1.04,34.04,1.73,$47.93,$13.35,-$12.45,-26%,$22.13,266%,,';
/* The same won figure under a symbol the parser doesn't know, so it can't be converted. */
const unknownInWon = skhyInWon.replace(/^SKHY,/, "HYNIX,");
/* Samsung on the Korea Exchange as the sheet lists it unconverted: price, market cap, EPS, and 52-week range in won. */
const samsungInWon = 'SAMSUNG,Memory - HBM,Chips,5,"$200,697","$1,300,914",0.93%,"$22,475.73",8.92,#N/A,"$230,000","$95,000",,,,,,';
const withSamsung = (line: string) => stackSheet.replace(/^SAMSUNG,.*$/m, line);
/* Rows as the published CSV gives them when it catches the sheet mid-calculation. */
const skhyCalculating = `SKHY,Memory - HBM,Chips,5${",Loading...".repeat(12)},,`;
const tsmCapCalculating = tsmInTwd.replace('"$60,552"', "Loading...");
const newcoCapCalculating = "NEWCO,Designing,Chips,1,$10.00,Loading...,1.00%,$1.00,10.00,1.00,$12.00,$8.00,-$2.00,-16.67%,$2.00,125.00%,,";

const csvResponse = (body: string, contentType = "text/csv") => ({ body, contentType, headers: { "access-control-allow-origin": "*" } });

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/api/v1/quote?*", (route) => route.fulfill({ json: { c: 230.36, dp: 0.84, t: 1788552000 } }));
  await page.route("https://s3.tradingview.com/**", (route) => route.abort());
  await page.route(/^https:\/\/(www\.youtube-nocookie\.com|i\.ytimg\.com)\//, (route) => route.abort());
  await page.route(upcomingApi, (route) => route.fulfill({ json: { results: [] } }));
  await page.route(previousApi, (route) => route.fulfill({ json: { results: [] } }));
  await page.route("https://datasets-server.huggingface.co/**", (route) => route.abort());
  await page.route("https://avatars.githubusercontent.com/**", (route) => route.abort());
  await page.route(stackCsv, (route) => route.fulfill(csvResponse(stackSheet)));
});

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

type Video = { url: string; publisher: string; official?: boolean; live?: boolean; priority?: number };

function launch(id: string, mission: string, net: number, options: { status?: [string, string]; live?: boolean; videos?: Video[] } = {}) {
  const [abbrev, name] = options.status ?? ["Go", "Go for Launch"];
  return {
    id,
    name: `Falcon 9 Block 5 | ${mission}`,
    net: new Date(net).toISOString(),
    net_precision: { name: "Minute" },
    status: { abbrev, name, description: "" },
    launch_service_provider: { id: 121, name: "SpaceX" },
    mission: { name: mission, type: "Communications", description: `${mission} test mission.`, orbit: { name: "Low Earth Orbit" } },
    rocket: {
      configuration: { full_name: "Falcon 9 Block 5" },
      launcher_stage: [{ launcher: { serial_number: "B1090" }, launcher_flight_number: 5, landing: { attempt: true, success: null, landing_location: { name: "A Shortfall of Gravitas" } } }]
    },
    pad: { name: "Space Launch Complex 40", location: { name: "Cape Canaveral SFS, FL, USA" } },
    webcast_live: options.live ?? false,
    vid_urls: (options.videos ?? []).map((video) => ({
      url: video.url,
      title: `${mission} webcast`,
      publisher: video.publisher,
      type: { name: video.official ? "Official Webcast" : "Unofficial Webcast" },
      live: video.live ?? false,
      priority: video.priority ?? 10
    }))
  };
}

const notesLink = (file: string, anchor: string) => `https://github.com/sidagarwal-labs/models/blob/main/notes/${file}#${anchor}`;

/* The scroll position once the page has painted, so a late jump would be caught. */
async function settledScrollY(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY)))));
}

async function historyLength(page: Page) {
  return page.evaluate(() => history.length);
}

async function hrefs(links: Locator) {
  return links.evaluateAll((items) => items.map((item) => item.getAttribute("href")));
}

/* The full company page comes up just under the sticky header, with focus on its name. */
async function expectFullView(page: Page, name: string) {
  const heading = page.locator(".mk-detail").getByRole("heading", { name, level: 2 });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Markets", level: 1 })).not.toBeInViewport();
  const { detailTop, headerBottom } = await page.evaluate(() => ({
    detailTop: document.querySelector(".mk-detail")!.getBoundingClientRect().top,
    headerBottom: document.querySelector(".live-top")!.getBoundingClientRect().bottom
  }));
  expect(detailTop).toBeGreaterThanOrEqual(headerBottom);
}

test("Markets is the AI stack, and old AI stack links still open it", async ({ page }) => {
  await page.goto("./markets");
  await expect(page).toHaveTitle("Markets | Sid Agarwal");
  await expect(page.getByRole("heading", { name: "Markets", level: 1 })).toBeVisible();
  await expect(page.locator(".live-hero")).toContainText("AI / LLM Stack Tracker");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  await expect(page.getByRole("tablist", { name: "Markets views" }).getByRole("tab")).toHaveText(["Stack", "Insights"]);
  await expect(page.getByRole("tab", { name: "Stack" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".mk-row")).toHaveCount(7);
  await expect(page.locator(".mk-detail")).toHaveCount(0);
  /* With no company in the address, the first one is previewed without writing it into the URL. */
  await expect(page.locator("#mk-preview-title")).toHaveText("NVIDIA");
  await expect(page.locator('a[data-row-key="1:NVDA"]')).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(/\/markets$/);

  /* Links from when Markets also had a watchlist land on the same company, and the redirect replaces the old address. */
  await page.goto("./launches");
  await page.goto("./markets?view=stack");
  await expect(page).toHaveURL(/\/markets$/);
  await expect(page).toHaveTitle("Markets | Sid Agarwal");
  await expect(page.locator(".mk-row")).toHaveCount(7);
  await page.goBack();
  await expect(page).toHaveURL(/\/launches$/);

  await page.goto("./markets?view=stack&symbol=vrt");
  await expect(page).toHaveURL(/\/markets\?symbol=vrt$/);
  await expect(page).toHaveTitle("VRT · Markets | Sid Agarwal");
  await expect(page.locator("#mk-preview-title")).toHaveText("Vertiv");
  await expect(page.locator('li.mk-row[data-symbol="VRT"]')).toHaveClass(/is-selected/);
  await expect(page.locator(".mk-detail")).toHaveCount(0);

  /* A symbol that isn't in the stack (AAPL is only in the ticker) previews the first company and says so. */
  for (const [path, shown] of [["./markets?symbol=AAPL", "AAPL"], ["./markets?symbol=<script>", "<script>"], ["./markets?symbol=AAPL&full=1", "AAPL"]]) {
    await page.goto(path);
    await expect(page.locator(".mk-row")).toHaveCount(7);
    await expect(page.locator(".mk-missing")).toHaveText(`“${shown}” isn't in the stack, so this shows NVDA.`);
    await expect(page.locator("#mk-preview-title")).toHaveText("NVIDIA");
    await expect(page.locator(".mk-detail")).toHaveCount(0);
    await expect(page).toHaveTitle("Markets | Sid Agarwal");
  }
  await page.getByRole("navigation", { name: "Live pages" }).getByRole("link", { name: "Launches" }).click();
  await expect(page).toHaveURL(/\/launches$/);
  await expect(page.getByRole("heading", { name: "SpaceX launch tracker", level: 1 })).toBeVisible();
});

test("the Markets AI stack groups the tracker sheet by layer and level", async ({ page }) => {
  await page.goto("./markets");
  await expect(page).toHaveTitle("Markets | Sid Agarwal");
  const status = page.locator(".mk-status");
  await expect(status).toHaveAttribute("data-source", "live");
  await expect(status).toHaveText(/^Live from the tracker sheet, read at .+\. Its Google Finance prices can be delayed up to 20 minutes\.$/);

  await expect(page.locator(".mk-layer h2")).toHaveText(["Chips", "Data center", "Data", "Application"]);
  await expect(page.locator(".mk-layer__head > p")).toHaveText(["Levels 1–5 · 3 companies", "Levels 8–13 · 2 companies", "Level 15 · 1 company", "Level 16 · 1 company"]);
  const chips = page.locator("#mk-layer-chips");
  await expect(chips.locator(".mk-level__number")).toHaveText(["Level 1", "Level 5"]);
  await expect(chips.locator(".mk-group__name")).toHaveText(["Designing", "Memory - HBM"]);
  await expect(chips.locator(".mk-group__count")).toHaveText([", 2 companies", ", 1 company"]);

  /* Levels the research notes rank as bottlenecks carry the ranking's badge. */
  await expect(page.getByRole("group", { name: /^Level 5 Memory - HBM ?, 1 company ?, bottleneck HBM capacity and bandwidth: ?Very high$/ })).toBeVisible();
  await expect(page.locator("#mk-level-1 .mk-badge")).toHaveAttribute("data-tightness", "high");
  await expect(page.locator("#mk-level-5 .mk-badge")).toHaveAttribute("data-tightness", "very-high");
  await expect(page.locator("#mk-level-8 .mk-badge")).toHaveText("Very high");
  await expect(page.locator("#mk-level-13 .mk-badge, #mk-level-15 .mk-badge, #mk-level-16 .mk-badge")).toHaveCount(0);

  const row = (key: string) => page.locator(`a[data-row-key="${key}"]`);
  await expect(row("1:NVDA").locator(".mk-row__symbol")).toHaveText("NVDA");
  await expect(row("1:NVDA").locator(".mk-row__name")).toHaveText("NVIDIA");
  await expect(row("1:NVDA").locator(".mk-row__num")).toHaveText([/\$150\.00$/, /\+2\.50%$/, /-25\.0%$/]);
  await expect(row("1:AMD").locator(".mk-row__num").nth(1)).toHaveAttribute("data-direction", "down");
  // #N/A is missing data, shown as a dash rather than zero.
  await expect(row("5:SAMSUNG").locator(".mk-row__name")).toHaveText("Samsung Electronics");
  await expect(row("5:SAMSUNG").locator(".mk-row__num")).toHaveText([/—$/, /—$/, /—$/]);
  await expect(row("15:SNOW").locator(".mk-row__num")).toHaveText([/\$180\.00$/, /\+1\.00%$/, /-10\.0%$/]);
  /* A company at two levels has a row at each. */
  await expect(page.locator('li.mk-row[data-symbol="MSFT"]')).toHaveCount(2);
  await expect(page.locator(".mk-row")).toHaveCount(7);

  const source = page.getByRole("link", { name: "AI / LLM Stack Tracker Google Sheet" });
  await expect(source).toHaveAttribute("href", /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[\w-]+\/pubhtml$/);
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(page.locator(".live-foot__sources")).toContainText("Nothing here is investment advice.");
  await expect(page.locator(".live-foot__sources")).not.toContainText(/Finnhub|watchlist/i);
});

test("the Markets stack opens level by level under summaries of the whole stack and each layer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./markets");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  const tiles = (scope: Locator) => scope.locator(".mk-summary dd");

  /* The whole stack counts each company once (MSFT sits in two layers); Samsung's #N/A cap is left out and named. */
  const overview = page.getByRole("region", { name: "Whole stack" });
  await expect(overview.locator(".mk-overview__head > p")).toHaveText("4 layers · 6 levels · 6 companies");
  await expect(overview.locator(".mk-summary dt"))
    .toHaveText(["Market cap", "Median day", "Today", "Median from 52w high", "Top gainer", "Top loser", "Largest", "Tightest bottleneck"]);
  await expect(tiles(overview))
    .toHaveText(["$6.91T No value for SAMSUNG", "+0.50%", "3 up, 2 down", "-20.0%", "NVDA +2.50%", "VRT -3.00%", "NVDA $3.65T", "Very high HBM capacity and bandwidth"]);
  await expect(overview.locator(".mk-overview__note")).toHaveText("A company in more than one layer counts once here, and in each of its layers below.");
  await expect(tiles(page.locator("#mk-layer-chips")))
    .toHaveText(["$3.85T No value for SAMSUNG", "+0.75%", "1 up, 1 down", "-37.5%", "NVDA +2.50%", "AMD -1.00%", "NVDA $3.65T", "Very high HBM capacity and bandwidth"]);
  await expect(tiles(page.locator("#mk-layer-data-center")))
    .toHaveText(["$3.00T", "-1.25%", "1 up, 1 down", "-15.0%", "MSFT +0.50%", "VRT -3.00%", "MSFT $2.97T", "Very high Deployable accelerator systems"]);
  await expect(tiles(page.locator("#mk-layer-data"))).toHaveText(["$60B", "+1.00%", "1 up, 0 down", "-10.0%", "SNOW +1.00%", "—", "SNOW $60B", "None ranked"]);
  await expect(tiles(page.locator("#mk-layer-application"))).toHaveText(["$2.97T", "+0.50%", "1 up, 0 down", "-20.0%", "MSFT +0.50%", "—", "MSFT $2.97T", "None ranked"]);

  /* Layers start open and levels closed, so each level shows its name, count, and badge until it's opened. */
  const layerToggles = page.locator(".mk-layer__toggle");
  const levelToggles = page.locator(".mk-group__toggle");
  await expect(layerToggles).toHaveCount(4);
  for (const toggle of await layerToggles.all()) await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(levelToggles).toHaveCount(6);
  for (const toggle of await levelToggles.all()) await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("a[data-row-key]:visible")).toHaveCount(0);

  const dataCenter = page.getByRole("button", { name: "Data center", exact: true });
  const level8 = page.getByRole("button", { name: /^Level 8 / });
  const vrt = page.locator('a[data-row-key="8:VRT"]');
  await expect(dataCenter).toHaveAttribute("aria-controls", "mk-layer-data-center-levels");
  await expect(level8).toHaveAttribute("aria-controls", "mk-level-8-rows");
  await level8.click();
  await expect(level8).toHaveAttribute("aria-expanded", "true");
  await expect(vrt).toBeVisible();
  await expect(page.locator('a[data-row-key="13:MSFT"]')).toBeHidden();
  /* Closing a layer hides its levels but not its summary, and its levels come back as they were. */
  await dataCenter.click();
  await expect(dataCenter).toHaveAttribute("aria-expanded", "false");
  await expect(level8).toBeHidden();
  await expect(page.locator("#mk-layer-data-center .mk-summary")).toBeVisible();
  await dataCenter.click();
  await expect(level8).toHaveAttribute("aria-expanded", "true");
  await expect(vrt).toBeVisible();
  /* Each open level is one tab stop after its toggle: its chosen row, or else its first. */
  await level8.focus();
  await page.keyboard.press("Tab");
  await expect(vrt).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /^Level 13 / })).toBeFocused();
  await level8.click();
  await expect(vrt).toBeHidden();

  const expandAll = page.getByRole("button", { name: "Expand all" });
  const collapseAll = page.getByRole("button", { name: "Collapse all" });
  await expect(expandAll).toHaveAttribute("aria-disabled", "false");
  await expect(collapseAll).toHaveAttribute("aria-disabled", "false");
  await expandAll.click();
  await expect(expandAll).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("a[data-row-key]:visible")).toHaveCount(7);
  await expect(page.locator('a[data-row-key][tabindex="0"]')).toHaveCount(6);
  /* The arrow keys skip the rows of a closed level. */
  await page.getByRole("button", { name: /^Level 15 / }).click();
  await page.locator('a[data-row-key="13:MSFT"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('a[data-row-key="16:MSFT"]')).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('a[data-row-key="13:MSFT"]')).toBeFocused();
  await collapseAll.click();
  await expect(collapseAll).toHaveAttribute("aria-disabled", "true");
  await expect(expandAll).toHaveAttribute("aria-disabled", "false");
  for (const toggle of await layerToggles.all()) await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".mk-summary:visible")).toHaveCount(5);

  /* A company named in a summary opens its layer and level, and is picked without adding history. */
  const entries = await historyLength(page);
  await overview.getByRole("button", { name: "VRT -3.00%" }).click();
  await expect(page).toHaveURL(/\/markets\?symbol=VRT$/);
  await expect(vrt).toBeFocused();
  await expect(vrt).toBeInViewport();
  await expect(vrt).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("complementary", { name: "Preview" }).getByRole("heading", { name: "Vertiv", level: 2 })).toBeVisible();
  await expect(dataCenter).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('.mk-layer__toggle[aria-expanded="true"]')).toHaveCount(1);
  await expect(page.locator('.mk-group__toggle[aria-expanded="true"]')).toHaveCount(1);
  await expect(level8).toHaveAttribute("aria-expanded", "true");
  expect(await historyLength(page)).toBe(entries);
  /* What the reader opened and closed stays that way across tabs. */
  await level8.click();
  await page.getByRole("tab", { name: "Insights" }).click();
  await page.getByRole("tab", { name: "Stack" }).click();
  await expect(level8).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('.mk-layer__toggle[aria-expanded="true"]')).toHaveCount(1);

  /* A shared link opens just its company's level. */
  await page.goto("./markets?symbol=vrt");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  await expect(vrt).toBeVisible();
  await expect(page.locator('.mk-group__toggle[aria-expanded="true"]')).toHaveCount(1);
  await expect(level8).toHaveAttribute("aria-expanded", "true");
});

test("picking a Markets company previews it beside the stack without moving the page", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("https://s3.tradingview.com/")) scripts.push(request.url()); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./markets");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  await expect(page.locator(".mk-split")).toHaveAttribute("data-layout", "wide");
  const pane = page.getByRole("complementary", { name: "Preview" });
  const preview = pane.locator(".mk-preview");
  await expect(pane.getByRole("heading", { name: "NVIDIA", level: 2 })).toBeVisible();
  await expect(preview.getByRole("list", { name: "Bottlenecks at its levels" }).locator(".mk-badge")).toHaveText(["High"]);
  await expect(preview.getByRole("link", { name: "Open full view" })).toBeInViewport();
  /* The quick chart is TradingView's; when it can't load, the preview says so and links out. */
  const chart = preview.locator(".tv-widget");
  await expect(chart).toHaveAttribute("data-state", "failed");
  await expect(chart.getByRole("alert")).toHaveText("The NVDA chart could not load here. Open it on TradingView.");
  await expect(chart.getByRole("link", { name: "Open it on TradingView" })).toHaveAttribute("href", "https://www.tradingview.com/symbols/NASDAQ-NVDA/");
  expect(scripts.some((url) => url.endsWith("/embed-widget-mini-symbol-overview.js"))).toBe(true);

  await page.getByRole("button", { name: "Expand all" }).click();
  const entries = await historyLength(page);
  const snow = page.locator('a[data-row-key="15:SNOW"]');
  await snow.evaluate((link) => link.scrollIntoView({ block: "center" }));
  const scrollY = await settledScrollY(page);
  expect(scrollY).toBeGreaterThan(0);
  await snow.click();
  await expect(page).toHaveURL(/\/markets\?symbol=SNOW$/);
  await expect(page).toHaveTitle("SNOW · Markets | Sid Agarwal");
  await expect(pane.getByRole("heading", { name: "Snowflake", level: 2 })).toBeVisible();
  await expect(preview.locator(".mk-stats dd")).toHaveText(["$60B", "—", "1.10", "-10.0%", "$120.00 to $200.00"]);
  await expect(preview.getByRole("list", { name: "Places in the stack" }).getByRole("listitem")).toHaveText(["Data · Level 15 · Cloud, analytics"]);
  await expect(preview.getByRole("list", { name: "Bottlenecks at its levels" })).toHaveCount(0);
  await expect(snow).toHaveAttribute("aria-current", "true");
  await expect(snow).toBeFocused();
  await expect(pane).toBeInViewport();
  expect(await settledScrollY(page)).toBe(scrollY);
  /* Picking the company that's already chosen doesn't jump either. */
  await snow.click();
  expect(await settledScrollY(page)).toBe(scrollY);
  await expect(snow).toBeFocused();

  /* The arrow keys, Home, and End move through the open levels' companies and preview each one; each level is one tab stop. */
  const msft13 = page.locator('a[data-row-key="13:MSFT"]');
  const msft16 = page.locator('a[data-row-key="16:MSFT"]');
  await page.keyboard.press("ArrowUp");
  await expect(msft13).toBeFocused();
  await expect(page).toHaveURL(/\/markets\?symbol=MSFT$/);
  await expect(pane.getByRole("heading", { name: "Microsoft", level: 2 })).toBeVisible();
  await expect(preview.getByRole("list", { name: "Places in the stack" }).getByRole("listitem"))
    .toHaveText(["Data center · Level 13 · Servers", "Application · Level 16 · Software productivity"]);
  await expect(page.locator('li.mk-row[data-symbol="MSFT"]')).toHaveClass([/is-selected/, /is-also/]);
  await page.keyboard.press("ArrowDown");
  await expect(snow).toBeFocused();
  await expect(page).toHaveURL(/\/markets\?symbol=SNOW$/);
  await page.keyboard.press("ArrowDown");
  await expect(msft16).toBeFocused();
  await expect(msft16).toHaveAttribute("aria-current", "true");
  await expect(page.locator('li.mk-row[data-symbol="MSFT"]')).toHaveClass([/is-also/, /is-selected/]);
  await expect(page).toHaveURL(/\/markets\?symbol=MSFT$/);
  await page.keyboard.press("Home");
  await expect(page.locator('a[data-row-key="1:NVDA"]')).toBeFocused();
  await expect(page).toHaveURL(/\/markets\?symbol=NVDA$/);
  await page.keyboard.press("End");
  await expect(msft16).toBeFocused();
  await expect(page.locator('a[data-row-key][tabindex="0"]')).toHaveCount(6);
  await expect(msft16).toHaveAttribute("tabindex", "0");
  /* Enter on a row picks it too. */
  await page.locator('a[data-row-key="8:VRT"]').focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/markets\?symbol=VRT$/);
  await expect(pane.getByRole("heading", { name: "Vertiv", level: 2 })).toBeVisible();
  await expect(preview.getByRole("list", { name: "Bottlenecks at its levels" }).getByRole("listitem")).toContainText(["Deployable accelerator systems."]);

  /* Previews replace each other in history, so Back leaves Markets instead of stepping through companies. */
  expect(await historyLength(page)).toBe(entries);
  /* A shared link reopens the same preview. */
  await page.goto("./markets?symbol=msft");
  await expect(page).toHaveTitle("MSFT · Markets | Sid Agarwal");
  await expect(pane.getByRole("heading", { name: "Microsoft", level: 2 })).toBeVisible();
  await expect(page.locator('li.mk-row[data-symbol="MSFT"]')).toHaveClass([/is-selected/, /is-also/]);
});

test("a Markets company's full view is its own page, and Back returns to the stack where it was", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("https://s3.tradingview.com/")) scripts.push(request.url()); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./markets");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  await page.getByRole("button", { name: /^Level 16 / }).click();
  const msft = page.locator('a[data-row-key="16:MSFT"]');
  await msft.evaluate((link) => link.scrollIntoView({ block: "center" }));
  await msft.click();
  await expect(page).toHaveURL(/\/markets\?symbol=MSFT$/);
  const stackY = await settledScrollY(page);
  const entries = await historyLength(page);

  await page.getByRole("complementary", { name: "Preview" }).getByRole("link", { name: "Open full view" }).click();
  await expect(page).toHaveURL(/\/markets\?symbol=MSFT&full=1$/);
  await expect(page).toHaveTitle("MSFT · Markets | Sid Agarwal");
  await expectFullView(page, "Microsoft");
  expect(await historyLength(page)).toBe(entries + 1);
  await expect(page.getByRole("tablist", { name: "Markets views" })).toHaveCount(0);
  await expect(page.locator(".mk-row")).toHaveCount(0);
  const detail = page.locator(".mk-detail");
  await expect(detail.locator(".mk-quote")).toContainText("NASDAQ:MSFT");
  await expect(detail.locator(".mk-quote__price")).toContainText("$400.00");
  await expect(detail.locator(".mk-quote__change")).toHaveText("+0.50% today");
  await expect(detail.getByRole("list", { name: "Places in the stack" }).getByRole("listitem"))
    .toHaveText(["Data center · Level 13 · Servers", "Application · Level 16 · Software productivity"]);
  await expect(detail.locator(".mk-stats dd")).toHaveText(["$2.97T", "33.3", "$12.00", "0.90", "$320.00 to $500.00", "-20.0%", "+25.0%"]);
  await expect(detail.locator(".mk-quote__about")).toBeVisible();
  for (const name of ["Price and volume", "Financials", "Technicals", "Company profile", "News"]) {
    await expect(detail.getByRole("heading", { name, level: 2 })).toBeVisible();
  }
  const chart = detail.locator(".tv-widget").first();
  await chart.scrollIntoViewIfNeeded();
  await expect(chart).toHaveAttribute("data-state", "failed");
  await expect(chart.getByRole("link", { name: "Open it on TradingView" })).toHaveAttribute("href", "https://www.tradingview.com/symbols/NASDAQ-MSFT/");
  expect(scripts.some((url) => url.endsWith("/embed-widget-advanced-chart.js"))).toBe(true);

  /* The browser's Back returns to the stack at the same place, with the company still chosen. */
  await page.goBack();
  await expect(page).toHaveURL(/\/markets\?symbol=MSFT$/);
  await expect(detail).toHaveCount(0);
  await expect(msft).toBeFocused();
  await expect(msft).toHaveAttribute("aria-current", "true");
  expect(await settledScrollY(page)).toBe(stackY);

  /* So does the page's own Back to stack button. */
  await page.goForward();
  await expect(page).toHaveURL(/\/markets\?symbol=MSFT&full=1$/);
  await expect(detail.getByRole("heading", { name: "Microsoft", level: 2 })).toBeVisible();
  await detail.getByRole("button", { name: "Back to stack" }).click();
  await expect(page).toHaveURL(/\/markets\?symbol=MSFT$/);
  await expect(msft).toBeFocused();
  await expect(msft).toBeInViewport();

  /* A shared full-view link opens on its own, and Back to stack swaps it for the stack without adding history. Symbols
     match case-insensitively; a company the sheet can't price still charts on its own exchange. */
  await page.goto("./markets?symbol=samsung&full=1");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  await expect(page).toHaveTitle("SAMSUNG · Markets | Sid Agarwal");
  await expect(detail.getByRole("heading", { name: "Samsung Electronics", level: 2 })).toBeVisible();
  await expect(detail.locator(".mk-quote")).toContainText("KRX:005930");
  await expect(detail.locator(".mk-quote__price strong")).toHaveText("—");
  await expect(detail.locator(".mk-quote__change")).toHaveCount(0);
  await expect(detail.locator(".mk-stats dd")).toHaveText(Array(7).fill("—"));
  await expect(detail.getByRole("list", { name: "Bottlenecks at its levels" }).getByRole("listitem")).toContainText(["HBM capacity and bandwidth."]);
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.getByRole("link", { name: "Open it on TradingView" })).toHaveAttribute("href", "https://www.tradingview.com/symbols/KRX-005930/");
  const shared = await historyLength(page);
  await detail.getByRole("button", { name: "Back to stack" }).click();
  await expect(page).toHaveURL(/\/markets\?symbol=SAMSUNG$/);
  await expect(page.locator('a[data-row-key="5:SAMSUNG"]')).toBeFocused();
  await expect(page.getByRole("button", { name: /^Level 5 / })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("complementary", { name: "Preview" }).getByRole("heading", { name: "Samsung Electronics", level: 2 })).toBeVisible();
  expect(await historyLength(page)).toBe(shared);
});

test("the AI stack falls back to the saved snapshot when the sheet can't be read", async ({ page }) => {
  await page.unroute(stackCsv);
  await page.route(stackCsv, (route) => route.abort());
  await page.goto("./markets");
  const status = page.locator(".mk-status");
  await expect(status).toHaveAttribute("data-source", "snapshot");
  await expect(status).toHaveText(/^Saved snapshot from [A-Z][a-z]{2} \d{1,2}, \d{4}\. The live sheet couldn't be reached\.$/);
  await expect(page.locator(".mk-row")).toHaveCount(stackSnapshot.rows.length);
  await expect(page.locator(".mk-layer h2").first()).toHaveText("Chips");
  await expect(page.locator("#mk-preview-title")).toHaveText("MP Materials");

  /* A page that isn't the tracker (such as a sign-in page) is treated the same as a failed request. */
  await page.unroute(stackCsv);
  await page.route(stackCsv, (route) => route.fulfill(csvResponse("<!doctype html><title>Sign in</title><p>Sign in to continue</p>", "text/html")));
  await page.reload();
  await expect(status).toHaveAttribute("data-source", "snapshot");
  await expect(page.locator(".mk-row")).toHaveCount(stackSnapshot.rows.length);
});

test("the AI stack parser treats a market cap too large to be billions of dollars as missing", () => {
  expect(MAX_PLAUSIBLE_MARKET_CAP_B).toBe(20_000);
  const cap = (symbol: string, value: string) =>
    `${symbol},Designing,Chips,1,$10.00,"${value}",1.00%,$1.00,10.00,1.00,$12.00,$8.00,-$2.00,-16.67%,$2.00,125.00%,,`;
  const rows = parseAiStack([stackSheet, unknownInWon, cap("CEIL", "$20,000"), cap("OVER", "$20,000.50")].join("\r\n"));
  const row = (symbol: string) => rows.find((item) => item.symbol === symbol);

  /* The won figure becomes missing and is flagged; the rest of the row is kept. */
  expect(row("HYNIX")).toEqual({
    symbol: "HYNIX", area: "Memory - HBM", layer: "Chips", level: 5, price: 129.66, marketCap: null, marketCapRejected: true,
    change: -3.51, eps: 17, pe: 7.63, beta: null, high: 199.87, low: 122.5
  });
  expect(row("OVER")).toMatchObject({ price: 10, marketCap: null, marketCapRejected: true });
  /* The ceiling itself is still plausible, and a #N/A cap is missing without being flagged. */
  expect(row("CEIL")).toMatchObject({ marketCap: 20_000 });
  expect(row("NVDA")).toMatchObject({ marketCap: 3650 });
  expect(row("SAMSUNG")).toMatchObject({ marketCap: null });
  for (const symbol of ["CEIL", "NVDA", "SAMSUNG"]) expect(row(symbol)).not.toHaveProperty("marketCapRejected");
});

test("the AI stack parser converts known foreign listings' market caps to US dollars, but never twice", () => {
  const fx: FxRates = { asOf: "2026-11-10", source: "test", perUsd: { TWD: 32, KRW: 1400 } };
  const [header] = stackSheet.split("\r\n");
  const parse = (line: string, rates?: FxRates) => parseAiStack([header, line].join("\r\n"), rates)[0];
  const withCap = (line: string, billions: number) => line.replace(/"\$[\d,]+"/, `"$${billions.toLocaleString("en-US")}"`);

  /* A home-currency figure is converted and flagged; the rest of the row is untouched. ASX's would otherwise pass as
     $2.7T, under the ceiling. */
  expect(parse(skhyInWon, fx)).toEqual({
    symbol: "SKHY", area: "Memory - HBM", layer: "Chips", level: 5, price: 129.66, marketCap: 624.57, marketCapCurrency: "KRW",
    change: -3.51, eps: 17, pe: 7.63, beta: null, high: 199.87, low: 122.5
  });
  expect(parse(tsmInTwd, fx)).toMatchObject({ marketCap: 1892.25, marketCapCurrency: "TWD" });
  expect(parse(asxInTwd, fx)).toMatchObject({ marketCap: 84.44, marketCapCurrency: "TWD" });

  /* A figure already in dollars, as once the sheet converts it itself, is left alone. */
  for (const [line, billions] of [[skhyInWon, 674], [tsmInTwd, 1843], [asxInTwd, 82]] as const) {
    const row = parse(withCap(line, billions), fx);
    expect(row.marketCap).toBe(billions);
    expect(row).not.toHaveProperty("marketCapCurrency");
    expect(row).not.toHaveProperty("marketCapRejected");
  }

  /* Without a price the 52-week range stands in for it; without either, the figure's currency can't be told. */
  const noPrice = skhyInWon.replace("$129.66", "#N/A");
  expect(parse(noPrice, fx)).toMatchObject({ price: null, marketCap: 624.57, marketCapCurrency: "KRW" });
  const noRange = parse(noPrice.replace("$199.87,$122.50", "#N/A,#N/A"), fx);
  expect(noRange).toMatchObject({ marketCap: null, marketCapRejected: true });
  expect(noRange).not.toHaveProperty("marketCapCurrency");

  /* Without rates the parser uses its built-in ones, and listings it doesn't know are never converted. */
  expect(parse(tsmInTwd)).toMatchObject({ marketCap: Math.round((60_552 / FALLBACK_FX.perUsd.TWD) * 100) / 100, marketCapCurrency: "TWD" });
  expect(parseAiStack(stackSheet, fx).filter((row) => row.marketCapCurrency || row.marketCapRejected)).toEqual([]);
});

test("the AI stack parser converts Samsung's won figures to US dollars, but never twice", () => {
  const fx: FxRates = { asOf: "2026-11-10", source: "test", perUsd: { TWD: 32, KRW: 1250 } };
  const [header] = stackSheet.split("\r\n");
  const parse = (line: string) => parseAiStack([header, line].join("\r\n"), fx)[0];

  /* The price, 52-week range, EPS, and market cap are converted; the day's change, P/E, and beta are the same in any currency. */
  expect(parse(samsungInWon)).toEqual({
    symbol: "SAMSUNG", area: "Memory - HBM", layer: "Chips", level: 5, price: 160.56, marketCap: 1040.73, change: 0.93,
    eps: 17.98, pe: 8.92, beta: null, high: 184, low: 76, perShareCurrency: "KRW", marketCapCurrency: "KRW"
  });

  /* Each figure is checked on its own: here only the EPS is still in won. */
  const epsInWon = parse('SAMSUNG,Memory - HBM,Chips,5,$150.11,$973,0.93%,"$22,475.73",8.92,#N/A,#N/A,#N/A,,,,,,');
  expect(epsInWon).toMatchObject({ price: 150.11, marketCap: 973, eps: 17.98, perShareCurrency: "KRW" });
  expect(epsInWon).not.toHaveProperty("marketCapCurrency");

  /* Figures already in dollars are left alone. */
  const inDollars = parse("SAMSUNG,Memory - HBM,Chips,5,$150.11,$973,0.93%,$16.83,8.92,#N/A,$172.00,$71.00,,,,,,");
  expect(inDollars).toMatchObject({ price: 150.11, marketCap: 973, eps: 16.83, high: 172, low: 71 });
  expect(inDollars).not.toHaveProperty("perShareCurrency");
  expect(inDollars).not.toHaveProperty("marketCapCurrency");

  /* With the price still calculating, the rest is still told apart and converted. */
  expect(parse(samsungInWon.replace('"$200,697"', "Loading...").replace("0.93%", "Loading..."))).toMatchObject({
    price: null, change: null, pending: ["price", "change"], marketCap: 1040.73, eps: 17.98, high: 184, low: 76,
    perShareCurrency: "KRW", marketCapCurrency: "KRW"
  });
});

test("the AI stack parser marks cells the sheet is still calculating, and fillPending fills them from an earlier read", () => {
  const fx: FxRates = { asOf: "2026-11-10", source: "test", perUsd: { TWD: 32, KRW: 1400 } };
  const [header, nvda] = stackSheet.split("\r\n");
  const rows = parseAiStack([header, nvda, skhyCalculating, tsmCapCalculating, newcoCapCalculating].join("\r\n"), fx);
  const row = (symbol: string, from = rows) => from.find((item) => item.symbol === symbol);

  /* "Loading..." is missing, like #N/A, but listed as still calculating. */
  expect(row("SKHY")).toEqual({
    symbol: "SKHY", area: "Memory - HBM", layer: "Chips", level: 5, price: null, marketCap: null, change: null, eps: null,
    pe: null, beta: null, high: null, low: null, pending: ["price", "marketCap", "change", "eps", "pe", "beta", "high", "low"]
  });
  expect(row("TSM")).toMatchObject({ price: 396.48, marketCap: null, pending: ["marketCap"] });
  expect(row("TSM")).not.toHaveProperty("marketCapRejected");
  expect(row("NVDA")).not.toHaveProperty("pending");

  /* The earlier read has SK hynix at its level (with no beta) and TSMC at two levels; the same level wins. */
  const tsmElsewhere = 'TSM,Foundry,Data Center,11,$390.00,"$1,800",1.00%,$14.99,26.00,1.42,$487.47,$266.82,,,,,,';
  const earlier = parseAiStack([header, tsmElsewhere, skhyInWon, tsmInTwd].join("\r\n"), fx);
  const before = structuredClone({ rows, earlier });
  const filled = fillPending(rows, earlier);

  expect(row("SKHY", filled)).toEqual({
    symbol: "SKHY", area: "Memory - HBM", layer: "Chips", level: 5, price: 129.66, marketCap: 624.57, marketCapCurrency: "KRW",
    change: -3.51, eps: 17, pe: 7.63, beta: null, high: 199.87, low: 122.5, pending: ["beta"],
    carried: ["price", "marketCap", "change", "eps", "pe", "high", "low"]
  });
  expect(row("TSM", filled)).toMatchObject({ price: 396.48, marketCap: 1892.25, marketCapCurrency: "TWD", carried: ["marketCap"] });
  expect(row("TSM", filled)).not.toHaveProperty("pending");
  /* A company the earlier read doesn't have stays missing; a row with nothing pending is passed through. */
  expect(row("NEWCO", filled)).toMatchObject({ marketCap: null, pending: ["marketCap"] });
  expect(row("NEWCO", filled)).not.toHaveProperty("carried");
  expect(row("NVDA", filled)).toBe(row("NVDA"));
  /* With no earlier row at its own level, another level's is used. */
  expect(row("TSM", fillPending([{ ...row("TSM")!, level: 9 }], earlier))).toMatchObject({ marketCap: 1800 });
  expect({ rows, earlier }).toEqual(before);
});

test("the Markets Insights tab shows the research notes' seven views, each with its data and sources", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./markets?symbol=VRT");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  const entries = await historyLength(page);
  const stackTab = page.getByRole("tab", { name: "Stack" });
  const insightsTab = page.getByRole("tab", { name: "Insights" });
  await insightsTab.click();
  await expect(page).toHaveURL(/\/markets\?tab=insights&symbol=VRT$/);
  await expect(insightsTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveTitle("VRT · Markets | Sid Agarwal");
  expect(await historyLength(page)).toBe(entries);
  const panel = page.getByRole("tabpanel", { name: "Insights" });
  await expect(panel.locator(".mk-insight__head h2")).toHaveText([
    "Demand signals",
    "Bottleneck ranking for 2026",
    "Where each $100 of AI capex goes",
    "Three constraints, in numbers",
    "Are the bottlenecks priced in?",
    "Capex share vs market-cap share",
    "The stack by market cap"
  ]);
  const section = (id: string) => page.locator(`#mk-insight-${id}`);
  for (const id of ["demand", "bottlenecks", "capex", "explainers", "priced-in", "capex-vs-cap", "treemap"]) {
    await expect(section(id).locator(".mk-asof")).not.toBeEmpty();
  }
  await expect(panel.locator(".mk-insights__intro a")).toHaveAttribute("href", "https://github.com/sidagarwal-labs/models/tree/main/notes");

  /* 4. Demand, from the capex and cloud notes. */
  await expect(section("demand").locator(".mk-demand strong")).toHaveText(["$777B", "$416B", "≈$1.7T"]);
  await expect(section("demand")).toContainText("up 86.8% from $416B in 2025");
  await expect(section("demand").locator(".mk-asof")).toContainText("Notes as of Oct 3, 2026");
  expect(await hrefs(section("demand").locator(".mk-sources a"))).toEqual([
    notesLink("ai-capex.md", "five-hyperscaler-consensus-snapshot"),
    notesLink("cloud-growth.md", "backlog-growth-and-the-cash-flow-outlook"),
    notesLink("ai-buildout-2026-10.md", "revenue-backlogs-and-cash-flow")
  ]);

  /* 1. The bottleneck ranking, in the notes' order, with the levels each one maps to. */
  await expect(section("bottlenecks").locator(".mk-ranking h3")).toHaveText([
    /HBM capacity and bandwidth\s*Very high$/,
    /Deployable accelerator systems\s*Very high$/,
    /Grid and datacenter power\s*Very high$/,
    /GPU arithmetic\s*High, but not first$/,
    /Server DDR5\s*Medium-high$/,
    /Enterprise SSD\s*Medium$/,
    /HDD\s*Low for online inference$/
  ]);
  /* The sample sheet has no Level 7 companies, so that link is off. */
  await expect(section("bottlenecks").locator('[data-bottleneck="power"] .mk-level-link')).toBeDisabled();
  expect(await hrefs(section("bottlenecks").locator(".mk-sources a"))).toEqual([notesLink("memory-storage.md", "bottleneck-ranking")]);

  /* 2. Each $100 of capex. */
  const capex = section("capex");
  await expect(capex.locator(".mk-capex__seg")).toHaveCount(7);
  const amounts = await capex.locator(".mk-capex__amt").allTextContents();
  expect(amounts).toEqual(["$25", "$15", "$10", "$20", "$15", "$7.50", "$7.50"]);
  expect(amounts.reduce((sum, amount) => sum + Number(amount.slice(1)), 0)).toBe(100);
  await expect(capex.locator('[data-segment="power"]')).toBeDisabled();
  await capex.locator("summary", { hasText: "Data table" }).click();
  const capexTable = capex.getByRole("table");
  await expect(capexTable.locator("tbody th")).toHaveText([
    "Semiconductor chips", "Accelerators", "Memory ICs", "CPUs, other chips, and server production",
    "Power", "Networking equipment", "Cooling", "Facilities and construction"
  ]);
  await expect(capexTable.locator("tbody td:nth-child(2)")).toHaveText(["$50", "$25", "$15", "$10", "$20", "$15", "$7.50", "$7.50"]);
  await expect(capexTable.locator("tbody td:nth-child(3)").nth(4)).toHaveText("Level 7");
  expect(await hrefs(capex.locator(".mk-sources a"))).toEqual([notesLink("ai-capex.md", "illustrative-allocation-of-each-100")]);

  /* 3. The three explainers. */
  const explainers = section("explainers");
  await expect(explainers.locator('[data-explainer="hbm"] dt')).toHaveText(["≈70 GB", "≈42 GB", "≈48/s"]);
  await expect(explainers.locator('[data-explainer="power"] dt')).toHaveText(["≈2.5 GW", "≈3.0 GW", "≈7.4 GW"]);
  await expect(explainers.locator('[data-explainer="rents"] dt')).toHaveText(["≈60%", "≈50%", "$2.63"]);
  expect(await hrefs(explainers.locator(".mk-sources a"))).toEqual([
    notesLink("memory-storage.md", "why-hbm-binds-before-peak-flops"),
    notesLink("memory-storage.md", "bottleneck-ranking"),
    notesLink("memory-storage.md", "2026-inference-scenarios"),
    notesLink("gpu-prices.md", "september-8-provider-check"),
    notesLink("gpu-prices.md", "rental-resilience-and-inferred-gpu-value")
  ]);

  /* 5. Are the bottlenecks priced in? A plain read-out, the chart, and its table. */
  const pricedIn = section("priced-in");
  await expect(pricedIn.getByTestId("priced-in-readout")).toHaveText(
    "The very-high bottleneck levels sit a median 10.0% below their 52-week highs, against 37.5% for the other ranked levels. The tightest layers are trading closer to their highs, which fits the market pricing in the bottlenecks."
  );
  await expect(pricedIn.getByRole("group", { name: /^Bottleneck tightness against median distance from the 52-week high/ })).toBeVisible();
  await expect(pricedIn.locator(".mk-caveat")).toContainText("not a causal claim");
  await pricedIn.locator("summary", { hasText: "Data table" }).click();
  const pricedTable = pricedIn.getByRole("table");
  await expect(pricedTable.locator("tbody th")).toHaveText(["L1 Designing", "L5 Memory - HBM", "L8 Cooling"]);
  await expect(pricedTable.locator("tbody td:nth-child(3)")).toHaveText(["-37.5%", "—", "-10.0%"]);
  await expect(pricedIn.locator(".mk-asof")).toContainText("Prices: live tracker sheet, read ");

  /* 6. Capex share against market-cap share, for each bucket. */
  const shares = section("capex-vs-cap");
  await shares.locator("summary", { hasText: "Data table" }).click();
  const sharesTable = shares.getByRole("table");
  await expect(sharesTable.locator("tbody th")).toHaveText(["Semiconductor chips", "Power", "Networking equipment", "Cooling", "Facilities and construction"]);
  await expect(sharesTable.locator("tbody td:nth-child(2)")).toHaveText(["50.0%", "20.0%", "15.0%", "7.5%", "7.5%"]);
  await expect(sharesTable.locator("tbody td:nth-child(3)")).toHaveText(["71.7%", "0.0%", "0.0%", "0.6%", "27.7%"]);

  /* 7. The market-cap treemap: one tile per priced placement, and a table of every placement. */
  const treemap = section("treemap");
  await expect(treemap.locator(".mk-treemap__tile")).toHaveCount(6);
  await expect(treemap.locator(".mk-caveat")).toContainText("No market cap in the sheet for SAMSUNG.");
  await treemap.locator("summary", { hasText: "Data table" }).click();
  await expect(treemap.getByRole("table").locator("tbody th")).toHaveText(["NVDA", "AMD", "SAMSUNG", "VRT", "MSFT", "SNOW", "MSFT"]);

  /* The tabs work from the keyboard and keep the chosen company. */
  await insightsTab.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(stackTab).toBeFocused();
  await expect(stackTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/markets\?symbol=VRT$/);
  await expect(page.locator("#mk-preview-title")).toHaveText("Vertiv");
  expect(await historyLength(page)).toBe(entries);
});

/* The priced-in chart's bubbles, and the details box that shows a level's notes, prices, and companies. */
function pricedInChart(page: Page) {
  const chart = page.locator("#mk-insight-priced-in .mk-chart");
  const tip = chart.getByTestId("priced-in-tip");
  return {
    chart,
    tip,
    bubble: (level: number) => chart.locator(`.mk-dot[data-level="${level}"]`),
    expectDetails: async (title: string, layer: string, notes: string[], stats: string[]) => {
      await expect(tip).toBeVisible();
      await expect(tip.locator(".mk-tip__title")).toHaveText(title);
      await expect(tip.locator(".mk-tip__layer")).toHaveText(layer);
      await expect(tip.locator(".mk-tip__notes li")).toHaveText(notes);
      await expect(tip.locator(".mk-tip__stats dt")).toHaveText(["Median from 52-week high", "Combined market cap", "Companies"]);
      await expect(tip.locator(".mk-tip__stats dd")).toHaveText(stats);
    },
    /* The details box sits wholly inside the chart, and off the bubble it describes. */
    expectInsideChart: async (level: number) => {
      const [outer, inner, dot] = await Promise.all([
        chart.boundingBox(),
        tip.boundingBox(),
        chart.locator(`.mk-dot[data-level="${level}"] circle`).boundingBox()
      ]);
      expect(inner!.x).toBeGreaterThanOrEqual(outer!.x - 0.5);
      expect(inner!.y).toBeGreaterThanOrEqual(outer!.y - 0.5);
      expect(inner!.x + inner!.width).toBeLessThanOrEqual(outer!.x + outer!.width + 0.5);
      expect(inner!.y + inner!.height).toBeLessThanOrEqual(outer!.y + outer!.height + 0.5);
      const overlapX = Math.min(inner!.x + inner!.width, dot!.x + dot!.width) - Math.max(inner!.x, dot!.x);
      const overlapY = Math.min(inner!.y + inner!.height, dot!.y + dot!.height) - Math.max(inner!.y, dot!.y);
      expect(overlapX <= 0 || overlapY <= 0, `the details for L${level} cover its bubble`).toBe(true);
    }
  };
}

test("hovering over or focusing a priced-in bubble shows that level's details, and Escape puts them away", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./markets?tab=insights");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  const { chart, tip, bubble, expectDetails, expectInsideChart } = pricedInChart(page);
  /* L5 has no prices in the sample sheet, so only L1 and L8 are plotted. */
  await expect(chart.locator(".mk-dot")).toHaveCount(2);
  await expect(tip).toHaveCount(0);
  for (const level of [1, 8]) await expect(bubble(level)).toHaveAttribute("tabindex", "0");
  await expect(chart.getByRole("img", { name: /^L8 Cooling/ })).toHaveAccessibleName(
    "L8 Cooling, Data center layer. Tightness: Very high (Deployable accelerator systems). Median -10.0% from the 52-week high. " +
    "Combined market cap $34B. Companies: VRT."
  );

  /* Hovering over a bubble shows its level's details beside it, and highlights it against the others. */
  await bubble(8).hover();
  await expectDetails("L8 · Cooling", "Data center layer", ["Very high Deployable accelerator systems"], ["-10.0%", "$34B", "VRT"]);
  await expect(tip.locator(".mk-badge")).toHaveText(["Very high"]);
  await expect(bubble(8)).toHaveAttribute("data-active", "true");
  await expect(bubble(1)).not.toHaveAttribute("data-active");
  await expect(bubble(1)).toHaveCSS("opacity", "0.4");
  await expect(bubble(8)).toHaveCSS("opacity", "1");
  await expectInsideChart(8);
  await page.mouse.move(4, 4);
  await expect(tip).toHaveCount(0);
  await expect(bubble(1)).toHaveCSS("opacity", "1");

  /* Moving from one bubble to another swaps the details. */
  await bubble(1).hover();
  await expect(tip.locator(".mk-tip__title")).toHaveText("L1 · Designing");
  await bubble(8).hover();
  await expect(tip.locator(".mk-tip__title")).toHaveText("L8 · Cooling");
  await page.mouse.move(4, 4);
  await expect(tip).toHaveCount(0);

  /* From the keyboard: focus shows the details, Escape hides them without moving focus, and Tab moves on. */
  await bubble(1).focus();
  await expectDetails("L1 · Designing", "Chips layer", ["High GPU arithmetic"], ["-37.5%", "$3.85T", "NVDA, AMD"]);
  await expect(bubble(1)).toHaveAttribute("data-active", "true");
  await expectInsideChart(1);
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCount(0);
  await expect(bubble(1)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(bubble(8)).toBeFocused();
  await expect(tip.locator(".mk-tip__title")).toHaveText("L8 · Cooling");
  await page.keyboard.press("Shift+Tab");
  await expect(bubble(1)).toBeFocused();
  await expect(tip.locator(".mk-tip__title")).toHaveText("L1 · Designing");
  await bubble(1).blur();
  await expect(tip).toHaveCount(0);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("tapping a priced-in bubble shows its details inside a phone-width chart, and another tap puts them away", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("./markets?tab=insights");
    await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
    const { tip, bubble, expectDetails, expectInsideChart } = pricedInChart(page);
    await bubble(1).scrollIntoViewIfNeeded();

    await bubble(1).tap();
    await expectDetails("L1 · Designing", "Chips layer", ["High GPU arithmetic"], ["-37.5%", "$3.85T", "NVDA, AMD"]);
    await expectInsideChart(1);
    expect(await horizontalOverflow(page)).toBe(0);
    await bubble(8).tap();
    await expectDetails("L8 · Cooling", "Data center layer", ["Very high Deployable accelerator systems"], ["-10.0%", "$34B", "VRT"]);
    await expectInsideChart(8);
    expect(await horizontalOverflow(page)).toBe(0);

    /* A second tap on the same bubble, or a tap anywhere else, puts the details away. */
    await bubble(8).tap();
    await expect(tip).toHaveCount(0);
    await bubble(1).tap();
    await expect(tip).toBeVisible();
    await page.getByTestId("priced-in-readout").tap();
    await expect(tip).toHaveCount(0);
  });
});

test("the priced-in bubbles fit their labels and keep apart at every width", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  /* The saved snapshot has eight ranked levels with prices, four of them very high. */
  await page.unroute(stackCsv);
  await page.route(stackCsv, (route) => route.abort());
  const { chart, bubble, expectInsideChart } = pricedInChart(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("./markets?tab=insights");
    await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "snapshot");
    await expect(chart.locator(".mk-dot")).toHaveCount(8);
    const dots = await chart.locator(".mk-dot").evaluateAll((groups) => groups.map((group) => {
      const circle = group.querySelector("circle")!;
      const label = group.querySelector("text")!;
      return {
        level: group.getAttribute("data-level"),
        x: circle.cx.baseVal.value,
        y: circle.cy.baseVal.value,
        r: circle.r.baseVal.value,
        label: label.getBBox().width
      };
    }));
    for (const [index, dot] of dots.entries()) {
      expect(dot.label, `L${dot.level}'s label at ${width}px`).toBeLessThanOrEqual(2 * dot.r - 4);
      for (const other of dots.slice(index + 1)) {
        expect(Math.hypot(dot.x - other.x, dot.y - other.y), `L${dot.level} and L${other.level} at ${width}px`).toBeGreaterThanOrEqual(dot.r + other.r);
      }
    }
    for (const level of [10, 9]) {
      await bubble(level).focus();
      await expectInsideChart(level);
    }
    expect(await horizontalOverflow(page), `${width}px`).toBe(0);
  }
});

test("Markets Insights leaves out a market cap too large to be billions of dollars and names the company", async ({ page }) => {
  await page.unroute(stackCsv);
  await page.route(stackCsv, (route) => route.fulfill(csvResponse([stackSheet, unknownInWon].join("\r\n"))));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./markets");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  /* The stack still shows the rest of the row; only the market cap is set aside. */
  await expect(page.locator('a[data-row-key="5:HYNIX"] .mk-row__num')).toHaveText([/\$129\.66$/, /-3\.51%$/, /-35\.1%$/]);

  await page.getByRole("tab", { name: "Insights" }).click();
  const treemap = page.locator("#mk-insight-treemap");
  await expect(treemap.locator(".mk-treemap__tile")).toHaveCount(6);
  await expect(treemap.locator('.mk-treemap__tile[data-symbol="HYNIX"]')).toHaveCount(0);
  await expect(treemap.locator(".mk-caveat")).toHaveText(
    "A company at several levels has its market cap split evenly across them, so each is counted once. No market cap in the sheet for SAMSUNG. No usable market cap for HYNIX (the sheet's value isn't in billions of US dollars)."
  );
  await treemap.locator("summary", { hasText: "Data table" }).click();
  await expect(treemap.getByRole("table").locator("tbody tr", { hasText: "HYNIX" }).locator("td").nth(2)).toHaveText("—");

  /* The won figure doesn't swamp the market-cap shares: they match the sheet without HYNIX. */
  const shares = page.locator("#mk-insight-capex-vs-cap");
  await shares.locator("summary", { hasText: "Data table" }).click();
  await expect(shares.getByRole("table").locator("tbody td:nth-child(3)")).toHaveText(["71.7%", "0.0%", "0.0%", "0.6%", "27.7%"]);
});

test("Markets converts a known foreign listing's market cap to US dollars and says so", async ({ page }) => {
  await page.unroute(stackCsv);
  await page.route(stackCsv, (route) => route.fulfill(csvResponse([stackSheet, skhyInWon, tsmInTwd].join("\r\n"))));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  /* A live read converts at the rates the build-time snapshot was made with. */
  const { fx } = stackSnapshot;
  const skhy = `$${Math.round(874_399 / fx.perUsd.KRW)}B`;
  const tsm = `$${(60_552 / fx.perUsd.TWD / 1000).toFixed(2)}T`;
  const ratesDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${fx.asOf}T12:00:00Z`));

  await page.goto("./markets?symbol=SKHY");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  const preview = page.getByRole("complementary", { name: "Preview" }).locator(".mk-preview");
  const previewCap = preview.locator(".mk-stats div", { hasText: "Market cap" }).locator("dd");
  await expect(previewCap).toContainText(skhy);
  await expect(previewCap.locator(".mk-stats__note")).toHaveText("converted from South Korean won");

  await page.getByRole("tab", { name: "Insights" }).click();
  const treemap = page.locator("#mk-insight-treemap");
  await expect(treemap.locator(".mk-treemap__tile")).toHaveCount(8);
  for (const symbol of ["SKHY", "TSM"]) await expect(treemap.locator(`.mk-treemap__tile[data-symbol="${symbol}"]`)).toHaveCount(1);
  await expect(treemap.locator(".mk-caveat")).toHaveText(
    `A company at several levels has its market cap split evenly across them, so each is counted once. Market caps converted to US dollars at ${ratesDay} exchange rates: SKHY from South Korean won, TSM from Taiwan dollars. No market cap in the sheet for SAMSUNG.`
  );
  await expect(treemap.locator(".mk-asof")).toContainText(`Exchange rates as of ${ratesDay}`);
  await treemap.locator("summary", { hasText: "Data table" }).click();
  const capOf = (symbol: string) => treemap.getByRole("table").locator("tbody tr", { hasText: symbol }).locator("td").nth(2);
  await expect(capOf("SKHY")).toHaveText(skhy);
  await expect(capOf("TSM")).toHaveText(tsm);

  /* The full company view marks the converted figure; a company the sheet gives in dollars has no mark. */
  await page.goto("./markets?symbol=TSM&full=1");
  const detailCap = page.locator(".mk-detail .mk-stats div", { hasText: "Market cap" }).locator("dd");
  await expect(detailCap).toContainText(tsm);
  await expect(detailCap.locator(".mk-stats__note")).toHaveText("converted from Taiwan dollars");
  await page.goto("./markets?symbol=NVDA&full=1");
  await expect(page.locator(".mk-detail .mk-stats div", { hasText: "Market cap" }).locator("dd")).toHaveText("$3.65T");
  await expect(page.locator(".mk-detail .mk-stats__note")).toHaveCount(0);
});

test("Markets converts Samsung's won figures and fills in what the sheet is still calculating from the snapshot", async ({ page }) => {
  await page.unroute(stackCsv);
  await page.route(stackCsv, (route) =>
    route.fulfill(csvResponse([withSamsung(samsungInWon), skhyCalculating, tsmCapCalculating, newcoCapCalculating].join("\r\n")))
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  const { fx } = stackSnapshot;
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const won = (value: number) => usd.format(Math.round((value / fx.perUsd.KRW) * 100) / 100);
  const savedSkhy = stackSnapshot.rows.find((row) => row.symbol === "SKHY" && row.level === 5);
  expect(savedSkhy?.price).toEqual(expect.any(Number));

  /* SK hynix's whole row was "Loading...": the snapshot's figures stand in, and the status line says so. */
  await page.goto("./markets?symbol=SKHY");
  const status = page.locator(".mk-status");
  await expect(status).toHaveAttribute("data-source", "live");
  await expect(status).toContainText(
    "The sheet was still calculating some figures for SKHY, TSM and NEWCO; the saved snapshot's values stand in where it has them."
  );
  const preview = page.getByRole("complementary", { name: "Preview" }).locator(".mk-preview");
  await expect(preview.locator(".mk-preview__price strong")).toHaveText(usd.format(savedSkhy!.price!));
  await expect(preview.locator(".mk-stats div", { hasText: "Market cap" }).locator("dd")).toContainText(/^\$[\d.]+[BT]/);

  /* TSMC's market cap comes from the snapshot; NEWCO's, which the snapshot doesn't have, is named as still calculating. */
  await page.getByRole("tab", { name: "Insights" }).click();
  const treemap = page.locator("#mk-insight-treemap");
  for (const symbol of ["SAMSUNG", "SKHY", "TSM"]) await expect(treemap.locator(`.mk-treemap__tile[data-symbol="${symbol}"]`)).toHaveCount(1);
  await expect(treemap.locator('.mk-treemap__tile[data-symbol="NEWCO"]')).toHaveCount(0);
  const caveat = treemap.locator(".mk-caveat");
  await expect(caveat).toContainText("The sheet was still calculating the market cap for NEWCO.");
  await expect(caveat).toContainText(/SAMSUNG( and SKHY)? from South Korean won/);
  await expect(caveat).not.toContainText("No market cap in the sheet");

  /* Samsung's full view gives its won figures in dollars and says so; a company the sheet gives in dollars has no mark. */
  await page.goto("./markets?symbol=SAMSUNG&full=1");
  const quote = page.locator(".mk-detail .mk-quote__price");
  await expect(quote.locator("strong")).toHaveText(won(200_697));
  await expect(quote.locator(".mk-stats__note")).toHaveText("Per-share figures converted from South Korean won");
  const stat = (name: string) => page.locator(".mk-detail .mk-stats > div", { hasText: name }).locator("dd");
  await expect(stat("EPS")).toHaveText(won(22_475.73));
  await expect(stat("52-week range")).toHaveText(`${won(95_000)} to ${won(230_000)}`);
  await expect(stat("Market cap").locator(".mk-stats__note")).toHaveText("converted from South Korean won");
  await page.goto("./markets?symbol=NVDA&full=1");
  await expect(page.locator(".mk-detail .mk-quote__price strong")).toHaveText("$150.00");
  await expect(page.locator(".mk-detail .mk-stats__note")).toHaveCount(0);
});

test("the Markets status line names three companies still calculating and counts the rest", async ({ page }) => {
  /* The sheet as published while it recalculates prices for the given companies. */
  const pricesCalculating = (symbols: string) =>
    stackSheet.replace(new RegExp(`^(${symbols})(,.*?,\\d+),\\$[\\d.]+,`, "gm"), "$1$2,Loading...,");
  const status = page.locator(".mk-status");

  /* MSFT is at two levels but is one company. */
  await page.unroute(stackCsv);
  await page.route(stackCsv, (route) => route.fulfill(csvResponse(pricesCalculating("NVDA|AMD|VRT|MSFT|SNOW"))));
  await page.goto("./markets");
  await expect(status).toHaveAttribute("data-source", "live");
  await expect(status).toContainText(
    "The sheet was still calculating some figures for NVDA, AMD, VRT and 2 more companies; the saved snapshot's values stand in where it has them."
  );

  /* "and 1 more" would be no shorter than the name, so four are all named. */
  await page.unroute(stackCsv);
  await page.route(stackCsv, (route) => route.fulfill(csvResponse(pricesCalculating("NVDA|AMD|VRT|MSFT"))));
  await page.reload();
  await expect(status).toHaveAttribute("data-source", "live");
  await expect(status).toContainText("The sheet was still calculating some figures for NVDA, AMD, VRT and MSFT;");
});

test("Insights segments, levels, and tiles open their companies in the Stack tab", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  const stackTab = page.getByRole("tab", { name: "Stack" });
  const expectLevelShown = async (level: number, key: string, name: string) => {
    await expect(stackTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`#mk-level-${level}`)).toBeInViewport();
    const { levelTop, headerBottom } = await page.evaluate((id) => ({
      levelTop: document.getElementById(id)!.getBoundingClientRect().top,
      headerBottom: document.querySelector(".live-top")!.getBoundingClientRect().bottom
    }), `mk-level-${level}`);
    expect(levelTop).toBeGreaterThanOrEqual(headerBottom - 1);
    const link = page.locator(`a[data-row-key="${key}"]`);
    await expect(link).toBeFocused();
    await expect(link).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("complementary", { name: "Preview" }).getByRole("heading", { name, level: 2 })).toBeVisible();
  };

  await page.goto("./markets?tab=insights");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  const entries = await historyLength(page);
  await page.locator('#mk-insight-capex [data-segment="cooling"]').click();
  await expect(page).toHaveURL(/\/markets\?symbol=VRT$/);
  await expectLevelShown(8, "8:VRT", "Vertiv");

  /* Facilities map to Levels 12 and 13; the sample sheet only has Level 13. */
  await page.getByRole("tab", { name: "Insights" }).click();
  await page.locator('#mk-insight-capex [data-segment="facilities"]').click();
  await expect(page).toHaveURL(/\/markets\?symbol=MSFT$/);
  await expectLevelShown(13, "13:MSFT", "Microsoft");

  await page.getByRole("tab", { name: "Insights" }).click();
  await page.locator('#mk-insight-bottlenecks [data-bottleneck="hbm"]').getByRole("button", { name: /^L5/ }).click();
  await expect(page).toHaveURL(/\/markets\?symbol=SAMSUNG$/);
  await expectLevelShown(5, "5:SAMSUNG", "Samsung Electronics");

  /* A treemap tile picks that exact placement of a company at two levels. */
  await page.getByRole("tab", { name: "Insights" }).click();
  const tiles = page.locator('.mk-treemap__tile[data-symbol="MSFT"]');
  await expect(tiles).toHaveCount(2);
  await tiles.nth(1).click();
  await expect(page).toHaveURL(/\/markets\?symbol=MSFT$/);
  await expectLevelShown(16, "16:MSFT", "Microsoft");
  expect(await historyLength(page)).toBe(entries);

  /* Against the saved snapshot, the power segment lands on Level 7. */
  await page.unroute(stackCsv);
  await page.route(stackCsv, (route) => route.abort());
  await page.goto("./markets?tab=insights");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "snapshot");
  await expect(page.locator("#mk-insight-priced-in .mk-asof")).toContainText("Prices: saved snapshot from ");
  await page.locator('#mk-insight-capex [data-segment="power"]').click();
  await expect(page).toHaveURL(/\/markets\?symbol=TXN$/);
  await expectLevelShown(7, "7:TXN", "Texas Instruments");
});

test("on a phone the Markets preview opens under the chosen company and nothing overflows", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./markets");
  await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
  await expect(page.locator(".mk-split")).toHaveAttribute("data-layout", "narrow");
  await expect(page.getByRole("complementary", { name: "Preview" })).toHaveCount(0);
  const inline = page.locator("li.mk-row-preview");
  const previewAfter = () => inline.evaluate((item) => item.previousElementSibling?.getAttribute("data-symbol"));
  /* The first company is chosen, but its preview waits under its row until the reader opens that level. */
  await expect(inline).toHaveCount(0);
  await page.getByRole("button", { name: /^Level 1 / }).click();
  await expect(inline).toHaveCount(1);
  expect(await previewAfter()).toBe("NVDA");
  await expect(inline.getByRole("heading", { name: "NVIDIA", level: 4 })).toBeVisible();

  await page.getByRole("button", { name: /^Level 8 / }).click();
  const vrt = page.locator('a[data-row-key="8:VRT"]');
  await vrt.evaluate((link) => link.scrollIntoView({ block: "center" }));
  const top = await vrt.evaluate((link) => link.getBoundingClientRect().top);
  await vrt.click();
  await expect(page).toHaveURL(/\/markets\?symbol=VRT$/);
  await expect(inline.getByRole("heading", { name: "Vertiv", level: 4 })).toBeVisible();
  await expect(inline).toHaveCount(1);
  expect(await previewAfter()).toBe("VRT");
  /* The preview that closed above it doesn't pull the chosen row up the screen. */
  expect(Math.abs((await vrt.evaluate((link) => link.getBoundingClientRect().top)) - top)).toBeLessThan(2);
  expect(await horizontalOverflow(page)).toBe(0);

  await inline.getByRole("link", { name: "Open full view" }).click();
  await expect(page).toHaveURL(/\/markets\?symbol=VRT&full=1$/);
  await expectFullView(page, "Vertiv");
  expect(await horizontalOverflow(page)).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/markets\?symbol=VRT$/);
  await expect(vrt).toBeFocused();
  await expect(vrt).toBeInViewport();

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["./markets?symbol=MSFT", "./markets?tab=insights", "./markets?symbol=MSFT&full=1"]) {
      await page.goto(path);
      await expect(page.locator(".mk-status")).toHaveAttribute("data-source", "live");
      if (path.includes("insights")) {
        await expect(page.locator(".mk-treemap__tile")).toHaveCount(6);
        for (const summary of await page.locator(".mk-data > summary").all()) await summary.click();
      } else if (!path.includes("full")) {
        await page.getByRole("button", { name: "Expand all" }).click();
        await expect(page.locator("a[data-row-key]:visible")).toHaveCount(7);
      }
      expect(await horizontalOverflow(page), `${path} at ${width}px`).toBe(0);
    }
  }
});

test("in a Lab OS window, Markets previews replace each other and the full view is a step in the window's history", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Open Markets" }).click();
  const win = page.locator('.os-win[data-app="markets"]');
  const address = win.locator(".os-address__text");
  const back = win.getByRole("button", { name: "Back", exact: true });
  const forward = win.getByRole("button", { name: "Forward", exact: true });
  const frame = page.frameLocator('.os-win[data-app="markets"] iframe');
  await expect(frame.locator(".mk-status")).toHaveAttribute("data-source", "live");
  await expect(back).toBeDisabled();

  await frame.getByRole("button", { name: "Expand all" }).click();
  await frame.locator('a[data-row-key="16:MSFT"]').click();
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=MSFT");
  await expect(frame.locator("#mk-preview-title")).toHaveText("Microsoft");
  const snow = frame.locator('a[data-row-key="15:SNOW"]');
  await snow.click();
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=SNOW");
  await expect(frame.locator("#mk-preview-title")).toHaveText("Snowflake");
  await expect(snow).toHaveAttribute("aria-current", "true");
  await expect(back).toBeDisabled();

  /* The full view comes up under the page's header; only the window's page scrolls, not the desktop around it. */
  await frame.getByRole("link", { name: "Open full view" }).click();
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=SNOW&full=1");
  await expect(back).toBeEnabled();
  const heading = frame.locator(".mk-detail").getByRole("heading", { name: "Snowflake", level: 2 });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(frame.getByRole("heading", { name: "Markets", level: 1 })).not.toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await frame.getByRole("button", { name: "Back to stack" }).click();
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=SNOW");
  await expect(frame.locator(".mk-detail")).toHaveCount(0);
  await expect(snow).toBeFocused();
  await expect(back).toBeDisabled();
  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=SNOW&full=1");
  await expect(heading).toBeVisible();
  await back.click();
  await expect(address).toHaveText("agarwal-labs.com/markets?symbol=SNOW");
  await expect(frame.locator(".mk-detail")).toHaveCount(0);
  await expect(frame.locator("#mk-preview-title")).toHaveText("Snowflake");

  /* Switching tabs replaces the window's page too. */
  await frame.getByRole("tab", { name: "Insights" }).click();
  await expect(address).toHaveText("agarwal-labs.com/markets?tab=insights&symbol=SNOW");
  await expect(frame.locator(".mk-insight")).toHaveCount(7);
  await expect(back).toBeDisabled();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("the launch tracker shows a live launch, plays streams in place, and lists replays", async ({ page }) => {
  const now = Date.now();
  await page.unroute(upcomingApi);
  await page.unroute(previousApi);
  await page.route(upcomingApi, (route) => route.fulfill({
    json: {
      results: [
        launch("live-1", "Starlink Group 10-1", now - 2 * 60 * 1000, {
          status: ["In Flight", "Launch in Flight"],
          live: true,
          videos: [
            { url: "https://x.com/SpaceX/status/1", publisher: "SpaceX", official: true, live: true, priority: 1 },
            { url: "https://www.youtube.com/watch?v=abcdefghijk", publisher: "Space Affairs", live: true }
          ]
        }),
        launch("next-1", "Transporter-20", now + 3 * 24 * hour)
      ]
    }
  }));
  await page.route(previousApi, (route) => route.fulfill({
    json: {
      results: [
        launch("prev-1", "CRS-40", now - 2 * 24 * hour, {
          status: ["Success", "Launch Successful"],
          videos: [{ url: "https://www.youtube.com/watch?v=bcdefghijkl", publisher: "NASA", official: true, priority: 1 }]
        }),
        launch("prev-2", "Starlink Group 9-9", now - 4 * 24 * hour, {
          status: ["Success", "Launch Successful"],
          videos: [{ url: "https://x.com/SpaceX/status/2", publisher: "SpaceX", official: true, priority: 1 }]
        }),
        { ...launch("other-1", "Not SpaceX", now - 24 * hour), launch_service_provider: { id: 1, name: "Other" } }
      ]
    }
  }));
  await page.goto("./launches");

  const hero = page.locator(".lt-hero");
  await expect(hero.getByRole("status")).toContainText("Live now");
  await expect(hero.getByRole("link", { name: "SpaceX broadcast on X" })).toHaveAttribute("href", "https://x.com/SpaceX/status/1");
  await expect(hero.getByRole("heading", { name: "Starlink Group 10-1" })).toBeVisible();
  await expect(hero.getByRole("timer", { name: "Time since launch" })).toContainText("T+");
  await expect(hero).toContainText("B1090, flight 5, landing on A Shortfall of Gravitas");
  await hero.getByRole("button", { name: "Watch live here: Falcon 9 Block 5 | Starlink Group 10-1 live stream" }).click();
  await expect(hero.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0");
  await expect(hero.locator("figcaption")).toContainText("Space Affairs (unofficial)");

  const upcoming = page.locator(".lt-upcoming li");
  await expect(upcoming).toHaveCount(1);
  await expect(upcoming).toContainText("Transporter-20");
  await expect(upcoming).toContainText("in 3 days");

  const cards = page.locator(".lt-grid > li");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByRole("button", { name: "Watch replay: Falcon 9 Block 5 | CRS-40 replay" })).toBeVisible();
  await expect(cards.nth(0).locator("figcaption")).toContainText("NASA webcast");
  /* An official webcast that is already the embedded replay is not linked twice. */
  await expect(cards.nth(0).locator(".lt-card__links")).toHaveCount(0);
  await expect(cards.nth(1).getByRole("link", { name: "SpaceX webcast on X" })).toHaveAttribute("href", "https://x.com/SpaceX/status/2");
  await expect(page.getByText("Not SpaceX")).toHaveCount(0);
});

for (const cached of [false, true]) {
  test(`the launch tracker waits for both feeds before showing empty results (cached: ${cached})`, async ({ page }) => {
    if (cached) {
      await page.addInitScript(() => {
        const feed = { fetchedAt: Date.now() - 24 * 60 * 60 * 1000, launches: [] };
        localStorage.setItem("spacex-tracker-v1", JSON.stringify({ upcoming: feed, previous: feed }));
      });
    }
    let releaseUpcoming!: () => void;
    let releasePrevious!: () => void;
    const upcomingGate = new Promise<void>((resolve) => { releaseUpcoming = resolve; });
    const previousGate = new Promise<void>((resolve) => { releasePrevious = resolve; });
    await page.route(upcomingApi, async (route) => {
      await upcomingGate;
      await route.fulfill({ json: { results: [launch("next-loading", "Loaded mission", Date.now() + 24 * hour)] } });
    });
    await page.route(previousApi, async (route) => {
      await previousGate;
      await route.fulfill({ json: { results: [] } });
    });
    try {
      await page.goto("./launches");
      await expect(page.getByText("Loading the SpaceX schedule...", { exact: true })).toBeVisible();
      await expect(page.getByText("Loading recent launches...", { exact: true })).toBeVisible();
      await expect(page.getByText("No SpaceX launches are on the schedule right now.")).toHaveCount(0);
      await expect(page.getByText("No recent SpaceX launches to show.")).toHaveCount(0);

      releaseUpcoming();
      await expect(page.getByRole("heading", { name: "Loaded mission" })).toBeVisible();
      await expect(page.getByText("Loading recent launches...", { exact: true })).toBeVisible();
      releasePrevious();
      await expect(page.getByText("No recent SpaceX launches to show.")).toBeVisible();
      await expect(page.getByText("Loading recent launches...", { exact: true })).toHaveCount(0);
    } finally {
      releaseUpcoming();
      releasePrevious();
    }
  });
}

test("the launch tracker only reports an empty schedule after a successful response", async ({ page }) => {
  await page.goto("./launches");
  await expect(page.getByText("No SpaceX launches are on the schedule right now.")).toBeVisible();
  await expect(page.getByText("No recent SpaceX launches to show.")).toBeVisible();
  await expect(page.getByText("Loading the SpaceX schedule...", { exact: true })).toHaveCount(0);
});

test("the launch tracker keeps saved launches visible while refreshing and after a timeout", async ({ page }) => {
  await page.clock.install();
  await page.route(upcomingApi, (route) => route.fulfill({
    json: { results: [launch("saved-next", "Saved upcoming mission", Date.now() + 24 * hour)] }
  }));
  await page.route(previousApi, (route) => route.fulfill({
    json: { results: [launch("saved-previous", "Saved recent mission", Date.now() - 24 * hour, { status: ["Success", "Launch Successful"] })] }
  }));
  await page.goto("./launches");
  await expect(page.getByRole("heading", { name: "Saved upcoming mission" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved recent mission" })).toBeVisible();
  await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem("spacex-tracker-v1") ?? "{}");
    cache.upcoming.fetchedAt = cache.previous.fetchedAt = Date.now() - 24 * 60 * 60 * 1000;
    localStorage.setItem("spacex-tracker-v1", JSON.stringify(cache));
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(upcomingApi, async (route) => { await gate; await route.abort(); });
  await page.route(previousApi, async (route) => { await gate; await route.abort(); });
  try {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Saved upcoming mission" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved recent mission" })).toBeVisible();
    await expect(page.getByText("Loading the SpaceX schedule...", { exact: true })).toHaveCount(0);
    await page.clock.fastForward(20_001);
    await expect(page.getByText(/saved copy; the next check is retrying/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved upcoming mission" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved recent mission" })).toBeVisible();
  } finally {
    release();
  }
});

test("the launch tracker stops loading after 20 seconds and shows failures", async ({ page }) => {
  await page.clock.install();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(upcomingApi, async (route) => { await gate; await route.abort(); });
  await page.route(previousApi, async (route) => { await gate; await route.abort(); });
  try {
    await page.goto("./launches");
    await expect(page.getByText("Loading the SpaceX schedule...", { exact: true })).toBeVisible();
    await expect(page.getByText("Loading recent launches...", { exact: true })).toBeVisible();
    await page.clock.fastForward(19_000);
    await expect(page.getByText("Loading the SpaceX schedule...", { exact: true })).toBeVisible();
    await page.clock.fastForward(1_001);
    await expect(page.getByText("The launch schedule could not load right now.", { exact: false })).toBeVisible();
    await expect(page.getByText("Recent launches could not load right now.")).toBeVisible();
    await expect(page.getByText("No SpaceX launches are on the schedule right now.")).toHaveCount(0);
    await page.clock.fastForward(11 * 60_000);
    await expect(page.getByText("Loading the SpaceX schedule...", { exact: true })).toBeVisible();
    await expect(page.getByText("Loading recent launches...", { exact: true })).toBeVisible();
    await page.clock.fastForward(20_001);
    await expect(page.getByText("Recent launches could not load right now.")).toBeVisible();
  } finally {
    release();
  }
});

test("the launch tracker explains failures and keeps the page usable", async ({ page }) => {
  await page.unroute(upcomingApi);
  await page.unroute(previousApi);
  await page.route(upcomingApi, (route) => route.fulfill({ status: 429, json: { detail: "Request was throttled." } }));
  await page.route(previousApi, (route) => route.abort());
  await page.goto("./launches");
  await expect(page.locator(".lt-hero").getByRole("status")).toContainText("The launch schedule could not load right now.");
  await expect(page.getByRole("link", { name: "See SpaceX's launch page" })).toHaveAttribute("href", "https://www.spacex.com/launches/");
  await expect(page.getByText("Recent launches could not load right now.")).toBeVisible();
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem("spacex-tracker-v1") ?? "{}"));
  expect(cache.upcoming.retryAt).toBeGreaterThan(Date.now() + 25 * 60 * 1000);
  expect(cache.previous.retryAt).toBeGreaterThan(Date.now());
});

test("AI leaderboards read Arena live, keep tabs linkable, and fall back to the snapshot", async ({ page }) => {
  const configs: string[] = [];
  await page.unroute("https://datasets-server.huggingface.co/**");
  await page.route("https://datasets-server.huggingface.co/**", (route) => {
    const config = new URL(route.request().url()).searchParams.get("config") ?? "";
    configs.push(config);
    const row = (rank: number, model: string, organization: string, rating: number, category = "overall") =>
      ({ row: { rank, model_name: model, organization, license: "Proprietary", rating, rating_lower: rating - 5, rating_upper: rating + 5, vote_count: 12345, category, leaderboard_publish_date: "2026-11-08" } });
    return route.fulfill({ json: { rows: [row(2, `${config}-runner-up`, "anthropic", 1490.2), row(1, `${config}-leader`, "openai", 1500.4), row(1, "coding-only", "xai", 1600, "coding")] } });
  });
  await page.goto("./leaderboards");

  const arena = page.locator("#arena-panel");
  await expect(arena).toContainText("Live from LMArena, published Nov 8, 2026");
  await expect(arena.locator("tbody tr")).toHaveCount(2);
  await expect(arena.locator("tbody tr").first()).toContainText("text_style_control-leader");
  await expect(arena.locator("tbody tr").first()).toContainText("OpenAI");
  await expect(arena.locator("tbody tr").first()).toContainText("1500");
  await expect(arena).not.toContainText("coding-only");
  await expect(arena.getByRole("link", { name: "Full Text Arena leaderboard" })).toHaveAttribute("href", "https://arena.ai/leaderboard/text");

  const arenaTabs = page.getByRole("tablist", { name: "Arena boards" });
  await arenaTabs.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY) + 150;
  await page.mouse.wheel(0, 150);
  // Wheel input returns before scrolling finishes; wait for the full movement.
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scroll);
  await arenaTabs.getByRole("tab", { name: "WebDev" }).click();
  await expect(page).toHaveURL(/\/leaderboards\?arena=webdev$/);
  await expect(arenaTabs.getByRole("tab", { name: "WebDev" })).toHaveAttribute("aria-selected", "true");
  await expect(arena.locator("tbody tr").first()).toContainText("webdev-leader");
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await page.keyboard.press("ArrowRight");
  await expect(arenaTabs.getByRole("tab", { name: "Vision" })).toBeFocused();
  await expect(page).toHaveURL(/arena=vision/);
  await page.keyboard.press("End");
  await expect(arenaTabs.getByRole("tab", { name: "Image" })).toBeFocused();
  await expect(arena.getByRole("link", { name: "Full Text-to-Image Arena leaderboard" })).toBeVisible();

  const benchTabs = page.getByRole("tablist", { name: "Benchmarks" });
  await benchTabs.getByRole("tab", { name: "METR time horizon" }).click();
  await expect(page).toHaveURL(/arena=text-to-image&bench=metr$/);
  await expect(page.locator("#bench-panel tbody tr").first()).toContainText(/\d hr/);
  expect(configs).toEqual(["text_style_control", "webdev", "vision_style_control", "text_to_image"]);

  /* Cached boards are reused, and boards that have never loaded fall back to the published snapshot. */
  await page.unroute("https://datasets-server.huggingface.co/**");
  await page.route("https://datasets-server.huggingface.co/**", (route) => route.abort());
  await page.goto("./leaderboards?arena=webdev");
  await expect(arena).toContainText("Live from LMArena");
  await expect(arena.locator("tbody tr").first()).toContainText("webdev-leader");
  await page.getByRole("tab", { name: "Search" }).click();
  await expect(arena).toContainText(/Saved snapshot, published \w{3} \d{1,2}, \d{4}/);
  await expect(arena.locator("tbody tr")).not.toHaveCount(0);
  await expect(page.locator(".lb-leaders li")).toHaveCount(7);
});

test("live pages fit a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["./markets", "./markets?symbol=NVDA", "./launches", "./leaderboards"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Live pages" }).getByRole("link", { name: "AI leaderboards" })).toBeInViewport({ ratio: 1 });
    expect(await horizontalOverflow(page), path).toBe(0);
  }
});
