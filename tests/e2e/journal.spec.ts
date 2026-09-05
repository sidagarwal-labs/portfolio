import { expect, test } from "@playwright/test";

const quoteApi = "https://finnhub.io/api/v1/quote?*";
const primaryTicker = ".ticker-track__group:not([aria-hidden])";
const noteCommitsApi = "https://api.github.com/repos/sidagarwal-labs/models/commits?*";
const launchApi = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/**";

function launchPayload(net = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()) {
  return {
    name: "Falcon 9 | Test mission",
    net,
    launch_service_provider: { id: 121 },
    status: { abbrev: "Go" },
    net_precision: { name: "Minute" }
  };
}

test.beforeEach(async ({ page }) => {
  await page.route(quoteApi, (route) => route.fulfill({ json: {
    c: 230.36,
    dp: new URL(route.request().url()).searchParams.get("symbol") === "MSFT" ? -2.04 : 0.84,
    t: 1788552000
  } }));
  await page.route(noteCommitsApi, (route) => route.abort());
  await page.route(launchApi, (route) => route.fulfill({ json: { results: [launchPayload()] } }));
});

test("homepage presents real writing and projects without the scene runtime", async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("./");

  await expect(page.getByRole("heading", { name: "Sid Agarwal", exact: true })).toBeVisible();
  await expect(page.locator("canvas, .glass-card, .scene-canvas")).toHaveCount(0);
  await expect(page.locator("#writing a")).toHaveCount(6);
  await expect(page.getByRole("link", { name: "Financial models", exact: true })).toHaveAttribute("href", "https://github.com/sidagarwal-labs/models");
  await expect(page.getByRole("link", { name: "NVDocs RAG", exact: true })).toHaveAttribute("href", "https://github.com/sidagarwal-labs/NVDocs_RAG");
  await expect(page.getByRole("link", { name: "HireMe.AI", exact: true })).toHaveAttribute("href", "https://github.com/sidagarwal-labs/HireMe-AI");
  await expect(page.locator("body")).not.toContainText("GPU UTIL");
  expect(requests.some((url) => /three-vendor|tradingview|api\/launches/.test(url))).toBe(false);
  expect(errors).toEqual([]);
});

test("research notes link to the verified source documents", async ({ page }) => {
  await page.goto("./");
  for (const [title, slug] of [
    ["Foundation labs", "foundation-labs"],
    ["AI memory & storage", "memory-storage"],
    ["GPU & memory prices", "gpu-prices"],
    ["AI capital expenditure", "ai-capex"],
    ["AI adoption", "ai-adoption"],
    ["Cloud growth", "cloud-growth"]
  ]) {
    await expect(page.getByRole("link", { name: title, exact: true })).toHaveAttribute("href", `https://github.com/sidagarwal-labs/models/blob/main/notes/${slug}.md`);
  }
});

test("section links scroll immediately and do not hijack subsequent scrolling", async ({ page }) => {
  await page.goto("./");
  for (const [label, sectionId] of [["Writing", "writing"], ["Projects", "lab"], ["Reading", "library"], ["About", "impact"], ["Contact", "contact"]]) {
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${sectionId}$`));
    await expect(page.locator(`#${sectionId}`)).toBeInViewport();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveURL(/#contact$/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Contact", exact: true }).click();
  await expect(page.locator("#contact")).toBeInViewport();
});

for (const [path, sectionId] of [
  ["experience", "impact"], ["projects", "lab"], ["writing", "writing"],
  ["blog", "writing"], ["books", "library"], ["reading", "library"],
  ["about", "impact"], ["contact", "contact"], ["portfolio", "lab"]
]) {
  test(`legacy /${path} links still reach the right section`, async ({ page }) => {
    await page.goto(`./${path}`);
    await expect(page).toHaveURL(new RegExp(`/portfolio/#${sectionId}$`));
    await expect(page.locator(`#${sectionId}`)).toBeInViewport();
  });
}

test("direct fragment links work after the app mounts", async ({ page }) => {
  await page.goto("./#library");
  await expect(page.locator("#library")).toBeInViewport();
  await expect(page.locator(".reading-list li")).toHaveCount(11);
});

test("the removed LLM-coding note is absent and its old URL has a recovery link", async ({ page }) => {
  await page.goto("./");
  const homeTitle = await page.title();
  await expect(page.getByRole("link", { name: "Learning to code with LLMs", exact: true })).toHaveCount(0);
  await page.goto("./writing/learning-to-code-with-llms");
  await expect(page.getByRole("heading", { name: "Note not found" })).toBeVisible();
  await expect(page.locator(".article-body")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to writing", exact: true }).click();
  await expect(page).toHaveTitle(homeTitle);
  await expect(page.locator("#writing")).toBeInViewport();
});

test("unknown essays have a useful recovery link", async ({ page }) => {
  await page.goto("./writing/not-a-real-note");
  await expect(page.getByRole("heading", { name: "Note not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to writing", exact: true }).click();
  await expect(page.locator("#writing")).toBeInViewport();
});

test("GitHub Pages 404 recovery preserves an essay URL, query, and fragment", async ({ page, request, baseURL }) => {
  const fallback = await request.get(`${baseURL}404.html`);
  expect(fallback.ok()).toBe(true);
  const fallbackHtml = await fallback.text();
  await page.route("**/writing/missing-note?**", (route) => route.fulfill({ status: 404, contentType: "text/html", body: fallbackHtml }), { times: 1 });
  await page.goto("./writing/missing-note?from=share&mode=read#main");
  await expect(page.getByRole("heading", { name: "Note not found", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/portfolio\/writing\/missing-note\?from=share&mode=read#main$/);
});

test("earlier projects remain available through an accessible disclosure", async ({ page }) => {
  await page.goto("./#lab");
  const disclosure = page.locator(".project-archive");
  await disclosure.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(disclosure.locator("a")).not.toHaveCount(0);
  await expect(disclosure.getByRole("link", { name: "Applied Machine Learning", exact: true })).toHaveAttribute("href", "https://github.com/sidagarwal-labs/Applied-Machine-Learning");
});

test("contact and the bundled resume retain their working destinations", async ({ page, request }) => {
  await page.goto("./#contact");
  await expect(page.locator("#contact").getByRole("link", { name: "Email", exact: true })).toHaveAttribute("href", "mailto:sid.webster@gmail.com");
  const resumeHref = await page.getByRole("link", { name: "Resume (PDF)", exact: true }).getAttribute("href");
  expect(resumeHref).toMatch(/^\/portfolio\/assets\/.*\.pdf$/);
  const resume = await request.get(resumeHref!);
  expect(resume.ok()).toBe(true);
  expect((await resume.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("a blocked ticker shows quote links without invented prices", async ({ page }) => {
  await page.route(quoteApi, (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("./");
  const ticker = page.locator(primaryTicker);
  await expect(page.locator(".ticker-track")).toHaveAttribute("data-state", "unavailable");
  await expect(ticker.locator(".ticker-item--stock")).toHaveCount(7);
  await expect(ticker.locator(".ticker-item--stock strong")).toHaveText(Array(7).fill("Unavailable"));
  await expect(ticker.getByRole("link", { name: "NVDA Unavailable", exact: true })).toHaveAttribute("href", "https://finance.yahoo.com/quote/NVDA/");
  await expect(ticker).not.toContainText("$");
});

test("slow quote requests time out gracefully", async ({ page }) => {
  await page.route(quoteApi, () => {});
  await page.clock.install();
  await page.goto("./");
  await expect(page.locator(`${primaryTicker} .ticker-item--stock strong`)).toHaveText(Array(7).fill("Loading..."));
  await page.clock.fastForward(8_100);
  await expect(page.locator(".ticker-track")).toHaveAttribute("data-state", "unavailable");
});

test("one native track contains all items and stays mounted between pages", async ({ page }) => {
  await page.goto("./writing/not-a-real-note");
  const track = page.locator(".ticker-track");
  await expect(track).toHaveAttribute("data-state", "ready");
  await expect(page.locator(".market-bar iframe")).toHaveCount(0);
  await expect(page.locator(`${primaryTicker} > .ticker-item`)).toHaveCount(10);
  await expect(track).not.toContainText("Finnhub");
  await expect(track).not.toContainText("Quotes may be delayed");
  await expect(page.locator(`${primaryTicker} .ticker-item--stock .ticker-item__label`)).toHaveText(["NVDA", "MSFT", "TSLA", "AAPL", "GOOGL", "CRWV", "MU"]);
  await expect(page.locator(`${primaryTicker} .ticker-change--down`)).toHaveText("-2.04%");
  await track.evaluate((element) => element.setAttribute("data-original", "true"));
  await page.getByRole("link", { name: "Back to writing", exact: true }).click();
  await expect(track).toHaveAttribute("data-original", "true");
  await expect(track).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Show market ticker" }).uncheck();
  await expect(track).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Show market ticker" }).check();
  await expect(track).toHaveAttribute("data-state", "cached");
  await expect(track).toHaveCount(1);
});

test("stocks and custom metrics move together in one seamless loop", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".ticker-track")).toHaveAttribute("data-state", "ready");
  const motion = await page.locator(".ticker-track").evaluate((track) => {
    const animation = track.getAnimations()[0];
    animation.pause();
    const items = Array.from(track.querySelectorAll(".ticker-track__group:first-child > .ticker-item"));
    const positions = () => items.map((item) => item.getBoundingClientRect().x);
    animation.currentTime = 0;
    const before = positions();
    animation.currentTime = 10_000;
    const after = positions();
    const groups = Array.from(track.querySelectorAll(".ticker-track__group"));
    return {
      distances: after.map((position, index) => position - before[index]),
      fonts: items.map((item) => getComputedStyle(item).font),
      widths: groups.map((group) => group.getBoundingClientRect().width),
      contents: groups.map((group) => group.textContent)
    };
  });
  expect(motion.distances).toHaveLength(10);
  expect(motion.distances[0]).toBeLessThan(-100);
  expect(motion.distances.every((distance) => Math.abs(distance - motion.distances[0]) < 1)).toBe(true);
  expect(new Set(motion.fonts).size).toBe(1);
  expect(motion.widths[0]).toBeCloseTo(motion.widths[1], 2);
  expect(motion.contents[0]).toBe(motion.contents[1]);
});

test("ticker pauses on hover and becomes keyboard-scrollable without duplicate focus stops", async ({ page }) => {
  await page.goto("./");
  const viewport = page.locator(".market-bar__viewport");
  await expect(page.locator(".ticker-track")).toHaveAttribute("data-state", "ready");
  await viewport.hover();
  await expect(page.locator(".ticker-track")).toHaveCSS("animation-play-state", "paused");
  await viewport.focus();
  await expect(page.locator(".ticker-track")).toHaveCSS("animation-name", "none");
  await expect(page.locator('.ticker-track__group[aria-hidden="true"]')).toBeHidden();
  await expect(page.getByRole("list", { name: "Market and science updates" })).toHaveCount(1);
  expect(await page.locator('.ticker-track__group[aria-hidden="true"] a').evaluateAll((links) => links.every((link) => (link as HTMLAnchorElement).tabIndex === -1))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.locator(`${primaryTicker} .ticker-item--stock a`).first()).toBeFocused();
});

test("quotes refresh once per minute without doubling requests for the visual loop", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-05T12:00:00Z") });
  const requestedSymbols: string[] = [];
  await page.route(quoteApi, (route) => {
    requestedSymbols.push(new URL(route.request().url()).searchParams.get("symbol")!);
    return route.fulfill({ json: { c: requestedSymbols.length > 7 ? 240 : 230.36, dp: 0.84, t: 1788552000 } });
  });
  await page.goto("./");
  await expect(page.locator(".ticker-track")).toHaveAttribute("data-state", "ready");
  expect(requestedSymbols).toHaveLength(7);
  expect(new Set(requestedSymbols).size).toBe(7);
  await page.clock.fastForward(60_100);
  await expect(page.locator(`${primaryTicker} .ticker-item--stock strong`)).toHaveText(Array(7).fill("$240.00"));
  expect(requestedSymbols).toHaveLength(14);
  await page.getByRole("checkbox", { name: "Show market ticker" }).uncheck();
  await page.clock.fastForward(120_000);
  expect(requestedSymbols).toHaveLength(14);
});

test("failed refreshes retain genuine quotes with explicit cached status and timestamps", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("stock-quotes-v1", JSON.stringify({
      fetchedAt: Date.now() - 120_000,
      quotes: { NVDA: { price: 215, changePercent: -1.5, quotedAt: 1788552000 } }
    }));
  });
  await page.route(quoteApi, (route) => route.fulfill({ status: 429, json: {} }));
  await page.goto("./");
  await expect(page.locator(".ticker-track")).toHaveAttribute("data-state", "cached");
  await expect(page.locator(`${primaryTicker} .ticker-item--stock strong`).first()).toHaveText("$215.00");
  await expect(page.locator(`${primaryTicker} .ticker-item--stock a`).first()).toHaveAttribute("title", /Cached Finnhub quote as of Sep 4, 2026, 20:00 UTC/);
});

