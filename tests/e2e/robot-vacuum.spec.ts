import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { robotVacuumDone, robotVacuumRoadmap } from "../../src/content/robotVacuum";

const slug = "reviving-a-robot-vacuum";
const title = "Reviving a robot vacuum: a build log";
const headings = ["The robot", "The problem", "Opening it up", "The result", "The fix didn't hold", "What the robot reports", "A robot on Shanghai time", "What my app does now", "What stays private", "What's next"];
const photos = ["robot-underside-open.jpg", "battery-label.jpg", "battery-connector.jpg"];
const snapshot = JSON.parse(readFileSync(new URL("../../public/robot-vacuum/status.json", import.meta.url), "utf8"));
const statusRoute = "**/robot-vacuum/status.json";
const robotWin = '.os-win[data-app="robotvacuum"]';

test.use({ timezoneId: "America/New_York" });

test.beforeEach(async ({ page, baseURL }) => {
  const site = new URL(baseURL!).origin;
  await page.route((url) => /^https?:$/.test(url.protocol) && url.origin !== site, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function expectPhotos(scope: Locator) {
  const figures = scope.locator("figure.article-figure");
  await expect(figures).toHaveCount(photos.length);
  for (const [index, file] of photos.entries()) {
    const image = figures.nth(index).locator("img");
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("src", new RegExp(`/robot-vacuum/${file}$`));
    expect((await image.getAttribute("alt"))!.length, `${file} alt text`).toBeGreaterThan(40);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { message: `${file} loads` }).toBeGreaterThan(0);
    await expect(figures.nth(index).locator("figcaption")).not.toBeEmpty();
  }
}

async function openRobotVacuum(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await page.locator(".os-icons").getByRole("button", { name: "Robot Vacuum", exact: true }).click();
  const win = page.locator(robotWin);
  await expect(win).toHaveClass(/is-active/);
  return win;
}

/* The home page defaults to Lab OS; the journal view has the classic writing list. */
const preferJournal = (page: Page) => page.addInitScript(() => localStorage.setItem("site-view-v1", "journal"));
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe("build log article", () => {
  test("renders the title, section headings, captioned photos with alt text, and notes", async ({ page }) => {
    await preferJournal(page);
    await page.goto(`./writing/${slug}`);
    await expect(page).toHaveTitle(new RegExp(`^${title}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.locator(".article-meta")).toHaveText("November 15, 2026 · 5 min read");
    const body = page.locator(".article-body");
    await expect(body.getByRole("heading", { level: 2 })).toHaveText(headings);
    await expect(body.getByRole("heading", { name: "The problem", level: 2 })).toHaveAttribute("id", "the-problem");
    await expectPhotos(body);
    await expect(body.getByRole("img", { name: /battery pack's label: model P2008-4S2P-MMBK/ })).toBeVisible();
    await expect(body.getByRole("note")).toHaveCount(2);
    await expect(body.getByRole("note").last()).toContainText("Never open or puncture the battery pack itself.");
    await expect(body.locator(".article-list > li")).toHaveCount(robotVacuumRoadmap.length);
    await expect(body).toContainText("A battery capacity estimate from how the pack discharges over time.");
    await expect(body).toContainText("from 73% to 74% to 78%");
    await expect(body).toContainText("A normal power cycle with the power button didn't clear the stuck 17%.");
    await expect(body).toContainText("The robot also rebooted once more on its own overnight.");
    await expect(body).toContainText("after about 10 hours on the plugged-in dock, it still read 17% and \"charging\". The gauge is still frozen.");
    await page.getByRole("link", { name: "Back to writing", exact: true }).click();
    await expect(page.locator("#writing")).toBeInViewport();
  });

  test("a missing photo keeps its description instead of a broken image", async ({ page }) => {
    await page.route("**/robot-vacuum/battery-label.jpg", (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto(`./writing/${slug}`);
    const missing = page.locator(".article-figure__missing");
    await missing.scrollIntoViewIfNeeded();
    await expect(missing).toHaveAttribute("role", "img");
    await expect(missing).toHaveAccessibleName(/P2008-4S2P-MMBK.*\(photo unavailable\)$/);
    await expect(page.locator(".article-figure img")).toHaveCount(photos.length - 1);
  });

  test("fits phones and reads in dark mode", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("lab-os-settings-v1", JSON.stringify({ appearance: "dark" })));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`./writing/${slug}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    const body = page.locator(".article-body");
    const box = (await body.boundingBox())!;
    for (const figure of await body.locator("figure").all()) {
      const frame = (await figure.boundingBox())!;
      expect(frame.x).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(frame.x + frame.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    }
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
    /* Dark mode paints light text; the caption and note follow it too. */
    for (const element of [body.locator("p").first(), body.locator("figcaption").first(), body.getByRole("note").first()]) {
      const [r, g, b] = (await element.evaluate((node) => getComputedStyle(node).color)).match(/\d+/g)!.map(Number);
      expect(r + g + b, "text is light on the dark page").toBeGreaterThan(400);
    }
  });
});

test.describe("listings and Sid Search", () => {
  test("the post is listed on the home page and in Sid Search's Writing section", async ({ page }) => {
    await preferJournal(page);
    await page.goto("./");
    await page.locator("#writing").getByRole("link", { name: title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/writing/${slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);

    await page.goto("./?view=search#writing");
    const essay = page.locator("#writing .se-results--essays .se-result");
    await expect(essay.locator(".se-result__title")).toHaveText(title);
    await expect(essay.locator(".se-result__title")).toHaveAttribute("href", `/writing/${slug}`);
  });

  test("Sid Search finds the post by its title and by words inside it, and opens it", async ({ page }) => {
    await page.goto("./?view=search");
    const query = page.getByLabel("Search Sid's work");
    const results = page.locator(".se-matches .se-result");
    await query.fill("robot vacuum");
    await expect(results.first().locator("h3")).toHaveText(title);
    await expect(results.first().locator(".se-result__title")).toHaveAttribute("href", `/writing/${slug}`);
    for (const text of ["shanghai", "battery connector", "P2008"]) {
      await query.fill(text);
      await expect(results.first().locator("h3"), text).toHaveText(title);
    }
    await query.fill("robot vacuum");
    await results.first().locator(".se-result__title").click();
    await expect(page).toHaveURL(new RegExp(`/writing/${slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  });
});

test.describe("Lab OS Robot Vacuum app", () => {
  test("opens from the desktop and shows the read-only status snapshot, with the stuck battery as unknown", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-15T07:10:00Z"));
    const win = await openRobotVacuum(page);
    await expect(win.locator(".os-win__title")).toHaveText("Robot Vacuum");
    await expect(win.getByRole("tab", { name: "Status", exact: true })).toHaveAttribute("aria-selected", "true");
    const status = win.getByRole("tabpanel", { name: "Status" });
    await expect(status).toContainText("A read-only public snapshot. There are no remote controls here");

    const updated = status.locator(".rv-updated");
    await expect(updated.locator("time")).toHaveAttribute("datetime", snapshot.updatedAt);
    await expect(updated).toContainText("Last updated Nov 15, 2026, 1:40 AM EST (30 minutes ago)");
    await expect(status.locator(".rv-stale")).toHaveCount(0);

    const stats = status.locator(".rv-stat");
    await expect(stats.locator("dt")).toHaveText(["Battery", "State", "Errors", "Model"]);
    await expect(stats.locator(".rv-stat__value")).toHaveText(["Unknown", "Paused", "None", "MOVA L600"]);
    const batteryCard = stats.first();
    await expect(batteryCard).toHaveAttribute("data-unknown", "true");
    await expect(batteryCard).toContainText("Battery reading stuck, diagnosing. The build log has the details.");
    await expect(batteryCard).toContainText("Not charging, off the dock");
    await expect(batteryCard.locator(".rv-bar")).toHaveCount(0);
    await expect(status).toContainText("The current reading is unknown. These are the last trusted readings.");
    await expect(status.getByRole("img", { name: "Battery went from 78% at 12:40 AM to 87% at 12:50 AM, over 2 readings." })).toBeVisible();
    await status.getByText("Readings (2)").click();
    await expect(status.locator(".rv-table tbody tr")).toHaveText([/Nov 15, 2026, 12:40 AM EST\s*78%/, /Nov 15, 2026, 12:50 AM EST\s*87%/]);

    const parts = status.locator(".rv-part");
    await expect(parts.locator(".rv-part__name")).toHaveText(["Main brush", "Side brush", "Filter"]);
    await expect(parts.locator(".rv-part__value")).toHaveText(["100%", "100%", "100%"]);
    await expect(parts.locator(".rv-part__note")).toHaveText(["300 h left · reset Nov 15, 2026", "200 h left · reset Nov 15, 2026", "150 h left · reset Nov 15, 2026"]);
    await expect(status.locator(".rv-facts dt")).toHaveText(["Cleans", "Cleaning time", "Area cleaned", "Charge cycles, last 7 days", "Charge sessions, last 7 days", "Reboots, last 7 days"]);
    await expect(status.locator(".rv-facts dd")).toHaveText(["0", "0 min", "0 m²", "0", "1", "Unknown"]);

    /* No remote controls: the only buttons are the tabs and Refresh. */
    await expect(win.locator(".rv button")).toHaveText(["Status", "Build log", "Roadmap", "Refresh"]);
    await expect(win.locator(".rv input, .rv select, .rv textarea")).toHaveCount(0);
  });

  test("a known battery level shows a percentage and a bar", async ({ page }) => {
    await page.route(statusRoute, (route) => route.fulfill({
      json: { ...snapshot, robot: { ...snapshot.robot, state: "Charging", battery: 87, charging: true, docked: true } }
    }));
    const win = await openRobotVacuum(page);
    const batteryCard = win.locator(".rv-stat").first();
    await expect(win.locator(".rv-stat__value")).toHaveText(["87%", "Charging", "None", "MOVA L600"]);
    await expect(batteryCard).not.toHaveAttribute("data-unknown");
    await expect(batteryCard).toContainText("Charging, on the dock");
    await expect(batteryCard.locator(".rv-bar")).toBeVisible();
    await expect(batteryCard.locator(".rv-bar")).toHaveAttribute("data-tone", "ok");
    await expect(win.getByText("The current reading is unknown.")).toHaveCount(0);
  });

  test("fields the robot didn't report show as unknown", async ({ page }) => {
    await page.route(statusRoute, (route) => route.fulfill({
      json: {
        ...snapshot,
        robot: { ...snapshot.robot, state: null, charging: null, docked: null, error: "Collision sensor is stuck" },
        maintenance: { ...snapshot.maintenance, sideBrush: { percentLeft: null, hoursLeft: null, lastReset: null } },
        lifetime: { cleans: null, minutes: null, areaM2: null },
        uptime: { rebootsLast7d: 2 }
      }
    }));
    const win = await openRobotVacuum(page);
    await expect(win.locator(".rv-stat__value")).toHaveText(["Unknown", "Unknown", "Collision sensor is stuck", "MOVA L600"]);
    await expect(win.locator(".rv-stat").nth(2)).toHaveAttribute("data-error", "true");
    await expect(win.locator(".rv-stat").first()).toContainText("Charging and dock status unknown");
    const side = win.locator(".rv-part").nth(1);
    await expect(side.locator(".rv-part__value")).toHaveText("Unknown");
    await expect(side.locator(".rv-part__note")).toHaveText("Hours left unknown · no reset recorded");
    await expect(win.locator(".rv-facts dd")).toHaveText(["Unknown", "Unknown", "Unknown", "0", "1", "2"]);
  });

  test("an old snapshot says it may be out of date", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-18T09:00:00Z"));
    const win = await openRobotVacuum(page);
    await expect(win.locator(".rv-updated")).toContainText("(3 days ago)");
    await expect(win.locator(".rv-stale")).toHaveText("This snapshot is from 3 days ago, so the robot may have changed since.");
  });

  test("the build log and roadmap tabs share the article and plan, with keyboard tabs", async ({ page }) => {
    const win = await openRobotVacuum(page);
    const tabs = win.getByRole("tablist", { name: "Robot Vacuum" });
    await tabs.getByRole("tab", { name: "Status", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    const logTab = tabs.getByRole("tab", { name: "Build log", exact: true });
    await expect(logTab).toBeFocused();
    await expect(logTab).toHaveAttribute("aria-selected", "true");

    const log = win.getByRole("tabpanel", { name: "Build log" });
    await expect(log.getByRole("heading", { level: 2 })).toHaveText(title);
    await expect(log.locator(".rv-log__body h3")).toHaveText(headings);
    await expect(log.getByRole("link", { name: "Open as a full page" })).toHaveAttribute("href", new RegExp(`/writing/${slug}$`));
    await expect(log.getByRole("link", { name: "Open as a full page" })).toHaveAttribute("target", "_blank");
    await expectPhotos(log);

    await page.keyboard.press("End");
    const roadmap = win.getByRole("tabpanel", { name: "Roadmap" });
    await expect(tabs.getByRole("tab", { name: "Roadmap", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(roadmap.locator(".rv-steps--done > li")).toHaveText(robotVacuumDone);
    await expect(roadmap.locator("ol.rv-steps > li")).toHaveText(robotVacuumRoadmap);
    await page.keyboard.press("Home");
    await expect(win.getByRole("tabpanel", { name: "Status" })).toBeVisible();
    await expect(roadmap).toBeHidden();
  });

  test("a failed snapshot shows an error with a retry, and the other tabs keep working", async ({ page }) => {
    await page.route(statusRoute, (route) => route.fulfill({ status: 500, body: "nope" }));
    const win = await openRobotVacuum(page);
    const alert = win.getByRole("alert");
    await expect(alert.getByRole("heading", { name: "Status unavailable" })).toBeVisible();
    await expect(alert).toContainText("The status snapshot didn't load (HTTP 500).");
    await expect(alert).toContainText("The build log and roadmap still work.");
    await expect(win.locator(".rv-stats")).toHaveCount(0);
    await win.getByRole("tab", { name: "Build log", exact: true }).click();
    await expect(win.getByRole("tabpanel", { name: "Build log" }).getByRole("heading", { level: 2 })).toHaveText(title);
    await win.getByRole("tab", { name: "Status", exact: true }).click();

    await page.unroute(statusRoute);
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(win.getByRole("alert")).toHaveCount(0);
    await expect(win.locator(".rv-stat__value").first()).toHaveText("Unknown");
  });

  test("a slow snapshot shows a loading state first", async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(statusRoute, async (route) => {
      await held;
      await route.fulfill({ json: snapshot });
    });
    const win = await openRobotVacuum(page);
    await expect(win.getByRole("status")).toHaveText("Loading the latest snapshot…");
    release();
    await expect(win.getByRole("status")).toHaveCount(0);
    await expect(win.locator(".rv-stat__value").first()).toHaveText("Unknown");
  });

  const invalid: [string, (route: Route) => Promise<void>, string][] = [
    ["not JSON", (route) => route.fulfill({ contentType: "application/json", body: "{ not json" }), "The status snapshot isn't valid JSON."],
    ["a newer schema", (route) => route.fulfill({ json: { ...snapshot, schema: 2 } }), "schema must be 1."],
    ["a bad battery value", (route) => route.fulfill({ json: { ...snapshot, robot: { ...snapshot.robot, battery: "87" } } }), "robot.battery must be"],
    ["a bad charging flag", (route) => route.fulfill({ json: { ...snapshot, robot: { ...snapshot.robot, charging: "yes" } } }), "robot.charging must be true or false, or null when unknown."],
    ["a missing section", (route) => route.fulfill({ json: { ...snapshot, maintenance: undefined } }), "maintenance must be an object."]
  ];
  for (const [name, handler, message] of invalid) {
    test(`a snapshot with ${name} is rejected with a clear error`, async ({ page }) => {
      await page.route(statusRoute, handler);
      const win = await openRobotVacuum(page);
      await expect(win.getByRole("alert")).toContainText(message);
      await expect(win.locator(".rv-stats")).toHaveCount(0);
    });
  }

  test("unknown fields in the snapshot are ignored", async ({ page }) => {
    await page.route(statusRoute, (route) => route.fulfill({
      json: { ...snapshot, extra: { nested: true }, robot: { ...snapshot.robot, firmware: "ignored", note: "<b>ignored</b>" } }
    }));
    const win = await openRobotVacuum(page);
    await expect(win.locator(".rv-stat__value")).toHaveText(["Unknown", "Paused", "None", "MOVA L600"]);
    await expect(win.getByRole("tabpanel", { name: "Status" })).not.toContainText("ignored");
  });

  test("fits the phone home screen in dark mode", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("lab-os-settings-v1", JSON.stringify({ appearance: "dark", note: false })));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./?view=os");
    await page.locator(".os-home").getByRole("button", { name: "Robot Vacuum", exact: true }).click();
    const win = page.locator(robotWin);
    await expect(win).toHaveClass(/is-active/);
    await expect(win.locator(".rv-stat__value").first()).toHaveText("Unknown");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const [r, g, b] = (await win.locator(".rv").evaluate((element) => getComputedStyle(element).backgroundColor)).match(/\d+/g)!.map(Number);
    expect(r + g + b, "the app has a dark surface").toBeLessThan(200);
    const panel = (await win.locator(".rv-panel:not([hidden])").boundingBox())!;
    for (const card of await win.locator(".rv-stat").all()) {
      const box = (await card.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    }
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);
  });
});
