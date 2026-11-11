import { expect, test, type Page } from "@playwright/test";

const arxivWin = '.os-win[data-app="arxiv"]';

/* The stand-in arXiv Search is served by a route, so Chromium counts it as a public site and blocks its link back to
   the local test server; the real sites are both public. */
test.use({ launchOptions: { args: ["--disable-features=LocalNetworkAccessChecks"] } });
/* Lab OS and the site's own chrome: none of it may render in a frame that isn't a Lab OS window. */
const siteChrome = ".os-desktop, .os-taskbar, .market-bar, main:not(.framed-notice)";

async function blockOutside(page: Page) {
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://finnhub.io/**", (route) => route.abort());
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com|avatars\.githubusercontent\.com|s3\.tradingview\.com|datasets-server\.huggingface\.co)\//, (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
}

/* Every frame below the top reports to the top window if the site's chrome ever renders in it, even for a moment. */
async function watchNestedChrome(page: Page) {
  await page.addInitScript((selector) => {
    if (window === window.top || window.name.startsWith("labos:")) return;
    const check = () => {
      if (!document.querySelector(selector)) return;
      try {
        (window.top as unknown as { __nestedChrome?: string }).__nestedChrome = location.href;
      } catch {
        /* A cross-origin top can't be told; the test then fails on the frame's content instead. */
      }
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
  }, siteChrome);
}

/* Adds an unnamed frame showing the site, as a framed site's link back here would. */
async function addFrame(page: Page, src: string) {
  await page.evaluate((url) => {
    const frame = document.createElement("iframe");
    frame.id = "stray";
    frame.src = url;
    frame.style.cssText = "position:fixed;inset:40px;width:800px;height:600px;z-index:9999;background:#fff";
    document.body.append(frame);
  }, src);
  return page.frameLocator("#stray");
}

test("the site in an unnamed frame on this site shows a notice instead of a second Lab OS", async ({ page }) => {
  await blockOutside(page);
  await watchNestedChrome(page);
  // A plain page from this origin keeps the test light; the arXiv test below runs inside the full Lab OS.
  await page.goto("./icon-192.png");

  for (const path of ["./?view=os", "./markets", "./writing/learning-to-code-with-llms", "./leaderboards"]) {
    await page.evaluate(() => document.getElementById("stray")?.remove());
    const frame = await addFrame(page, new URL(path, page.url()).href);
    await expect(frame.getByRole("heading", { name: "You're already on Agarwal Labs" })).toBeVisible();
    const open = frame.getByRole("link", { name: "Open this page in a new tab" });
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("href", new URL(path, page.url()).href);
    await expect(frame.locator(siteChrome)).toHaveCount(0);
  }
  expect(await page.evaluate(() => (window as unknown as { __nestedChrome?: string }).__nestedChrome)).toBeUndefined();
});

test("the site framed by another origin offers to open in its own tab", async ({ page, baseURL }) => {
  await blockOutside(page);
  const site = new URL(baseURL!);
  // The same server under another host name is another origin, and still a local one the browser lets frame it.
  await page.goto(`http://localhost:${site.port}/icon-192.png`);
  const frame = await addFrame(page, site.href);

  await expect(frame.getByRole("heading", { name: "Agarwal Labs opens in its own tab" })).toBeVisible();
  const open = frame.getByRole("link", { name: "Open Agarwal Labs" });
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", "noopener");
  await expect(frame.getByRole("button", { name: "Go back" })).toHaveCount(0);
  await expect(frame.locator(siteChrome)).toHaveCount(0);
});

test("a link from the live arXiv Search back to this site puts arXiv Search back without nesting Lab OS", async ({ page, baseURL }) => {
  await blockOutside(page);
  await watchNestedChrome(page);
  const home = new URL(baseURL!).origin;
  let loads = 0;
  await page.route("https://arxiv.agarwal-labs.com/**", (route) => {
    loads += 1;
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><meta charset="utf-8"><title>arXiv Search</title></head><body>
<h1>Mock arXiv Search</h1><a id="home" href="${home}/">Agarwal Labs ↗</a>
<script>try { parent.postMessage({ type: "arxiv-search:ready" }, new URL(document.referrer).origin); } catch (error) {}</script>
</body></html>`
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await page.locator(".os-icons").getByRole("button", { name: "arXiv Search", exact: true }).click();
  const win = page.locator(arxivWin);
  await win.getByRole("tab", { name: "Try it live" }).click();
  const live = page.frameLocator(`${arxivWin} iframe.ax-live__frame`);
  await expect(live.getByRole("heading", { name: "Mock arXiv Search" })).toBeVisible();
  expect(loads).toBe(1);

  await live.getByRole("link", { name: "Agarwal Labs ↗" }).click();

  await expect(win.getByRole("status").filter({ hasText: "Agarwal Labs is already open" })).toBeVisible();
  await expect(live.getByRole("heading", { name: "Mock arXiv Search" })).toBeVisible();
  await expect(win.locator(".ax-live__cover")).toBeHidden();
  expect(loads).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { __nestedChrome?: string }).__nestedChrome)).toBeUndefined();
  await expect(page.locator(".os-desktop")).toHaveCount(1);
  await expect(page.locator(".os-taskbar")).toHaveCount(1);

  await win.getByRole("button", { name: "Reload arXiv Search" }).click();
  await expect(win.getByRole("status").filter({ hasText: "Agarwal Labs is already open" })).toHaveCount(0);
});