test("invalid or empty quote values are never displayed as prices", async ({ page }) => {
  await page.route(quoteApi, (route) => route.fulfill({ json: { c: 0, dp: null, t: 0 } }));
  await page.goto("./");
  await expect(page.locator(".ticker-track")).toHaveAttribute("data-state", "unavailable");
  await expect(page.locator(`${primaryTicker} .ticker-item--stock strong`)).toHaveText(Array(7).fill("Unavailable"));
  await expect(page.locator(primaryTicker)).not.toContainText("NaN");
});

test("ticker visibility is remembered and disabling it avoids provider requests", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("checkbox", { name: "Show market ticker" }).uncheck();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Show market ticker" })).not.toBeChecked();
  await expect(page.locator(".ticker-track")).toHaveCount(0);
  expect(requests.some((url) => /finnhub|thespacedevs/.test(url))).toBe(false);
});

test("reduced motion defaults the ticker off and keeps enabled items static", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page.getByRole("checkbox", { name: "Show market ticker" })).not.toBeChecked();
  await expect(page.locator(".ticker-track")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Show market ticker" }).check();
  await expect(page.locator(".ticker-track")).toHaveAttribute("data-state", "ready");
  await expect(page.locator(".ticker-track")).toHaveCSS("animation-name", "none");
  await expect(page.locator('.ticker-track__group[aria-hidden="true"]')).toBeHidden();
});

