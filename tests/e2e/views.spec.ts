import { expect, test, type Page } from "@playwright/test";

const sectionIds = ["intro", "lab", "writing", "impact", "library", "contact"];
const alternateViews = ["search", "forward", "training", "terminal"] as const;
const bootKey = "search-view-booted-v1";

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/api/v1/quote?*", (route) => route.fulfill({ json: { c: 230.36, dp: 0.84, t: 1788552000 } }));
  await page.route("https://api.github.com/repos/sidagarwal-labs/models/commits?*", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/2.3.0/launches/upcoming/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("https://ll.thespacedevs.com/2.3.0/launches/previous/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("https://s3.tradingview.com/**", (route) => route.abort());
  await page.route("https://docs.google.com/spreadsheets/**", (route) => route.abort());
  await page.route("https://datasets-server.huggingface.co/**", (route) => route.abort());
});

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test("Lab OS is the default view and the switcher only appears on full-page homepage views", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-view", "os");
  await expect(page.locator('.os-win[data-app="search"]')).toBeVisible();
  await expect(page.locator(".view-switcher")).toHaveCount(0);

  await page.goto("./?view=journal");
  await expect(page.locator("html")).not.toHaveAttribute("data-view", /.+/);
  await expect(page.locator(".project-list .project-title").first()).toHaveText("arXiv Search");
  await expect(page.getByRole("button", { name: "View: Journal" })).toBeVisible();

  await page.goto("./robotics");
  await expect(page.locator(".view-switcher")).toHaveCount(0);
});

for (const view of alternateViews) {
  test(`?view=${view} renders every section with working contact links`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`./?view=${view}`);

    await expect(page.locator("html")).toHaveAttribute("data-view", view);
    for (const id of sectionIds) await expect(page.locator(`#${id}`)).toHaveCount(1);
    await expect(page.getByRole("heading", { name: /Sid Agarwal/ }).first()).toBeVisible();
    await expect(page.locator('a[href="mailto:sid@agarwal-labs.com"]').first()).toBeAttached();
    await expect(page.locator('a[href="https://www.linkedin.com/in/sid-agarwal-labs/"]').first()).toBeAttached();
    await expect(page.locator('a[href="https://arxiv.agarwal-labs.com/"]').first()).toBeAttached();
    await expect(page.locator(".market-bar")).toBeAttached();
    await expect(page.locator("#library").getByText("The Nvidia Way").first()).toBeAttached();
    expect(errors).toEqual([]);
  });

  test(`?view=${view} has no horizontal overflow on desktop and phones`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`./?view=${view}`);
      await expect(page.locator("#contact")).toBeAttached();
      const overflow = await horizontalOverflow(page);
      if (overflow > 0) {
        const layout = await page.evaluate(() => Array.from(document.querySelectorAll("body *")).flatMap((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.right <= innerWidth && element.scrollWidth <= element.clientWidth) return [];
          return [{
            tag: element.tagName, class: element.className, text: element.textContent?.slice(0, 100),
            right: rect.right, width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
            overflowX: getComputedStyle(element).overflowX
          }];
        }));
        console.log(`${view} overflow at ${width}px: ${JSON.stringify(layout)}`);
      }
      expect(overflow, `${view} at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("the view switcher changes views, remembers the choice, and can return to Lab OS", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=journal");
  await page.getByRole("button", { name: "View: Journal" }).click();
  await page.getByRole("button", { name: /Forward pass/ }).click();

  await expect(page).toHaveURL(/\?view=forward$/);
  await expect(page.locator("html")).toHaveAttribute("data-view", "forward");

  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-view", "forward");

  await page.getByRole("button", { name: "View: Forward pass" }).click();
  await page.getByRole("button", { name: /Journal/ }).click();
  await expect(page).toHaveURL(/\?view=journal$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-view", /.+/);

  await page.getByRole("button", { name: "View: Journal" }).click();
  await page.getByRole("button", { name: /Lab OS/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("data-view", "os");

  await page.goto("./robotics");
  await expect(page.locator("html")).not.toHaveAttribute("data-view", /.+/);
});

test("the search view boots once per session and can be skipped", async ({ page }) => {
  await page.goto("./?view=search");
  const boot = page.locator(".se-boot");
  await expect(boot).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip intro" })).toBeFocused();
  await page.getByRole("button", { name: "Skip intro" }).click();
  await expect(boot).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/se-booting/);
  await expect(page.locator("#se-query")).toBeVisible();

  await page.reload();
  await expect(page.locator("#se-query")).toBeVisible();
  await expect(boot).toHaveCount(0);

  await page.evaluate((key) => sessionStorage.removeItem(key), bootKey);
  await page.reload();
  await expect(boot).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(boot).toHaveCount(0);
});

test("the search view skips the boot intro for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=search");
  await expect(page.locator("#se-query")).toBeVisible();
  await expect(page.locator(".se-boot")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replay the boot-up intro" })).toHaveCount(0);
});

test("the search box ranks portfolio content with BM25 and explains the ranking", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=search");
  const query = page.getByLabel("Search Sid's work");
  const titles = page.locator(".se-matches .se-result h3");

  await query.fill("RAG");
  await expect(titles).toHaveText(["NVDocs RAG", "arXiv Search"]);
  await page.getByLabel("Explain ranking").check();
  await expect(page.locator(".se-matches .se-signals").first()).toContainText(/BM25 \d+\.\d{2} · matched rag/);

  await query.fill("ai buil");
  await expect(titles.first()).toHaveText("AI buildout: October 2026");
  await expect(page.locator(".se-matches .se-signals").first()).toContainText("title phrase");

  await query.fill("robotics");
  await expect(titles.first()).toContainText("FRC Team 2642");

  await query.fill("xyzzy");
  await expect(page.locator(".se-matches")).toContainText("No results");
  await page.locator(".se-matches").getByRole("button", { name: "resume" }).click();
  await expect(query).toHaveValue("resume");
  await expect(titles.first()).toHaveText("Resume (PDF)");
});

test("the search tabs jump to each section and highlight it on desktop and phones", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const tabs = [["Projects", "lab"], ["Writing", "writing"], ["About", "impact"], ["Robotics", "robotics"], ["Library", "library"], ["All", "intro"]];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("./?view=search");
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const [label, id] of tabs) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(nav.getByRole("link", { name: label, exact: true }), `${label} at ${width}px`).toHaveAttribute("aria-current", "location");
      await expect(nav).toBeInViewport();
      const top = await page.locator(`#${id}`).evaluate((element) => element.getBoundingClientRect().top);
      expect(top, `${label} at ${width}px`).toBeLessThan(260);
    }
  }
  await expect(page.locator("#impact")).toContainText("UNC Charlotte");
  await expect(page.locator("#impact")).toContainText("People also ask");
});

