import { expect, test, type Page } from "@playwright/test";

/* Chromium ignores the wheel over a frame that loaded under the inert boot screen until it repaints (#123).
   Tracing, video, and frame locators can force that repaint and hide the bug, so this file avoids them. */
test.use({ trace: "off", video: "off" });

const frame = '.os-win[data-app="search"] iframe';

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/**", (route) => route.abort());
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com|avatars\.githubusercontent\.com|s3\.tradingview\.com|datasets-server\.huggingface\.co)\//, (route) => route.abort());
});

async function expectWheelScrollsSearch(page: Page) {
  await expect(page.locator(".se-boot")).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => page.evaluate((selector) => Boolean(document.querySelector<HTMLIFrameElement>(selector)?.contentDocument?.querySelector("#se-query")), frame)).toBe(true);
  const center = await page.evaluate((selector) => {
    const rect = document.querySelector(selector)!.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, frame);
  await page.mouse.move(center.x, center.y);
  await expect.poll(async () => {
    await page.mouse.wheel(0, 200);
    return page.evaluate((selector) => document.querySelector<HTMLIFrameElement>(selector)?.contentWindow?.scrollY ?? 0, frame);
  }).toBeGreaterThan(0);
}

test("apps open after the intro so Sid Search scrolls with the wheel on a first visit and after Restart", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(page.locator(".se-boot")).toBeVisible();
  await expect(page.locator(".os-win")).toHaveCount(0);
  await expectWheelScrollsSearch(page);

  await page.locator(".os-start").click();
  await page.getByRole("dialog", { name: "Start menu" }).getByRole("button", { name: "Restart", exact: true }).click();
  await expect(page.locator(".se-boot")).toBeVisible();
  await expect(page.locator(".os-win")).toHaveCount(0);
  await expectWheelScrollsSearch(page);
});