test("blocked local storage does not prevent reading or disabling the ticker", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Sid Agarwal", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Show market ticker" }).uncheck();
  await expect(page.locator(".ticker-track")).toHaveCount(0);
});

test("keyboard users can skip navigation", async ({ page }) => {
  await page.goto("./");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("introduction and background cover different information", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".introduction")).toContainText("Senior Product Manager at Microsoft");
  await expect(page.locator("#impact")).not.toContainText("Microsoft");
  await expect(page.locator("#impact")).toContainText("UNC Charlotte");
  await expect(page.locator("#impact")).toContainText("Business Analytics.");
  await expect(page.locator("#impact")).not.toContainText("expected December 2026");
});

test.describe("GitHub note dates", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("verified commit dates remain visible when GitHub is unavailable", async ({ page }) => {
    await page.goto("./");
    const dates = page.locator(".writing-list time");
    await expect(dates).toHaveCount(6);
    await expect(dates).toHaveText(Array(6).fill("Aug 18, 2026"));
    await expect(dates.first()).toHaveAttribute("datetime", "2026-08-18T17:43:38Z");
  });

  test("each file refreshes from GitHub, keeps UTC dates, and reuses its cache", async ({ page }) => {
    const requests: URL[] = [];
    await page.route(noteCommitsApi, (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      const date = url.searchParams.get("path") === "notes/foundation-labs.md"
        ? "2026-09-04T00:05:00Z" : "2026-08-18T02:46:54Z";
      return route.fulfill({ json: [{ commit: { committer: { date } } }] });
    });
    await page.goto("./");
    await expect(page.locator(".writing-list time").first()).toHaveText("Sep 4, 2026");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("research-note-dates-v1"))).not.toBeNull();
    expect(requests).toHaveLength(6);
    expect(requests.every((url) => url.searchParams.get("per_page") === "1")).toBe(true);
    expect(new Set(requests.map((url) => url.searchParams.get("path"))).size).toBe(6);
    await page.reload();
    await expect(page.locator(".writing-list time").first()).toHaveText("Sep 4, 2026");
    expect(requests).toHaveLength(6);
  });

  test("corrupt cached dates cannot break the writing list", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("research-note-dates-v1", JSON.stringify({ fetchedAt: Date.now(), dates: { "foundation-labs": "not-a-date" } }));
    });
    await page.goto("./");
    await expect(page.locator(".writing-list time")).toHaveText(Array(6).fill("Aug 18, 2026"));
  });
});

