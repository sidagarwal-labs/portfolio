import { expect, test, type Page } from "@playwright/test";

const settingsWin = '.os-win[data-app="settings"]';
const settingsKey = "lab-os-settings-v1";

/* 02:05:07 UTC is 9:05:07 PM the evening before in New York. */
test.use({ timezoneId: "America/New_York" });

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/**", (route) => route.abort());
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com|avatars\.githubusercontent\.com|s3\.tradingview\.com|datasets-server\.huggingface\.co)\//, (route) => route.abort());
  await page.clock.setFixedTime(new Date("2026-11-11T02:05:07Z"));
});

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function openDesktop(page: Page, style = "modern") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`./?view=os&style=${style}`);
  await expect(page.locator('.os-win[data-app="search"]')).toBeVisible();
}

async function openSettings(page: Page) {
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await menu.getByRole("list", { name: "System", exact: true }).getByRole("button", { name: "Settings", exact: true }).click();
  const win = page.locator(settingsWin);
  await expect(win).toHaveClass(/is-active/);
  await expect(win.getByRole("heading", { name: "Personalization" })).toBeVisible();
  return win;
}

const backgroundImage = (page: Page) => page.locator(".os").evaluate((element) => getComputedStyle(element).backgroundImage);

test("Settings changes the wallpaper live and keeps it after a reload", async ({ page }) => {
  await openDesktop(page);
  const before = await backgroundImage(page);
  expect(before).toContain("radial-gradient");
  const win = await openSettings(page);
  await expect(win.getByRole("radio", { name: "Default", exact: true })).toBeChecked();
  await expect(win.getByRole("radio", { name: "Aurora", exact: true })).toHaveAccessibleDescription("Modern");

  await win.getByRole("radio", { name: "Aurora", exact: true }).check();
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "aurora");
  const aurora = await backgroundImage(page);
  expect(aurora).not.toBe(before);
  expect(aurora).toContain("rgba(46, 204, 150");
  await expect(win.getByRole("definition").filter({ hasText: "Aurora" })).toBeVisible();
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key) ?? "{}", settingsKey))).toMatchObject({ wallpaper: "aurora" });

  await page.reload();
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "aurora");
  expect(await backgroundImage(page)).toBe(aurora);
  const reopened = await openSettings(page);
  await expect(reopened.getByRole("radio", { name: "Aurora", exact: true })).toBeChecked();

  /* Arrow keys move through the presets like any radio group. */
  await reopened.getByRole("radio", { name: "Aurora", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(reopened.getByRole("radio", { name: "Dusk", exact: true })).toBeChecked();
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "dusk");
});

test("the solid color option paints the desktop and keeps labels readable", async ({ page }) => {
  await openDesktop(page);
  const win = await openSettings(page);
  const icon = page.locator(".os-icons .os-icon").first();
  await expect(icon).toHaveCSS("color", "rgb(255, 255, 255)");

  await win.getByLabel("Color", { exact: true }).fill("#ffd166");
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "solid");
  await expect(page.locator(".os")).toHaveCSS("background-color", "rgb(255, 209, 102)");
  await expect(win.getByRole("radio", { name: "Solid color", exact: true })).toBeChecked();
  await expect(page.locator(".os")).toHaveClass(/os--wall-light/);
  await expect(icon).toHaveCSS("color", "rgb(16, 20, 29)");

  await win.getByLabel("Color", { exact: true }).fill("#203040");
  await expect(page.locator(".os")).toHaveCSS("background-color", "rgb(32, 48, 64)");
  await expect(page.locator(".os")).not.toHaveClass(/os--wall-light/);
  await expect(icon).toHaveCSS("color", "rgb(255, 255, 255)");

  await win.getByRole("radio", { name: "Daylight", exact: true }).check();
  await expect(page.locator(".os")).toHaveClass(/os--wall-light/);
  await win.getByRole("radio", { name: "Solid color", exact: true }).check();
  await expect(page.locator(".os")).toHaveCSS("background-color", "rgb(32, 48, 64)");
});