test("Sid Search keeps Pitt Pirates links on its Robotics section and plays matches inline", async ({ page }) => {
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Player</p>" }));
  await page.route(/^https:\/\/(i\.ytimg\.com|www\.pittpiratesrobotics\.com)\//, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=search");

  const robotics = page.locator("#robotics");
  await expect(page.locator("#impact").getByRole("link", { name: "the Pitt Pirates, FRC Team 2642", exact: true })).toHaveAttribute("href", "#robotics");
  await page.locator(".se-panel").getByRole("link", { name: "the Pitt Pirates, FRC Team 2642", exact: true }).click();
  await expect(page).toHaveURL(/\?view=search#robotics$/);
  await expect(page.getByRole("heading", { name: "Robotics", exact: true, level: 2 })).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Robotics", exact: true })).toHaveAttribute("aria-current", "location");

  const team = robotics.getByRole("article", { name: "Pitt Pirates" });
  await expect(team).toContainText("FRC Team 2642");
  await expect(team.getByRole("list", { name: "Team highlights" }).getByRole("listitem")).toHaveText([
    "6 seasons, 2013-2018", "5 official event wins", "4 FIRST Championships", "2017 captain, and a mentor"
  ]);
  /* Robot names and Championship years live in the season timeline, not the card. */
  await expect(team).not.toContainText("Ashley Whippet");
  await expect(team).not.toContainText("2014, 2016");
  await expect(team.getByRole("link", { name: "The Blue Alliance" })).toHaveAttribute("href", "https://www.thebluealliance.com/team/2642/history");

  /* The seasons are a compact timeline: one row each, under one shared The Blue Alliance source line. */
  const seasons = robotics.locator(".se-results--seasons > li");
  await expect(seasons).toHaveCount(5);
  await expect(seasons.locator(".se-season__year")).toHaveText(["2013", "2014", "2016", "2017", "2018"]);
  await expect(seasons.getByRole("link")).toHaveText(["2013 season: Ashley Whippet", "2014 season: JoJo", "2016 season: Excalibot", "2017 season: Gemini", "2018 season: Riptide"]);
  await expect(seasons.nth(3).getByRole("link")).toHaveAttribute("href", "https://www.thebluealliance.com/team/2642/2017");
  await expect(seasons.nth(0).getByRole("heading", { level: 4 })).toHaveText("2013 season: Ashley Whippet");
  await expect(seasons.nth(3).locator(".se-season__result")).toHaveText(
    "Pitt County and Raleigh district wins, the North Carolina State Championship Chairman's Award, and Raleigh's Industrial Design Award. Third in the district points standings."
  );
  await expect(seasons.nth(3).getByRole("list", { name: "2017 highlights" }).getByRole("listitem")).toHaveText(["2 event wins", "FIRST Championship", "My captain season"]);
  const shared = robotics.locator(".se-source", { hasText: "The Blue Alliance" });
  await expect(shared).toHaveCount(1);
  await expect(shared.locator(".se-source__url")).toHaveText("thebluealliance.com › team › 2642");
  const rows = await seasons.evaluateAll((items) => items.map((item) => {
    const [year, title] = [item.querySelector(".se-season__year")!, item.querySelector("a")!].map((element) => element.getBoundingClientRect());
    return { height: item.getBoundingClientRect().height, sameLine: Math.abs(year.top - title.top) < 4 && year.right < title.left };
  }));
  expect(rows.every((row) => row.sameLine), "year and robot share a line").toBe(true);
  expect(rows[0].height, "a one-line result fits one row").toBeLessThan(50);
  await expect(robotics.locator(".se-links")).toContainText("The Pickup Line (2015)");

  const images = robotics.locator(".se-image");
  await expect(images).toHaveCount(3);
  /* Desktop keeps the photos in one row of three, so the list isn't a scroll strip or a tab stop. */
  const photoTops = await images.evaluateAll((figures) => figures.map((figure) => Math.round(figure.getBoundingClientRect().top)));
  expect(new Set(photoTops).size).toBe(1);
  await expect(robotics.getByRole("list", { name: "Robotics photos" })).not.toHaveAttribute("tabindex");
  await images.last().scrollIntoViewIfNeeded();
  await expect(images.getByText("Photo unavailable")).toHaveCount(3);
  await expect(images.first().getByRole("link", { name: /^Original photo: Gemini/ })).toHaveAttribute("href", /pittpiratesrobotics\.com\/wp-content\/uploads\//);

  await expect(robotics.locator(".se-video iframe")).toHaveCount(0);
  /* The channel is part of each video's meta line; the shared The Blue Alliance line is the section's only source block. */
  await expect(robotics.locator(".se-source")).toHaveCount(1);
  await expect(robotics.locator(".se-video__meta")).toHaveText([
    "2017 Houston Championship, Roebling Qualification 14 · YouTube · Felix Giffard",
    "2017 Raleigh District, Final 3 · YouTube · Team2059Archive"
  ]);
  await expect(robotics.getByRole("link", { name: "Gemini at the World Championship" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=23Ge6Ods51A");
  /* Each match record link ends its video's snippet rather than taking a line of its own. */
  await expect(robotics.locator(".se-video .se-result__snippet").getByRole("link", { name: "Match record on The Blue Alliance" })).toHaveCount(2);
  await expect(robotics.locator(".se-video").first().getByRole("link", { name: "Match record on The Blue Alliance" })).toHaveAttribute("href", "https://www.thebluealliance.com/match/2017roe_qm14");
  await robotics.getByRole("button", { name: "Play 2017 Houston Championship, Roebling Qualification 14" }).click();
  const player = robotics.locator(".se-video").first().locator("iframe");
  await expect(player).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/23Ge6Ods51A?autoplay=1&rel=0");
  await expect(player).toHaveAttribute("title", "2017 Houston Championship, Roebling Qualification 14");
  await expect(robotics.locator(".se-video").first()).toHaveClass(/is-playing/);
  await expect(robotics.getByRole("button", { name: "Play 2017 Raleigh District, Final 3" })).toBeVisible();
  await expect(robotics.getByRole("link", { name: "2017 robot code" })).toHaveAttribute("href", "https://github.com/FRC2642/2017Robot");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "All", exact: true }).click();
  await page.getByLabel("Search Sid's work").fill("robotics");
  const result = page.locator(".se-matches .se-result__title").first();
  await expect(result).toHaveAttribute("href", "#robotics");
  await expect(page.locator(".se-matches .se-source__site").first()).toHaveText("Agarwal Labs");
  await page.getByLabel("Search Sid's work").fill("riptide");
  await expect(result).toHaveText("Pitt Pirates, FRC Team 2642");
  await result.click();
  await expect(page).toHaveURL(/\?view=search#robotics$/);
  await expect(robotics).toBeInViewport();
});

test("Sid Search's Robotics section fits a phone", async ({ page }) => {
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Player</p>" }));
  await page.route(/^https:\/\/(i\.ytimg\.com|www\.pittpiratesrobotics\.com)\//, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("./?view=search#robotics");
    await expect(page.locator("#robotics")).toBeInViewport();
    const section = await page.locator("#robotics").boundingBox();
    for (const box of [".se-team", ".se-video__player", ".se-images", ".se-links a"]) {
      for (const element of await page.locator(`#robotics ${box}`).all()) {
        const rect = await element.boundingBox();
        expect(rect!.x + rect!.width, `${box} at ${width}px`).toBeLessThanOrEqual(section!.x + section!.width + 0.5);
      }
    }
    /* Phones put each video's thumbnail beside its title instead of stacking it full width. */
    const video = await page.locator("#robotics .se-video__player").first().boundingBox();
    const title = await page.locator("#robotics .se-video h4").first().boundingBox();
    expect(video!.width).toBeLessThan(160);
    expect(title!.x).toBeGreaterThan(video!.x + video!.width);
    expect(Math.abs(title!.y - video!.y)).toBeLessThan(4);

    /* The photos become a swipe strip that scrolls inside itself and can be scrolled from the keyboard. */
    const strip = page.getByRole("list", { name: "Robotics photos" });
    await expect(strip).toHaveAttribute("tabindex", "0");
    const thumbs = await page.locator("#robotics .se-image__thumb").evaluateAll((links) => links.map((link) => link.getBoundingClientRect()).map(({ top, width }) => ({ top: Math.round(top), width })));
    expect(new Set(thumbs.map((thumb) => thumb.top)).size, `photos share a row at ${width}px`).toBe(1);
    expect(thumbs[0].width).toBeGreaterThan(section!.width * 0.6);
    expect(thumbs[0].width).toBeLessThan(section!.width - 24);
    expect(await strip.evaluate((list) => list.scrollWidth > list.clientWidth)).toBe(true);
    const scrolled = await strip.evaluate((list) => list.scrollLeft);
    await strip.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => strip.evaluate((list) => list.scrollLeft)).toBeGreaterThan(scrolled);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  }

  /* A playing match still widens to the full column. */
  const second = page.locator("#robotics .se-video").nth(1);
  await second.getByRole("button", { name: "Play 2017 Raleigh District, Final 3" }).click();
  await expect(second.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/VzhwTXsN2io?autoplay=1&rel=0");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const section = await page.locator("#robotics").boundingBox();
    const player = await second.locator(".se-video__player").boundingBox();
    expect(player!.width, `playing video at ${width}px`).toBeGreaterThan(section!.width - 1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  }
});

test("Sid Search's Library mixes books and podcasts and filters them by topic in place", async ({ page }) => {
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com)\//, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=search");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Library", exact: true }).click();
  await expect(page).toHaveURL(/\?view=search#library$/);
  await expect(page.getByRole("heading", { name: "Library", exact: true, level: 2 })).toBeInViewport();
  await expect(page.locator(".se-sitelinks").getByRole("link", { name: "Library", exact: true })).toHaveAttribute("href", "#library");
  await expect(page.getByText(/bookshelf/i)).toHaveCount(0);

  const library = page.locator("#library");
  const chips = library.getByRole("group", { name: "Library topics" }).getByRole("button");
  const items = library.locator(".se-shelf > li");
  const status = library.getByRole("status");
  await expect(chips).toHaveText([/^All\s*27$/, /^Markets & investing\s*8$/, /^Founders & companies\s*8$/, /^AI, search & chips\s*7$/, /^Science & how to think\s*5$/]);
  await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
  await expect(status).toHaveText("All topics: 11 books and 16 podcasts");
  await expect(items).toHaveCount(27);
  await expect(library.locator(".se-badge", { hasText: "Book" })).toHaveCount(11);
  await expect(library.locator(".se-badge", { hasText: "Podcast" })).toHaveCount(16);
  const shelfTops = await items.evaluateAll((cards) => cards.slice(0, 6).map((card) => Math.round(card.getBoundingClientRect().top)));
  expect(new Set(shelfTops.slice(0, 5)).size, "five covers per row on desktop").toBe(1);
  expect(shelfTops[5]).toBeGreaterThan(shelfTops[0]);

  const nvidia = items.filter({ hasText: "The Nvidia Way" });
  await expect(nvidia.getByRole("link")).toHaveAttribute("href", /^https:\/\/www\.amazon\.com\//);
  await expect(nvidia).toContainText("Tae Kim");
  const acquired = items.filter({ hasText: "Acquired" });
  await expect(acquired.getByRole("link")).toHaveAttribute("href", "https://open.spotify.com/show/7Fj0XEuUQLUqoMZQdsLXqp");
  await expect(acquired.locator(".se-badge")).toHaveText("Podcast");
  await expect(acquired).toContainText("Ben Gilbert & David Rosenthal");
  /* The kind badge sits on the cover's corner, so the title follows the cover directly. */
  const [art, badge, title] = await Promise.all([".se-art", ".se-badge", ".se-shelf__title"].map((selector) => acquired.locator(selector).boundingBox()));
  expect(badge!.x).toBeGreaterThanOrEqual(art!.x);
  expect(badge!.y).toBeGreaterThanOrEqual(art!.y);
  expect(badge!.x + badge!.width).toBeLessThanOrEqual(art!.x + art!.width);
  expect(badge!.y + badge!.height).toBeLessThanOrEqual(art!.y + art!.height / 3);
  expect(title!.y - (art!.y + art!.height)).toBeLessThan(12);

  const ai = library.getByRole("button", { name: /^AI, search & chips/ });
  await ai.click();
  await expect(ai).toHaveAttribute("aria-pressed", "true");
  await expect(chips.first()).toHaveAttribute("aria-pressed", "false");
  await expect(items).toHaveCount(7);
  await expect(status).toContainText("AI, search & chips: 2 books and 5 podcasts");
  await expect(nvidia).toHaveCount(1);
  await expect(acquired).toHaveCount(0);

  await library.getByRole("button", { name: /^Science & how to think/ }).click();
  await expect(items).toHaveCount(5);
  await expect(status).toContainText("Science & how to think: 3 books and 2 podcasts");
  await expect(ai).toHaveAttribute("aria-pressed", "false");

  await chips.first().click();
  await expect(items).toHaveCount(27);
  await expect(page).toHaveURL(/\?view=search#library$/);

  /* Outside Lab OS the Library app is a page away. */
  await library.getByRole("link", { name: "Open Lab OS" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-view", "os");
});

test("Sid Search finds podcasts by kind and by show name", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=search");
  const query = page.getByLabel("Search Sid's work");
  const results = page.locator(".se-matches .se-result");

  await query.fill("podcast");
  await expect(page.locator(".se-matches .se-stats")).toHaveText(/^16 results/);
  await expect(results).toHaveCount(8);
  await expect(results.locator(".se-kind")).toHaveText(Array(8).fill("Podcast"));

  await query.fill("Acquired");
  await expect(results.first().locator("h3")).toHaveText("Acquired");
  await expect(results.first().locator(".se-kind")).toHaveText("Podcast");
  await expect(results.first().locator(".se-result__title")).toHaveAttribute("href", "https://open.spotify.com/show/7Fj0XEuUQLUqoMZQdsLXqp");
});

test("Sid Search's Library fits a phone", async ({ page }) => {
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com)\//, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("./?view=search#library");
    await expect(page.locator("#library")).toBeInViewport();
    const section = await page.locator("#library").boundingBox();
    for (const box of [".se-filters", ".se-shelf > li", ".se-section__head .se-button"]) {
      for (const element of await page.locator(`#library ${box}`).all()) {
        const rect = await element.boundingBox();
        expect(rect!.x + rect!.width, `${box} at ${width}px`).toBeLessThanOrEqual(section!.x + section!.width + 0.5);
      }
    }
    const tops = await page.locator("#library .se-shelf > li").evaluateAll((cards) => cards.slice(0, 4).map((card) => Math.round(card.getBoundingClientRect().top)));
    expect(new Set(tops.slice(0, 3)).size, `three covers per row at ${width}px`).toBe(1);
    expect(tops[3]).toBeGreaterThan(tops[0]);

    /* The topic chips stay on one row and scroll inside it; picking a chip still filters. */
    const filters = page.getByRole("group", { name: "Library topics" });
    const chips = filters.getByRole("button");
    const chipTops = await chips.evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
    expect(new Set(chipTops).size, `chips share a row at ${width}px`).toBe(1);
    expect(await filters.evaluate((group) => group.scrollWidth > group.clientWidth)).toBe(true);
    const science = filters.getByRole("button", { name: /^Science & how to think/ });
    await science.click();
    await expect(science).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#library .se-shelf > li")).toHaveCount(5);
    await expect(science).toBeInViewport({ ratio: 0.9 });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await chips.first().click();
    await expect(page.locator("#library .se-shelf > li")).toHaveCount(27);
  }
});

test("Sid Search's Writing section leaves no empty essay list and swipes its featured notes on phones", async ({ page }) => {
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=search#writing");
  const writing = page.locator("#writing");
  const notes = page.getByRole("list", { name: "Featured research notes" });
  await expect(notes.getByRole("link")).toHaveCount(3);
  await expect(notes).not.toHaveAttribute("tabindex");

  /* The essay list only renders when there are essays, so it can't leave a gap above the Insights line. */
  const essays = await writing.locator('a[href^="/writing/"]:not(details a)').count();
  await expect(writing.locator(".se-results--essays")).toHaveCount(essays > 0 ? 1 : 0);
  if (essays === 0) {
    const gap = await writing.evaluate((section) => section.querySelector(".se-insights")!.getBoundingClientRect().top - section.querySelector(".se-stories")!.getBoundingClientRect().bottom);
    expect(gap).toBeLessThanOrEqual(25);
  }

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(notes).toHaveAttribute("tabindex", "0");
    const section = await writing.boundingBox();
    const strip = await notes.boundingBox();
    expect(strip!.x + strip!.width, `notes strip at ${width}px`).toBeLessThanOrEqual(section!.x + section!.width + 0.5);
    const cards = await notes.getByRole("link").evaluateAll((links) => links.map((link) => link.getBoundingClientRect()).map(({ top, width }) => ({ top: Math.round(top), width })));
    expect(new Set(cards.map((card) => card.top)).size, `notes share a row at ${width}px`).toBe(1);
    expect(cards[0].width).toBeLessThan(section!.width - 24);
    expect(await notes.evaluate((list) => list.scrollWidth > list.clientWidth)).toBe(true);
    await notes.evaluate((list) => { list.scrollLeft = 0; });
    await notes.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => notes.evaluate((list) => list.scrollLeft)).toBeGreaterThan(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  }
});

for (const embedded of [false, true]) {
  test(`Forward pass keeps Background selected ${embedded ? "inside Lab OS" : "full page"}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1920, height: 1440 });
    await page.goto(embedded ? "./?view=os" : "./?view=forward");
    if (embedded) {
      await page.locator(".os-icons .os-icon", { hasText: "Forward pass" }).click();
      await page.getByRole("button", { name: "Maximize Forward pass", exact: true }).click();
    }

    const view = embedded ? page.frameLocator('.os-win[data-app="forward"] iframe') : page;
    const nav = view.getByRole("navigation", { name: "Sections" });
    const background = nav.locator('a[href="#impact"]');
    const books = nav.locator('a[href="#library"]');

    for (const viewport of [{ width: 1920, height: 1440 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await background.click();
      await expect(background).toHaveAttribute("aria-current", "true");
      await expect(books).not.toHaveAttribute("aria-current", "true");
      await expect(view.getByRole("heading", { name: "A little background" })).toBeInViewport();
      const top = await view.locator("#impact").evaluate((section) => section.getBoundingClientRect().top);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThan(100);

      await view.locator("#library").evaluate((section) => section.scrollIntoView());
      await expect(books).toHaveAttribute("aria-current", "true");
      await background.click();
      await expect(background).toHaveAttribute("aria-current", "true");
    }
  });
}

test("Forward pass redraws actual learned attention and restores its seeded model", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=forward");
  await page.locator(".fp-token", { hasText: "retrieval" }).click();
  await expect(page.locator(".fp-token[data-masked]")).toHaveCount(2);
  const weights = () => page.locator(".fp-matrix__cell").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("style")));
  const initial = await weights();
  const predictions = await page.locator(".fp-predictions").innerText();
  await page.getByRole("button", { name: "Train 12 epochs", exact: true }).click();
  await expect(page.locator(".tiny-model__status")).toContainText("epoch 12/24", { timeout: 20_000 });
  expect(await weights()).not.toEqual(initial);
  await expect(page.locator(".fp-predictions")).not.toHaveText(predictions);
  await expect(page.locator(".fp-caption__note").first()).toContainText("Learned embeddings");
  await page.getByRole("button", { name: "Reset model" }).click();
  await expect(page.locator(".tiny-model__status")).toContainText("epoch 0/24");
  expect(await weights()).toEqual(initial);
});

test("Forward pass switches attention heads and loads the pretrained model only on request", async ({ page }) => {
  const modelRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/models/stories260K/")) modelRequests.push(request.url()); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=forward");
  await page.locator(".fp-token", { hasText: "retrieval" }).click();
  const heads = page.getByRole("group", { name: "Model attention head" });
  await expect(heads.getByRole("button", { name: "Average" })).toHaveAttribute("aria-pressed", "true");
  const cells = () => page.locator(".fp-matrix__cell").evaluateAll((items) => items.map((item) => item.getAttribute("style")));
  const average = await cells();
  await heads.getByRole("button", { name: "Head 1" }).click();
  await expect(page.locator(".fp-caption").first()).toContainText("in head 1");
  const first = await cells();
  await heads.getByRole("button", { name: "Head 2" }).click();
  expect(await cells()).not.toEqual(first);
  expect(first).not.toEqual(average);
  await expect(page.locator(".fp-token[data-strong]")).toHaveCount(1);

  await page.locator("#pretrained").scrollIntoViewIfNeeded();
  expect(modelRequests).toEqual([]);
  await page.getByRole("button", { name: /Load stories260K/ }).click();
  await expect(page.locator("#pretrained .pt-chip").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#pretrained .pt-probs li")).not.toHaveCount(0);
  expect(modelRequests.some((url) => url.endsWith("stories260K.bin"))).toBe(true);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test("the terminal view runs commands and keeps the ticker on top", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=terminal");
  const ticker = await page.locator(".market-bar").boundingBox();
  expect(ticker?.y).toBeLessThan(10);

  await page.getByLabel("Command", { exact: true }).fill("lib");
  await page.keyboard.press("Enter");
  await expect(page.locator("#library")).toBeInViewport();

  await page.getByLabel("Command", { exact: true }).fill("nope");
  await page.keyboard.press("Enter");
  await expect(page.locator("#tm-command-status")).toContainText(/HELP/);
});

test("terminal shortcuts keep accessible labels and scroll within the bar on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=terminal");
  const contact = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "5 MSG Contact", exact: true });
  await contact.focus();
  await expect(contact).toBeFocused();
  await expect(contact).toBeInViewport({ ratio: 1 });
  expect(await page.locator(".tm-keys ul").evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.keyboard.press("Enter");
  await expect(page.locator("#contact")).toBeInViewport();
});

test("notebook navigation does not fake training; explicit training produces measured loss and resets", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=training");
  for (const id of sectionIds) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator("#contact .tr-prompt").first()).toHaveText("In [6]:");
  await expect(page.locator(".tiny-model__status")).toContainText("epoch 0/24");
  await expect(page.getByRole("link", { name: "Download resume (PDF)" })).toHaveAttribute("href", /\.pdf$/);
  await page.getByRole("button", { name: "Train 12 epochs", exact: true }).click();
  await expect(page.locator(".tiny-model__status")).toContainText("epoch 12/24", { timeout: 20_000 });
  await expect(page.locator(".tiny-model__status")).toContainText("Paused");
  await expect(page.getByRole("img", { name: /Measured loss/ }).first()).toBeAttached();
  await page.getByRole("button", { name: "Train 12 more epochs" }).click();
  await expect(page.locator(".tiny-model__status")).toContainText("Complete", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Train 12 more epochs" })).toBeDisabled();
  await page.getByRole("button", { name: "Reset model" }).click();
  await expect(page.locator(".tiny-model__status")).toContainText("epoch 0/24");
});

const searchWin = '.os-win[data-app="search"]';

test("Lab OS runs Sid Search in a window with its own address bar and history", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");

  const frame = page.frameLocator(`${searchWin} iframe`);
  await expect(frame.locator("#se-query")).toHaveValue("Sid Agarwal");
  for (const id of sectionIds) await expect(frame.locator(`#${id}`)).toHaveCount(1);
  /* The OS supplies taskbar widgets and menus without duplicating them in the app. */
  await expect(frame.locator(".market-bar, .view-switcher")).toHaveCount(0);
  await expect(page.locator(".market-bar")).toHaveCount(0);
  await expect(page.locator(".os-taskbar .os-signals")).toBeVisible();

  const address = page.locator(`${searchWin} .os-address__text`);
  await expect(address).toHaveText("agarwal-labs.com/search?q=Sid+Agarwal");
  const historyLength = await page.evaluate(() => history.length);
  await frame.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "About", exact: true }).click();
  await expect(address).toHaveText(/#impact$/);
  await expect(frame.locator("#impact")).toBeInViewport();
  await frame.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Library", exact: true }).click();
  await expect(address).toHaveText(/#library$/);

  await page.locator(searchWin).getByRole("button", { name: "Back" }).click();
  await expect(address).toHaveText(/#impact$/);
  await page.locator(searchWin).getByRole("button", { name: "Forward" }).click();
  await expect(address).toHaveText(/#library$/);
  /* Window navigation never adds entries to the tab's own history. */
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  await frame.locator('a[href$=".pdf"]').first().click();
  await expect(page.locator('.os-win[data-app="resume"]')).toBeVisible();
  await expect(page.locator('.os-win[data-app="resume"]')).toHaveClass(/is-active/);
  expect(errors).toEqual([]);
});

test("Lab OS deep links open Sid Search at the linked section", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./#writing");
  await expect(page.locator(`${searchWin} .os-address__text`)).toHaveText(/#writing$/);
  await expect(page.frameLocator(`${searchWin} iframe`).locator("#writing")).toBeInViewport();
});

test("Lab OS windows open, focus, minimize, maximize, and close", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(page.locator(searchWin)).toBeVisible();

  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await menu.getByRole("button", { name: "Other designs", exact: true }).click();
  await menu.getByRole("list", { name: "Other designs", exact: true }).getByRole("button", { name: "Journal", exact: true }).click();
  const journal = page.locator('.os-win[data-app="journal"]');
  await expect(journal).toHaveClass(/is-active/);
  await expect(page.frameLocator('.os-win[data-app="journal"] iframe').getByRole("heading", { name: "Sid Agarwal", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Minimize Journal" }).click();
  await expect(journal).toHaveClass(/is-minimized/);
  await expect(page.locator(searchWin)).toHaveClass(/is-active/);
  await page.locator(".os-task", { hasText: "Journal" }).click();
  await expect(journal).not.toHaveClass(/is-minimized/);
  await expect(journal).toHaveClass(/is-active/);

  await page.getByRole("button", { name: "Maximize Journal" }).click();
  const desk = await page.locator(".os-desktop").boundingBox();
  const box = await journal.boundingBox();
  expect(box?.width).toBe(desk?.width);
  await page.getByRole("button", { name: "Restore Journal" }).click();
  expect((await journal.boundingBox())?.width).toBeLessThan(desk?.width ?? 0);

  await page.getByRole("button", { name: "Close Journal" }).click();
  await expect(journal).toHaveCount(0);
  await expect(page.locator(".os-task", { hasText: "Journal" })).toHaveCount(0);
});

test("Lab OS Settings switches styles and full-page views", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");

  await page.getByRole("button", { name: "Open Settings" }).click();
  const settings = page.locator('.os-win[data-app="settings"]');
  await settings.getByRole("radio", { name: "Retro", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-os-style", "retro");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-os-style", "retro");
  await expect(page.locator(".os-start")).toContainText("Start");

  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".os-start")).toBeFocused();

  await page.getByRole("button", { name: "Open Settings" }).click();
  await settings.getByRole("list", { name: "Full-page views" }).getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page).toHaveURL(/\?view=journal$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-view", /.+/);
  await expect(page.locator("html")).not.toHaveAttribute("data-os-style", /.+/);
});

test("Lab OS games are playable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await page.locator(".os-icons .os-icon", { hasText: "Games" }).click();
  const folder = page.locator(".os-folder");

  await folder.locator(".os-icon", { hasText: "Mines" }).click();
  const cells = page.locator(".mines__cell");
  await expect(cells).toHaveCount(81);
  await expect(cells.nth(40)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(cells.nth(41)).toBeFocused();
  await page.keyboard.press("f");
  await expect(cells.nth(41)).toHaveAttribute("aria-label", /flag/i);
  await cells.nth(40).click();
  expect(await page.locator(".mines__cell[data-open]").count()).toBeGreaterThan(1);

  await page.locator(".os-task", { hasText: "Games" }).click();
  await folder.locator(".os-icon", { hasText: "Rank It" }).click();
  const firstResult = await page.locator(".rankit__doc").first().getAttribute("data-doc");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".rankit__doc").nth(1)).toHaveAttribute("data-doc", firstResult!);
  await page.getByRole("button", { name: "Submit ranking" }).click();
  await expect(page.locator(".rankit__score")).toContainText(/nDCG@5 [01]\.\d{3}/);

  await page.locator(".os-task", { hasText: "Games" }).click();
  await folder.locator(".os-icon", { hasText: "Next Token" }).click();
  const choices = page.getByRole("group", { name: "Next token choices" }).getByRole("button");
  await expect(choices.first()).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(choices.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".nexttoken__bar")).not.toHaveCount(0);

  await page.locator(".os-task", { hasText: "Games" }).click();
  await folder.locator(".os-icon", { hasText: "Snake" }).click();
  await expect(page.locator(".snake canvas")).toBeVisible();
  const snake = page.locator(".snake");
  await snake.getByRole("button", { name: "Start", exact: true }).last().click();
  await expect(snake).toBeFocused();
  await page.keyboard.press("Space");
  await expect(snake).toHaveAttribute("data-status", "paused");
  await page.keyboard.press("ArrowUp");
  await expect(snake).toHaveAttribute("data-status", "running");
  await page.getByRole("button", { name: "Minimize Snake", exact: true }).click();
  await expect(snake).toHaveAttribute("data-status", "paused");
  await page.locator(".os-task", { hasText: "Snake" }).click();
  await expect(snake).toBeFocused();

  await page.locator(".os-task", { hasText: "Games" }).click();
  await folder.locator(".os-icon", { hasText: "Blocks" }).click();
  const blocks = page.locator(".blocks");
  await blocks.getByRole("button", { name: "Start", exact: true }).last().click();
  await expect(blocks).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".blocks__grid")).toHaveAttribute("aria-label", /column 3,/);
  await page.keyboard.press("Space");
  await expect(blocks.locator(".game__hud b").first()).not.toHaveText("0");
  await page.keyboard.press("p");
  await expect(blocks).toHaveAttribute("data-status", "paused");
  await page.getByRole("button", { name: "Minimize Blocks", exact: true }).click();
  await page.locator(".os-task", { hasText: "Blocks" }).click();
  await expect(blocks).toBeFocused();
  await blocks.getByRole("button", { name: "Resume", exact: true }).last().click();
  await blocks.getByRole("button", { name: "Move left", exact: true }).click();
  await expect(page.locator(".blocks__grid")).toHaveAttribute("aria-label", /column 3,/);
  await expect(blocks).toBeFocused();
  expect(errors).toEqual([]);
});

test("Lab OS on phones starts on a home screen and opens apps full screen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("./");
    await expect(page.locator(".os-home")).toBeVisible();
    await expect(page.locator(".os-win")).toHaveCount(0);
    await expect(page.locator(".os-widget").getByRole("link", { name: "Resume" })).toHaveAttribute("href", /\.pdf$/);
    expect(await horizontalOverflow(page), `home at ${width}px`).toBeLessThanOrEqual(0);

    await page.locator(".os-home__grid .os-icon", { hasText: "Sid Search" }).click();
    const win = page.locator(searchWin);
    await expect(win).toBeVisible();
    expect((await win.boundingBox())?.width).toBe(width);
    await expect(page.frameLocator(`${searchWin} iframe`).locator("#se-query")).toBeVisible();
    expect(await horizontalOverflow(page), `search at ${width}px`).toBeLessThanOrEqual(0);

    await win.getByRole("button", { name: "Home" }).click();
    await expect(win).toHaveClass(/is-minimized/);
    await expect(page.locator(".os-home")).toBeVisible();
  }
});