test("books keep their list layout and reserved thumbnail dimensions", async ({ page }) => {
  await page.goto("./#library");
  await expect(page.locator(".book-cover")).toHaveCount(11);
  const covers = await page.locator(".book-cover").evaluateAll((images) => images.map((image) => ({
    width: image.getBoundingClientRect().width,
    height: image.getBoundingClientRect().height,
    fit: getComputedStyle(image).objectFit,
    alt: image.getAttribute("alt")
  })));
  expect(covers.every((cover) => cover.width === 34 && cover.height === 50 && cover.fit === "contain" && cover.alt === "")).toBe(true);
});

test("a missing cover does not display a broken image or remove a book link", async ({ page }) => {
  await page.route("https://m.media-amazon.com/images/**", (route) => route.abort());
  await page.goto("./#library");
  await expect(page.locator(".book-cover").first()).toHaveCSS("visibility", "hidden");
  await expect(page.locator("#library").getByRole("link", { name: "Steve Jobs", exact: true })).toBeVisible();
  expect((await page.locator(".book-cover").first().boundingBox())?.width).toBe(34);
});

test("space and AI signals include sources and a dated Arena leader", async ({ page }) => {
  await page.goto("./");
  const signals = page.locator(primaryTicker);
  await expect(signals.locator(".launch-countdown")).toHaveText(/^T-/);
  await expect(signals).toContainText("Mars g");
  await expect(signals).toContainText("3.71 m/s");
  await expect(signals.getByRole("link", { name: "LL2", exact: true })).toHaveAttribute("href", "https://thespacedevs.com/llapi");
  await expect(signals.getByText("Highest ELO LLM", { exact: true })).toBeVisible();
  await expect(signals.locator(".ticker-item--arena")).toContainText("claude-fable-5");
  await expect(signals.locator(".ticker-item--arena")).toContainText("1507");
  await expect(signals.locator(".ticker-item--arena time")).toHaveAttribute("datetime", "2026-09-02");
  await expect(signals.locator(".ticker-item--arena time")).toHaveText("as of Sep 2, 2026");
  await expect(page.locator("body")).not.toContainText("LLM LATENCY");
});