test("the Settings style choice stays in sync with the taskbar toggle", async ({ page }) => {
  await openDesktop(page);
  const win = await openSettings(page);
  const html = page.locator("html");
  await expect(win.getByRole("radio", { name: "Modern", exact: true })).toBeChecked();

  await win.getByRole("radio", { name: "Retro", exact: true }).check();
  await expect(html).toHaveAttribute("data-os-style", "retro");
  await expect(page.locator(".os")).toHaveClass(/os--retro/);
  await expect(page.getByRole("button", { name: "Switch to modern style" })).toBeVisible();
  expect(page.url()).not.toContain("style=");
  await expect(page.locator(".os")).toHaveCSS("background-color", "rgb(0, 128, 128)");

  await page.getByRole("button", { name: "Switch to modern style" }).click();
  await expect(html).toHaveAttribute("data-os-style", "modern");
  await expect(win.getByRole("radio", { name: "Modern", exact: true })).toBeChecked();

  await win.getByRole("radio", { name: "Retro", exact: true }).check();
  await expect(html).toHaveAttribute("data-os-style", "retro");
  await expect(win.getByRole("definition").filter({ hasText: /^Retro$/ })).toBeVisible();

  await page.reload();
  await expect(html).toHaveAttribute("data-os-style", "retro");
});

