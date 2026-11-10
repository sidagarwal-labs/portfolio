import { expect, test, type Page } from "@playwright/test";

const upcomingApi = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/**";
const previousApi = "https://ll.thespacedevs.com/2.3.0/launches/previous/**";
const hour = 60 * 60 * 1000;

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/api/v1/quote?*", (route) => route.fulfill({ json: { c: 230.36, dp: 0.84, t: 1788552000 } }));
  await page.route("https://s3.tradingview.com/**", (route) => route.abort());
  await page.route(/^https:\/\/(www\.youtube-nocookie\.com|i\.ytimg\.com)\//, (route) => route.abort());
  await page.route(upcomingApi, (route) => route.fulfill({ json: { results: [] } }));
  await page.route(previousApi, (route) => route.fulfill({ json: { results: [] } }));
  await page.route("https://datasets-server.huggingface.co/**", (route) => route.abort());
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

test("Markets shows a linkable quote, watchlist, and TradingView fallbacks", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("https://s3.tradingview.com/")) scripts.push(request.url()); });
  await page.goto("./markets?symbol=MSFT");

  await expect(page).toHaveTitle("MSFT · Markets | Sid Agarwal");
  await expect(page.getByRole("heading", { name: "Microsoft", exact: true })).toBeVisible();
  // useStockQuotes waits for the whole watchlist batch (up to 8s) before showing any price.
  await expect(page.locator(".mk-quote")).toContainText("$230.36", { timeout: 10_000 });
  await expect(page.locator(".mk-quote")).toContainText("+0.84% today");
  const watchlist = page.getByRole("navigation", { name: "Watchlist" });
  await expect(watchlist.getByRole("link")).toHaveCount(7);
  await expect(watchlist.locator('[aria-current="page"]')).toContainText("MSFT");

  const chart = page.locator(".tv-widget").first();
  await expect(chart).toHaveAttribute("data-state", "failed");
  await expect(chart.getByRole("alert")).toContainText("The MSFT chart could not load here.");
  await expect(chart.getByRole("link", { name: "Open it on TradingView" })).toHaveAttribute("href", "https://www.tradingview.com/symbols/NASDAQ-MSFT/");
  expect(scripts.some((url) => url.endsWith("/embed-widget-advanced-chart.js"))).toBe(true);

  await watchlist.getByRole("link", { name: /NVDA/ }).click();
  await expect(page).toHaveURL(/\/markets\?symbol=NVDA$/);
  await expect(page.getByRole("heading", { name: "NVIDIA", exact: true })).toBeVisible();
  await expect(page.locator(".tv-widget").first()).toContainText("The NVDA chart could not load here.");

  await page.goto("./markets?symbol=<script>");
  await expect(page.getByRole("heading", { name: "NVIDIA", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Live pages" }).getByRole("link", { name: "Launches" }).click();
  await expect(page).toHaveURL(/\/launches$/);
  await expect(page.getByRole("heading", { name: "SpaceX launch tracker", level: 1 })).toBeVisible();
});

test("Markets tickers keep the reader's place on the page and in a Lab OS window", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  const scrollY = () => page.evaluate(() => window.scrollY);
  await page.goto("./markets?symbol=MSFT");
  await expect(page.getByRole("heading", { name: "Microsoft", exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => scrollY()).toBe(400);
  await page.getByRole("navigation", { name: "Watchlist" }).getByRole("link", { name: /NVDA/ }).click();
  await expect(page).toHaveURL(/\/markets\?symbol=NVDA$/);
  await expect(page.getByRole("heading", { name: "NVIDIA", exact: true })).toBeVisible();
  expect(await scrollY()).toBe(400);
  /* A different page still opens at its top. */
  await page.getByRole("navigation", { name: "Live pages" }).getByRole("link", { name: "Launches" }).click();
  await expect(page).toHaveURL(/\/launches$/);
  expect(await scrollY()).toBe(0);

  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Open Markets" }).click();
  const frame = page.frameLocator('.os-win[data-app="markets"] iframe');
  await expect(frame.getByRole("heading", { name: "NVIDIA", exact: true })).toBeVisible();
  const body = frame.locator("body");
  await body.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => body.evaluate(() => window.scrollY)).toBe(300);
  /* A scripted click reaches the window's link handler without Playwright first scrolling the link into view. */
  await frame.getByRole("navigation", { name: "Watchlist" }).getByRole("link", { name: /MSFT/ }).evaluate((link) => (link as HTMLElement).click());
  await expect(frame.getByRole("heading", { name: "Microsoft", exact: true })).toBeVisible();
  expect(await body.evaluate(() => window.scrollY)).toBe(300);
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
  for (const path of ["./markets", "./launches", "./leaderboards"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Live pages" }).getByRole("link", { name: "AI leaderboards" })).toBeInViewport({ ratio: 1 });
    expect(await horizontalOverflow(page), path).toBe(0);
  }
});