for (const style of ["modern", "retro"]) {
  test(`Lab OS ${style} has a usable taskbar, calendar, live-data apps, and show-desktop toggle`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install({ time: new Date("2026-03-15T12:34:00Z") });
    await page.goto(`./?view=os&style=${style}`);
    const taskbar = page.locator(".os-taskbar");
    const clock = page.getByRole("button", { name: "Date and calendar" });
    await expect(clock.locator("time span")).toBeVisible();
    await page.clock.fastForward(60_000);
    await expect(clock.locator("time")).toHaveAttribute("datetime", /^2026-03-15T12:35:/);
    const bar = await taskbar.boundingBox();
    expect(bar!.y + bar!.height).toBe(900);
    await clock.click();
    const calendar = page.getByRole("dialog", { name: "Calendar", exact: true });
    await expect(calendar).toBeVisible();
    await expect(calendar.locator('[aria-current="date"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(calendar).toHaveCount(0);
    await expect(clock).toBeFocused();
    await clock.click();
    await page.frameLocator(`${searchWin} iframe`).getByLabel("Search Sid's work").click();
    await expect(calendar).toHaveCount(0);

    /* The taskbar widgets open full pages that also work outside the OS. */
    const liveApps = [
      { button: "Open Markets", app: "markets", heading: "Markets" },
      { button: "Open Launch Tracker", app: "launches", heading: "SpaceX launch tracker" },
      { button: "Open AI Leaderboards", app: "leaderboards", heading: "AI leaderboards" }
    ];
    for (const { button, app, heading } of liveApps) {
      await page.getByRole("button", { name: button }).click();
      await expect(page.locator(`.os-win[data-app="${app}"] .os-address__text`)).toHaveText(`agarwal-labs.com/${app}`);
      const frame = page.frameLocator(`.os-win[data-app="${app}"] iframe`);
      await expect(frame.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(frame.locator(".market-bar")).toHaveCount(0);
    }
    const appFrame = (app: string) => page.frameLocator(`.os-win[data-app="${app}"] iframe`);
    await expect(appFrame("markets").locator(".mk-status")).toHaveAttribute("data-source", "snapshot");
    await expect(appFrame("markets").getByRole("heading", { name: "Chips", level: 2 })).toBeVisible();
    await expect(appFrame("launches").getByText("No SpaceX launches are on the schedule right now.")).toBeVisible();
    await expect(appFrame("leaderboards").getByText(/^Saved snapshot, published /)).toBeVisible();
    await page.getByRole("button", { name: "Open Markets" }).click();
    await expect(page.locator('.os-win[data-app="markets"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Show desktop", exact: true }).click();
    await expect(page.locator(".os-win:not(.is-minimized)")).toHaveCount(0);
    await page.getByRole("button", { name: "Restore windows", exact: true }).click();
    await expect(page.locator(".os-win:not(.is-minimized)")).toHaveCount(4);
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(clock.locator("time span")).toBeInViewport();
    await expect(page.locator(".os-start")).toBeInViewport();
    expect(await horizontalOverflow(page)).toBe(0);
    await page.context().setOffline(true);
    await expect(taskbar.getByRole("img", { name: "Browser offline" })).toBeVisible();
    await page.context().setOffline(false);
    await expect(taskbar.getByRole("img", { name: "Browser online" })).toBeVisible();
  });
}

test("desktop icons drag without opening, persist, move with the keyboard, and can be arranged", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  const icon = page.locator(".os-icons .os-icon", { hasText: "Forward pass" });
  const before = (await icon.boundingBox())!;
  await page.mouse.move(before.x + 40, before.y + 35);
  await page.mouse.down();
  await page.mouse.move(before.x + 224, before.y + 35, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.os-win[data-app="forward"]')).toHaveCount(0);
  expect((await icon.boundingBox())!.x).toBe(before.x + 184);
  await page.keyboard.press("Shift+ArrowDown");
  expect((await icon.boundingBox())!.y).toBe(before.y + 92);
  await page.reload();
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  expect((await icon.boundingBox())!.x).toBe(before.x + 184);
  expect((await icon.boundingBox())!.y).toBe(before.y + 92);
  await page.getByRole("button", { name: "Open Settings" }).click();
  await page.locator('.os-win[data-app="settings"]').getByRole("button", { name: "Arrange icons", exact: true }).click();
  /* Arranging resets positions in an effect after the click; the status appears in the same render. */
  await expect(page.locator(".os-desktop-notice")).toHaveText("Icons arranged.");
  await page.getByRole("button", { name: "Close Settings" }).click();
  expect((await icon.boundingBox())!.x).toBe(before.x);
  expect((await icon.boundingBox())!.y).toBe(before.y);
  await icon.focus();
  await page.keyboard.press("Shift+ArrowUp");
  expect((await icon.boundingBox())!.y).toBe(before.y - 92);
  expect((await page.locator(".os-icons .os-icon", { hasText: "Sid Search" }).boundingBox())!.y).toBe(before.y);
  await page.keyboard.press("Shift+ArrowRight");
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator(".os-home")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(icon).toBeVisible();
  expect((await icon.boundingBox())!.x).toBe(before.x + 92);
  expect((await icon.boundingBox())!.y).toBe(before.y - 92);
  await icon.click();
  await expect(page.locator('.os-win[data-app="forward"]')).toBeVisible();
});

test("windows move and resize from all eight edges and corners, enforcing minimum sizes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("./?view=os");
  await page.locator(".os-icons .os-icon", { hasText: "README.txt" }).click();
  const win = page.locator('.os-win[data-app="readme"]');
  const start = (await win.boundingBox())!;
  await page.mouse.move(start.x + 120, start.y + 18);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 28, { steps: 5 });
  await page.mouse.up();
  expect((await win.boundingBox())!.x).toBe(start.x - 80);
  expect((await win.boundingBox())!.y).toBe(start.y + 10);
  for (const direction of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    const before = (await win.boundingBox())!;
    const handle = (await win.locator(`.os-win__grip--${direction}`).boundingBox())!;
    const dx = direction.includes("w") ? -16 : direction.includes("e") ? 16 : 0;
    const dy = direction.includes("n") ? -16 : direction.includes("s") ? 16 : 0;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + dx, handle.y + handle.height / 2 + dy, { steps: 4 });
    await page.mouse.up();
    const after = (await win.boundingBox())!;
    expect(after.width, direction).toBe(before.width + Math.abs(dx));
    expect(after.height, direction).toBe(before.height + Math.abs(dy));
    expect(after.x, direction).toBe(before.x + Math.min(dx, 0));
    expect(after.y, direction).toBe(before.y + Math.min(dy, 0));
  }
  const end = (await win.boundingBox())!;
  await page.mouse.move(end.x + end.width - 7, end.y + end.height - 7);
  await page.mouse.down();
  await page.mouse.move(end.x + 200, end.y + 160, { steps: 5 });
  await page.mouse.up();
  expect((await win.boundingBox())!.width).toBe(300);
  expect((await win.boundingBox())!.height).toBe(220);
  await expect(win).toContainText("browser-based desktop simulation");
});

test("Start search and restart use the real desktop rather than a different three-icon scene", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Skip intro" }).click();
  const labels = await page.locator(".os-icons .os-icon__label").allTextContents();
  await page.locator(".os-start").click();
  const search = page.getByRole("searchbox", { name: "Search apps" });
  await expect(search).toBeFocused();
  await search.fill("no-such-app");
  await expect(page.getByRole("status")).toContainText("No apps match this search.");
  await search.fill("journal");
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await menu.getByRole("list", { name: "Search results", exact: true }).getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.locator('.os-win[data-app="journal"]')).toBeVisible();
  await page.clock.install();
  await page.locator(".os-start").click();
  await menu.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(page.locator(".se-boot")).toBeVisible();
  for (const elapsed of [450, 1000, 1000]) {
    await page.clock.runFor(elapsed);
    await expect(page.locator(".se-boot__desktop")).toHaveCount(0);
  }
  await expect(page.locator(".se-boot")).toHaveCount(0);
  await expect(page.locator(".os-icons .os-icon__label")).toHaveText(labels);
  await expect(page.locator(".os-win")).toHaveCount(1);
  await expect(page.locator(searchWin)).toBeVisible();
});

