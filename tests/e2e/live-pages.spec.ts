import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const upcomingApi = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/**";
const previousApi = "https://ll.thespacedevs.com/2.3.0/launches/previous/**";
const stackCsv = "https://docs.google.com/spreadsheets/**";
const hour = 60 * 60 * 1000;

const stackSnapshot = JSON.parse(readFileSync(new URL("../../src/content/generated/ai-stack.json", import.meta.url), "utf8")) as { rows: unknown[] };

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
  const chips = page.locator("#mk-layer-chips");
  await expect(chips.locator(".mk-layer__head > p")).toHaveText("Levels 1–5 · 3 companies");
  await expect(chips.locator(".mk-layer__stats dd")).toHaveText(["+0.75%", "-37.5%", "1 up, 1 down"]);
  await expect(page.locator("#mk-layer-data-center .mk-layer__stats dd")).toHaveText(["-1.25%", "-15.0%", "1 up, 1 down"]);
  await expect(chips.locator(".mk-level__number")).toHaveText(["Level 1", "Level 5"]);
  await expect(chips.locator(".mk-group__name")).toHaveText(["Designing", "Memory - HBM"]);

  /* Levels the research notes rank as bottlenecks carry the ranking's badge. */
  await expect(page.getByRole("group", { name: /^Level 5 Memory - HBM ?, bottleneck HBM capacity and bandwidth: Very high$/ })).toBeVisible();
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

  /* The arrow keys, Home, and End move through the companies and preview each one; the list is one tab stop. */
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
  await expect(page.locator('a[data-row-key][tabindex="0"]')).toHaveCount(1);
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
  await expect(pricedIn.getByRole("img", { name: /^Bottleneck tightness against median distance from the 52-week high/ })).toBeVisible();
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
  await expect(inline).toHaveCount(1);
  expect(await previewAfter()).toBe("NVDA");
  await expect(inline.getByRole("heading", { name: "NVIDIA", level: 4 })).toBeVisible();

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