test("SpaceX countdown advances without repeated network requests", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-05T12:00:00Z") });
  let requests = 0;
  await page.route(launchApi, (route) => {
    requests += 1;
    expect(new URL(route.request().url()).searchParams.get("lsp__id")).toBe("121");
    return route.fulfill({ json: { results: [launchPayload("2026-09-06T10:59:00Z")] } });
  });
  await page.goto("./");
  await expect(page.locator(`${primaryTicker} .launch-countdown`)).toHaveText("T-22h 59m");
  await page.clock.fastForward(120_000);
  await expect(page.locator(`${primaryTicker} .launch-countdown`)).toHaveText("T-22h 57m");
  await page.getByRole("checkbox", { name: "Show market ticker" }).uncheck();
  await page.getByRole("checkbox", { name: "Show market ticker" }).check();
  await expect(page.locator(`${primaryTicker} .launch-countdown`)).toHaveText("T-22h 57m");
  expect(requests).toBe(1);
});

test("passing a launch time does not falsely claim a liftoff", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-05T12:00:00Z") });
  await page.route(launchApi, (route) => route.fulfill({ json: { results: [launchPayload("2026-09-05T12:02:00Z")] } }));
  await page.goto("./");
  await expect(page.locator(`${primaryTicker} .launch-countdown`)).toHaveText("T-0h 02m");
  await page.clock.fastForward(180_000);
  await expect(page.locator(`${primaryTicker} .launch-countdown`)).toHaveText("Awaiting update");
});