for (const style of ["modern", "retro"]) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 800, height: 520 }]) {
    test(`desktop groups fit ${viewport.width}x${viewport.height} in ${style} style`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(viewport);
      await page.goto(`./?view=os&style=${style}`);
      await expect(page.locator(searchWin)).toBeVisible();
      const search = (await page.locator(searchWin).boundingBox())!;
      const desk = (await page.locator(".os-desktop").boundingBox())!;
      await page.getByRole("button", { name: "Show desktop", exact: true }).click();
      const rows = [["Sid Search", "Projects", "arXiv Search", "Library", "GitHub"], ["Forward pass", "Other designs"], ["Games", "Markets", "Launches", "AI leaderboards"]];
      const labels = [...rows.flat(), "Resume.pdf", "README.txt"];
      await expect(page.locator(".os-icons .os-icon__label")).toHaveText(labels);
      const boxes = await page.locator(".os-icons > li").evaluateAll((icons) => icons.map((icon) => {
        const { x, y, width, height } = icon.getBoundingClientRect();
        return { x, y, width, height };
      }));
      const expected = [
        ...rows.flatMap((items, row) => items.map((_, col) => ({ col, row }))),
        ...[0, 1].map((col) => ({ col, row: Math.floor((desk.height - 16) / 92) - 1 }))
      ];
      expected.forEach(({ col, row }, index) => {
        expect(boxes[index].x, labels[index]).toBe(desk.x + 8 + col * 92);
        expect(boxes[index].y, labels[index]).toBe(desk.y + 8 + row * 92);
        expect(boxes[index].width).toBe(92);
        expect(boxes[index].height).toBe(92);
        expect(boxes[index].x + boxes[index].width).toBeLessThanOrEqual(desk.x + desk.width - 8);
        expect(boxes[index].y + boxes[index].height).toBeLessThanOrEqual(desk.y + desk.height - 8);
      });
      expect(new Set(boxes.map(({ x, y }) => `${x},${y}`)).size).toBe(labels.length);
      if (viewport.width >= 1280) {
        const iconsRight = Math.max(...boxes.map(({ x, width }) => x + width));
        expect(search.x).toBeGreaterThanOrEqual(iconsRight + 12);
        expect(search.width).toBeGreaterThanOrEqual(640);
      }
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test(`Other designs and Games expose their own apps in ${style} style`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`./?view=os&style=${style}`);
    await page.locator(".os-icons .os-icon", { hasText: "Other designs" }).click();
    const folder = page.getByRole("list", { name: "Other designs apps", exact: true });
    const designs = [{ id: "training", title: "Training run" }, { id: "terminal", title: "Terminal" }, { id: "journal", title: "Journal" }];
    await expect(folder.locator(".os-icon__label")).toHaveText(designs.map(({ title }) => title));
    for (const { id, title } of designs) {
      await folder.locator(".os-icon", { hasText: title }).click();
      const win = page.locator(`.os-win[data-app="${id}"]`);
      await expect(win).toHaveClass(/is-active/);
      const frame = page.frameLocator(`.os-win[data-app="${id}"] iframe`);
      await expect(frame.getByRole("heading", { name: /Sid Agarwal/ }).first()).toBeVisible();
      const html = frame.locator("html");
      if (id === "journal") await expect(html).not.toHaveAttribute("data-view", /.+/);
      else await expect(html).toHaveAttribute("data-view", id);
      await page.getByRole("button", { name: `Close ${title}`, exact: true }).click();
    }
    await page.locator(".os-icons .os-icon", { hasText: "Games" }).click();
    await expect(page.getByRole("list", { name: "Games apps", exact: true }).locator(".os-icon__label"))
      .toHaveText(["Snake", "Mines", "Blocks", "Rank It", "Next Token"]);
    await page.locator(".os-start").click();
    const menu = page.getByRole("dialog", { name: "Start menu" });
    await menu.getByRole("button", { name: "Other designs", exact: true }).click();
    const menuDesigns = menu.getByRole("list", { name: "Other designs", exact: true });
    await expect(menuDesigns.getByRole("button")).toHaveText(designs.map(({ title }) => title));
    expect(errors).toEqual([]);
  });
}

test("the grouped layout replaces v1 once and preserves subsequent manual positions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("lab-os-icons-v1", JSON.stringify({ search: { col: 6, row: 6 }, games: { col: 5, row: 5 } }));
  });
  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  const search = page.locator(".os-icons .os-icon", { hasText: "Sid Search" });
  const games = page.locator(".os-icons .os-icon", { hasText: "Games" });
  expect((await search.boundingBox())!.x).toBe(8);
  expect((await search.boundingBox())!.y).toBe(8);
  const before = (await games.boundingBox())!;
  expect(before.x).toBe(8);
  expect(before.y).toBe(192);
  await games.focus();
  await page.keyboard.press("Shift+ArrowRight");
  expect((await games.boundingBox())!.x).toBe(before.x + 92);
  await page.reload();
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  expect((await games.boundingBox())!.x).toBe(before.x + 92);
  expect((await games.boundingBox())!.y).toBe(before.y);
  await page.goto("./?view=os&style=retro");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  expect((await games.boundingBox())!.x).toBe(before.x + 92);
  expect((await games.boundingBox())!.y).toBe(before.y);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("lab-os-icons-v2") ?? "{}").games)).toEqual({ col: 1, row: 2 });
});