test("the Start menu leaves style, icon arrangement, and full-page views to Settings", async ({ page }) => {
  await openDesktop(page);
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await expect(menu.getByRole("list", { name: "Contact", exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Restart", exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Shut down", exact: true })).toBeVisible();
  for (const heading of ["Style", "Full-page views"]) await expect(menu.getByRole("heading", { name: heading, exact: true })).toHaveCount(0);
  await expect(menu.getByRole("group", { name: "Style" })).toHaveCount(0);
  await expect(menu.getByRole("list", { name: "Full-page views" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: /^(Modern|Retro|Arrange desktop icons)$/ })).toHaveCount(0);
  await expect(menu.getByRole("list", { name: "System", exact: true }).getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  /* Settings sits under Contact, so it stays in view without scrolling the apps column. */
  const rightColumn = menu.getByRole("list", { name: "Contact", exact: true }).locator("..");
  await expect(rightColumn.getByRole("list", { name: "System", exact: true })).toBeInViewport();
  await menu.getByRole("searchbox", { name: "Search apps" }).fill("settings");
  await expect(menu.getByRole("list", { name: "System", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("list", { name: "Search results", exact: true }).getByRole("button")).toHaveText(["Settings"]);
});

test("Settings arranges desktop icons", async ({ page }) => {
  await openDesktop(page);
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  const icon = page.locator(".os-icons .os-icon", { hasText: "Forward pass" });
  const before = (await icon.boundingBox())!;
  await icon.focus();
  await page.keyboard.press("Shift+ArrowRight");
  expect((await icon.boundingBox())!.x).toBe(before.x + 92);

  await page.getByRole("button", { name: "Open Settings" }).click();
  const win = page.locator(settingsWin);
  await win.getByRole("button", { name: "Arrange icons", exact: true }).click();
  await expect(win.getByRole("status")).toHaveText("Desktop icons arranged.");
  expect((await icon.boundingBox())!.x).toBe(before.x);
  expect((await icon.boundingBox())!.y).toBe(before.y);
});

const fullPageViews = [
  { name: "Journal", view: "journal" },
  { name: "Search", view: "search" },
  { name: "Forward pass", view: "forward" },
  { name: "Training run", view: "training" },
  { name: "Terminal", view: "terminal" }
];

for (const style of ["modern", "retro"]) {
  test(`Settings opens every full-page view in ${style} style`, async ({ page }) => {
    for (const { name, view } of fullPageViews) {
      await openDesktop(page, style);
      const win = await openSettings(page);
      const views = win.getByRole("list", { name: "Full-page views", exact: true });
      await expect(win.getByText("A full-page view swaps Lab OS for another design of the whole site", { exact: false })).toBeVisible();
      await expect(views.getByRole("button")).toHaveText(fullPageViews.map((item) => new RegExp(`^${item.name}`)));
      const button = views.getByRole("button", { name, exact: true });
      await expect(button).toHaveAccessibleDescription(/.+/);
      await button.click();
      await expect(page).toHaveURL(new RegExp(`[?&]view=${view}(&|$)`));
      await expect(page.locator(".os")).toHaveCount(0);
      await expect(page.locator("html")).not.toHaveAttribute("data-os-style", /.+/);
      if (view !== "journal") await expect(page.locator("html")).toHaveAttribute("data-view", view);
      await expect(page.getByRole("button", { name: new RegExp(`^View: ${name}$`) })).toBeVisible();
    }
  });
}

test("Settings on a phone offers the full-page views", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?view=os&style=modern");
  await page.locator(".os-home").getByRole("list", { name: "Apps", exact: true }).locator(".os-icon", { hasText: "Settings" }).click();
  const views = page.locator(settingsWin).getByRole("list", { name: "Full-page views", exact: true });
  await views.scrollIntoViewIfNeeded();
  await expect(views.getByRole("button")).toHaveCount(fullPageViews.length);
  await views.getByRole("button", { name: "Training run", exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=training(&|$)/);
  await expect(page.locator("html")).toHaveAttribute("data-view", "training");
});

test("the clock follows the 12/24-hour and seconds settings", async ({ page }) => {
  await openDesktop(page);
  const time = page.getByRole("button", { name: "Date and calendar" }).locator("time");
  await expect(time).toHaveText(/^9:05\sPM/);
  const win = await openSettings(page);
  await expect(win.locator(".os-set__preview")).toHaveText(/^9:05\sPM$/);

  await win.getByRole("radio", { name: "24-hour", exact: true }).check();
  await expect(time).toHaveText(/^21:05(?!:)/);
  await win.getByRole("checkbox", { name: "Show seconds" }).check();
  await expect(time).toHaveText(/^21:05:07/);
  await expect(win.locator(".os-set__preview")).toHaveText("21:05:07");

  await win.getByRole("radio", { name: "12-hour", exact: true }).check();
  await expect(time).toHaveText(/^9:05:07\sPM/);

  await page.reload();
  await expect(time).toHaveText(/^9:05:07\sPM/);
});

test("Reduce motion On stops OS animations even when the device allows motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=os&style=modern");
  await page.getByRole("button", { name: "Skip intro" }).click();
  const os = page.locator(".os");
  await expect(os).not.toHaveClass(/os--still/);
  const win = await openSettings(page);
  await expect(win.getByRole("radio", { name: "System", exact: true })).toBeChecked();
  await expect(win.getByText("System follows this device, which allows motion.", { exact: false })).toBeVisible();

  await win.getByRole("radio", { name: "On", exact: true }).check();
  await expect(os).toHaveClass(/os--still/);
  await expect(os).toHaveClass(/os--no-motion/);
  await page.locator(".os-start").click();
  await expect(page.locator(".os-menu")).toHaveCSS("animation-name", "none");
  await page.getByRole("dialog", { name: "Start menu" }).getByRole("button", { name: "README.txt", exact: true }).click();
  await expect(page.locator('.os-win[data-app="readme"]')).toHaveCSS("animation-name", "none");

  /* With motion off, the boot screen is skipped even when this tab hasn't seen it yet. */
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.locator('.os-win[data-app="search"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip intro" })).toHaveCount(0);
  await expect(os).toHaveClass(/os--still/);

  const again = await openSettings(page);
  await again.getByRole("radio", { name: "Off", exact: true }).check();
  await expect(os).not.toHaveClass(/os--still/);
});

test("Reset all asks first, then clears saved settings and the icon layout", async ({ page }) => {
  await openDesktop(page);
  await page.evaluate(() => {
    localStorage.setItem("lab-os-icons-v2", JSON.stringify({ search: { x: 3, y: 2 } }));
    localStorage.setItem("lab-os-icons-v3", JSON.stringify({ search: { col: 3, row: 2 } }));
    localStorage.setItem("lab-os-snake-best-v1", "12");
  });
  const win = await openSettings(page);
  await win.getByRole("radio", { name: "Clouds", exact: true }).check();
  await win.getByRole("radio", { name: "24-hour", exact: true }).check();
  await win.getByRole("radio", { name: "Retro", exact: true }).check();
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "clouds");

  const trigger = win.getByRole("button", { name: "Reset all Lab OS settings…" });
  const confirm = win.getByRole("group", { name: "Reset all Lab OS settings? Game best scores stay." });
  await expect(confirm).toBeHidden();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "clouds");

  await trigger.click();
  await confirm.getByRole("button", { name: "Reset everything" }).click();
  await expect(win.getByRole("status")).toHaveText("Lab OS settings were reset.");
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "default");
  await expect(page.locator("html")).toHaveAttribute("data-os-style", "modern");
  await expect(win.getByRole("radio", { name: "Default", exact: true })).toBeChecked();
  await expect(win.getByRole("radio", { name: "12-hour", exact: true })).toBeChecked();
  await expect(confirm).toBeHidden();
  await expect(trigger).toBeFocused();
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("lab-os-")).sort());
  expect(stored).toEqual(["lab-os-snake-best-v1"]);

  await page.reload();
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "default");
  await expect(page.locator("html")).toHaveAttribute("data-os-style", "modern");
});

