import { expect, test, type Page } from "@playwright/test";

const libraryWin = '.os-win[data-app="library"]';

async function openLibrary(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com)\//, (route) => route.abort());
  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await page.locator(".os-icons .os-icon", { hasText: "Library" }).click();
  const win = page.locator(libraryWin);
  await expect(win).toHaveClass(/is-active/);
  return win;
}

test("Library groups books and podcasts on shared topic shelves with working filters", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openLibrary(page);
  await expect(win.locator(".lib-shelf h3")).toHaveText(["Markets & investing", "Founders & companies", "AI, search & chips", "Science & how to think"]);
  await expect(win.locator(".lib-card")).toHaveCount(27);
  await expect(win.getByRole("group", { name: "Format" }).locator(".lib-count")).toHaveText(["27", "11", "16"]);

  await win.getByRole("button", { name: /^Podcasts/ }).click();
  await expect(win.locator(".lib-card")).toHaveCount(16);
  await expect(win.locator(".lib-card .lib-kind")).toHaveText(Array(16).fill("Podcast"));
  await win.getByRole("group", { name: "Topic" }).getByRole("button", { name: /^AI, search & chips/ }).click();
  await expect(win.locator(".lib-card__title")).toHaveText(["Dwarkesh Podcast", "SemiAnalysis Weekly", "Semi Doped", "Hard Fork", "Search Off the Record"]);
  await win.getByRole("button", { name: /^Books/ }).click();
  await expect(win.locator(".lib-card__title")).toHaveText(["The Nvidia Way", "The Innovators"]);

  await win.getByRole("button", { name: /^All\d/ }).click();
  await win.getByRole("group", { name: "Topic" }).getByRole("button", { name: /^All topics/ }).click();
  await win.getByRole("searchbox", { name: "Search the library" }).fill("stripe founders");
  await expect(win.locator(".lib-card__title")).toHaveText(["Cheeky Pint"]);
  await win.getByRole("searchbox", { name: "Search the library" }).fill("no such title");
  await expect(win.getByText("Nothing in the library matches those filters.")).toBeVisible();
  await win.getByRole("button", { name: "Clear filters" }).click();
  await expect(win.locator(".lib-card")).toHaveCount(27);
});

test("podcast playback loads Spotify only on request and books link out to Amazon", async ({ page }) => {
  const spotify: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://open.spotify.com/")) spotify.push(request.url());
  });
  await page.route("https://open.spotify.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Spotify player</p>" }));
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openLibrary(page);

  await win.locator(".lib-card", { hasText: "Acquired" }).click();
  const detail = win.getByRole("complementary", { name: "Acquired" });
  await expect(detail).toContainText("Ben Gilbert & David Rosenthal");
  await expect(detail.getByRole("link", { name: "Open in Spotify" })).toHaveAttribute("href", "https://open.spotify.com/show/7Fj0XEuUQLUqoMZQdsLXqp");
  await expect(detail.locator("iframe")).toHaveCount(0);
  expect(spotify).toEqual([]);
  await detail.getByRole("button", { name: "Play here" }).click();
  await expect(detail.locator("iframe")).toHaveAttribute("src", "https://open.spotify.com/embed/show/7Fj0XEuUQLUqoMZQdsLXqp");
  await expect(detail.frameLocator("iframe").getByText("Spotify player")).toBeVisible();

  await win.locator(".lib-card", { hasText: "The Nvidia Way" }).click();
  const book = win.getByRole("complementary", { name: "The Nvidia Way" });
  await expect(book.getByRole("list", { name: "Topics" }).getByRole("button")).toHaveText(["Founders & companies", "AI, search & chips"]);
  const amazon = book.getByRole("link", { name: "View on Amazon" });
  await expect(amazon).toHaveAttribute("target", "_blank");
  await expect(amazon).toHaveAttribute("href", /^https:\/\/www\.amazon\.com\//);
  await expect(book.locator("iframe")).toHaveCount(0);
  await book.getByRole("list", { name: "Topics" }).getByRole("button", { name: "AI, search & chips" }).click();
  await expect(win.locator(".lib-shelf h3")).toHaveText(["AI, search & chips"]);
  await page.keyboard.press("Escape");
  await expect(win.getByRole("complementary")).toHaveCount(0);
});

test("Library fits a phone and shows details over the shelves", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com)\//, (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("./?view=os");
  await page.locator(".os-home .os-icon", { hasText: "Library" }).click();
  const win = page.locator(libraryWin);
  await win.locator(".lib-card", { hasText: "Hard Fork" }).click();
  const detail = win.getByRole("complementary", { name: "Hard Fork" });
  await expect(detail).toBeVisible();
  const box = (await detail.boundingBox())!;
  expect(box.width).toBeGreaterThan(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await detail.getByRole("button", { name: "Close details" }).click();
  await expect(win.locator(".lib-card")).toHaveCount(27);
});