test("tentative dates do not become precise launch countdowns", async ({ page }) => {
  await page.route(launchApi, (route) => route.fulfill({ json: {
    results: [{ ...launchPayload(), net_precision: { name: "Day" }, status: { abbrev: "TBC" } }]
  } }));
  await page.goto("./");
  await expect(page.locator(`${primaryTicker} .launch-countdown`)).toHaveText("Date tentative");
});

test("failed launch requests are backed off while the other signals stay visible", async ({ page }) => {
  let requests = 0;
  await page.route(launchApi, (route) => {
    requests += 1;
    return route.fulfill({ status: 429, json: { detail: "Request was throttled" } });
  });
  await page.goto("./");
  await expect(page.locator(`${primaryTicker} .launch-countdown`)).toHaveText("Unavailable");
  await page.getByRole("checkbox", { name: "Show market ticker" }).uncheck();
  await page.getByRole("checkbox", { name: "Show market ticker" }).check();
  await expect(page.locator(`${primaryTicker} .launch-countdown`)).toHaveText("Unavailable");
  await expect(page.locator(`${primaryTicker} .ticker-item--arena`)).toBeVisible();
  expect(requests).toBe(1);
});

test("another provider's launch is never labeled SpaceX", async ({ page }) => {
  await page.route(launchApi, (route) => route.fulfill({ json: {
    results: [{ ...launchPayload(), launch_service_provider: { id: 999 } }]
  } }));
  await page.goto("./");
  await expect(page.locator(`${primaryTicker} .launch-countdown`)).toHaveText("Unavailable");
});

for (const [label, width, height] of [
  ["desktop", 1440, 1000], ["wide-desktop", 1920, 1080],
  ["tablet", 768, 1024], ["mobile", 390, 844], ["small-mobile", 320, 740]
] as const) {
  test(`${label} layout has no clipping and keeps the footer above the ticker`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto("./");
    await expect(page.locator(".ticker-track")).toHaveAttribute("data-state", "ready");
    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: Array.from(document.querySelectorAll(".journal h1, .journal p, .journal a, .market-bar, .market-bar__toggle")).filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && (bounds.left < -1 || bounds.right > document.documentElement.clientWidth + 1);
      }).map((element) => element.textContent)
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.overflow).toEqual([]);
    const quotes = await page.locator(`${primaryTicker} .ticker-item--stock`).first().boundingBox();
    const signals = await page.locator(`${primaryTicker} .ticker-item--arena`).boundingBox();
    const bar = await page.locator(".market-bar").boundingBox();
    expect(Math.abs(quotes!.y - signals!.y)).toBeLessThan(1);
    expect(signals!.height).toBe(46);
    expect(bar!.height).toBeLessThanOrEqual(66);

    await page.locator(".market-bar__viewport").focus();
    for (const item of [
      page.locator(primaryTicker).getByText("SpaceX", { exact: true }),
      page.locator(primaryTicker).getByText("Highest ELO LLM", { exact: true }),
      page.locator(`${primaryTicker} .ticker-item--arena strong`),
      page.locator(`${primaryTicker} .ticker-item--arena time`),
    ]) {
      await item.scrollIntoViewIfNeeded();
      await expect(item).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("checkbox", { name: "Show market ticker" })).toBeInViewport({ ratio: 1 });
    }
    await page.locator(".market-bar__viewport").evaluate((element) => { element.scrollLeft = 0; });
    await page.screenshot({ path: testInfo.outputPath(`${label}.png`), fullPage: true });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = await page.locator(".site-footer").boundingBox();
    const ticker = await page.locator(".market-bar").boundingBox();
    expect(footer!.y + footer!.height).toBeLessThan(ticker!.y);
    await page.getByRole("link", { name: "Back to top", exact: true }).click();
    await expect(page.locator(".masthead")).toBeInViewport();
  });
}