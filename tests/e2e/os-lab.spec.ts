import { expect, test, type Page } from "@playwright/test";

/* OS Lab (public/os-lab/) runs v86 from jsDelivr. These tests never download the emulator unless OS_LAB_BOOT is set. */
const cdn = "https://cdn.jsdelivr.net/**";

function countCdnRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://cdn.jsdelivr.net/")) requests.push(request.url());
  });
  return requests;
}

async function blockThirdParties(page: Page) {
  await page.route("https://finnhub.io/api/v1/**", (route) => route.fulfill({ json: { c: 230.36, dp: 0.84, t: 1788552000 } }));
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("https://s3.tradingview.com/**", (route) => route.abort());
  await page.route("https://datasets-server.huggingface.co/**", (route) => route.abort());
}

const controlled = (page: Page) => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);

/* coi-serviceworker reloads the page when it registers or unregisters, which can interrupt an evaluate. */
const settled = <T>(page: Page, fn: () => T | Promise<T>, fallback: T) => () => page.evaluate(fn).catch(() => fallback);

test.describe("OS Lab", () => {
  test.beforeEach(async ({ page }) => {
    await blockThirdParties(page);
    if (!process.env.OS_LAB_BOOT) await page.route(cdn, (route) => route.abort());
  });

  test("waits for Boot and shows what it will download", async ({ page }) => {
    const requests = countCdnRequests(page);
    await page.goto("./os-lab/");
    await expect(page.getByRole("heading", { name: "OS Lab" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Boot Linux · \d+(\.\d)? MB download$/ })).toBeEnabled();
    await expect(page.getByRole("status")).toHaveText("Not running. Nothing is downloaded until you press Boot.");
    for (const name of ["Save state", "Power off"]) await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();

    await page.getByRole("radio", { name: /FreeDOS/ }).check();
    await expect(page.getByRole("button", { name: /^Boot FreeDOS · \d+(\.\d)? MB download$/ })).toBeEnabled();
    await expect(page.getByRole("link", { name: "Open in new tab" })).toBeHidden();
    await page.waitForTimeout(500);
    expect(requests, "nothing is fetched from the CDN before Boot").toEqual([]);
  });

  test("keeps its service worker inside /os-lab/", async ({ page }) => {
    await page.goto("./os-lab/");
    await expect.poll(settled(page, () => crossOriginIsolated && Boolean(navigator.serviceWorker.controller), false), { timeout: 15_000 }).toBe(true);
    const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((registration) => new URL(registration.scope).pathname));
    expect(scopes).toEqual(["/os-lab/"]);

    for (const path of ["./", "./?view=os", "./markets", "./?view=journal"]) {
      await page.goto(path);
      expect(await controlled(page), `${path} is not controlled by a service worker`).toBeNull();
      expect(await page.evaluate(() => crossOriginIsolated), `${path} is not cross-origin isolated`).toBe(false);
    }

    await page.goto("./os-lab/?coi=0");
    await expect.poll(settled(page, async () => (await navigator.serviceWorker.getRegistrations()).length, -1), { timeout: 15_000 }).toBe(0);
    await expect(page.getByRole("button", { name: /^Boot Linux/ })).toBeEnabled();
  });

  test("opens from the Lab OS Start menu in a window", async ({ page }) => {
    const requests = countCdnRequests(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("./?view=os");
    await expect(page.locator('.os-win[data-app="search"]')).toBeVisible();
    await page.locator(".os-start").click();
    const menu = page.getByRole("dialog", { name: "Start menu" });
    await menu.getByRole("list", { name: "Experiments", exact: true }).getByRole("button", { name: "Linux & DOS", exact: true }).click();

    const win = page.locator('.os-win[data-app="oslab"]');
    await expect(win).toHaveClass(/is-active/);
    await expect(win.locator("iframe")).toHaveAttribute("src", "/os-lab/");
    await expect(page.locator(".os-icons").getByRole("button", { name: "Linux & DOS" })).toHaveCount(0);

    const frame = page.frameLocator('.os-win[data-app="oslab"] iframe');
    await expect(frame.getByRole("button", { name: /^Boot Linux · \d+(\.\d)? MB download$/ })).toBeVisible();
    await expect(frame.getByRole("link", { name: "Open in new tab" })).toHaveAttribute("href", /\/os-lab\/$/);
    const screen = frame.getByRole("application");
    const [frameBox, screenBox] = [await win.locator("iframe").boundingBox(), await screen.boundingBox()];
    expect(screenBox!.y + screenBox!.height, "the screen fits inside the window").toBeLessThanOrEqual(frameBox!.y + frameBox!.height);
    await page.waitForTimeout(500);
    expect(requests).toEqual([]);
  });

  test("boots Linux, saves, restores, and resumes (set OS_LAB_BOOT=1)", async ({ page }) => {
    test.skip(!process.env.OS_LAB_BOOT, "Downloads about 2.8 MB from jsDelivr; set OS_LAB_BOOT=1 to run it.");
    test.setTimeout(240_000);
    await page.goto("./os-lab/?coi=0");
    const status = page.getByRole("status");
    const text = page.locator(".lab__text");
    await page.getByRole("button", { name: /^Boot Linux/ }).click();
    await expect(status).toHaveText(/^Linux is up: prompt [\d.]+ s after start/, { timeout: 180_000 });
    await expect(page.getByRole("application")).toBeFocused();
    await page.keyboard.type("uname -r\n");
    await expect(text).toContainText("2.6.34.14");

    await page.getByRole("button", { name: "Save state" }).click();
    await expect(status).toHaveText(/^Saved Linux: [\d.]+ MB/, { timeout: 60_000 });
    await page.getByRole("application").click();
    await page.keyboard.type("clear\n");
    await expect(text).not.toContainText("2.6.34.14");
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(status).toHaveText(/^Restored Linux in \d+ ms\.$/, { timeout: 60_000 });
    await expect(text).toContainText("2.6.34.14");

    await page.reload();
    await page.getByRole("button", { name: /^Resume save/ }).click();
    await expect(status).toHaveText(/^Resumed Linux in [\d.]+ s\.$/, { timeout: 60_000 });
    await page.getByRole("application").click();
    await page.keyboard.type("uname -m\n");
    await expect(text).toContainText("i686");

    await page.getByRole("button", { name: "Forget save" }).click();
    await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeDisabled();
  });

  test("boots FreeDOS (set OS_LAB_BOOT=1)", async ({ page }) => {
    test.skip(!process.env.OS_LAB_BOOT, "Downloads about 1.1 MB from jsDelivr; set OS_LAB_BOOT=1 to run it.");
    test.setTimeout(120_000);
    await page.goto("./os-lab/?coi=0&guest=freedos");
    await page.getByRole("button", { name: /^Boot FreeDOS/ }).click();
    await expect(page.getByRole("status")).toHaveText(/^FreeDOS is up/, { timeout: 90_000 });
    await expect(page.getByRole("application")).toBeFocused();
    await page.keyboard.type("dir\n");
    await expect(page.locator(".lab__text")).toContainText("bytes free");
  });
});