test("bad saved settings fall back to the defaults", async ({ page }) => {
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem(key, JSON.stringify({ wallpaper: "nope", color: "red", clock: "24", seconds: "yes", motion: 7 }));
    }
  }, settingsKey);
  await openDesktop(page);
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "default");
  await expect(page.getByRole("button", { name: "Date and calendar" }).locator("time")).toHaveText(/^21:05(?!:)/);
  await page.evaluate((key) => localStorage.setItem(key, "{not json"), settingsKey);
  await page.reload();
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "default");
  await expect(page.getByRole("button", { name: "Date and calendar" }).locator("time")).toHaveText(/^9:05\sPM/);
});

test("the taskbar gear opens Settings", async ({ page }) => {
  await openDesktop(page, "retro");
  await page.getByRole("button", { name: "Open Settings" }).click();
  const win = page.locator(settingsWin);
  await expect(win).toHaveClass(/is-active/);
  await expect(win.getByRole("button", { name: "Arrange icons" })).toBeVisible();
  await expect(win.getByRole("definition").filter({ hasText: /^\d+(\.\d)? (bytes|KB) in \d+ keys?$/ })).toBeVisible();
});

for (const style of ["modern", "retro"]) {
  for (const width of [390, 320]) {
    test(`Settings fits a ${width}px phone in ${style} style`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 760 });
      await page.goto(`./?view=os&style=${style}`);
      const home = page.locator(".os-home").getByRole("list", { name: "Apps", exact: true });
      await home.locator(".os-icon", { hasText: "Settings" }).click();
      const win = page.locator(settingsWin);
      await expect(win).toHaveClass(/is-active/);
      expect((await win.boundingBox())?.width).toBe(width);
      await expect(win.getByRole("button", { name: "Arrange icons" })).toHaveCount(0);

      await win.getByRole("radio", { name: "Classic teal", exact: true }).check();
      await expect(page.locator(".os")).toHaveCSS("background-color", "rgb(0, 128, 128)");
      for (const heading of ["System", "Reset", "About this PC"]) {
        await win.getByRole("heading", { name: heading, exact: true }).scrollIntoViewIfNeeded();
      }
      await win.getByRole("button", { name: "Reset all Lab OS settings…" }).click();
      await expect(win.getByRole("button", { name: "Reset everything" })).toBeVisible();

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      const overflow = await win.locator(".os-win__body").evaluate((body) => body.scrollWidth - body.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const outside = await win.locator(".os-set *").evaluateAll((elements, limit) => elements
        .filter((element) => element.getBoundingClientRect().right > limit + 0.5)
        .map((element) => element.getAttribute("class") ?? element.tagName), width);
      expect(outside).toEqual([]);
    });
  }
}
