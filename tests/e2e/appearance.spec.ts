import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";

const key = "lab-os-settings-v1";
const darkSurface = "rgb(41, 41, 41)";
const settings = (page: Page) => page.locator('.os-win[data-app="settings"]');
const appearance = (page: Page) => settings(page).getByRole("group", { name: "Appearance", exact: true });

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function desktop(page: Page, style = "modern") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`./?view=os&style=${style}`);
  await expect(page.locator('.os-win[data-app="search"]')).toBeVisible();
}

async function launch(page: Page, name: string, app: string) {
  if (app === "projects") {
    await page.getByRole("button", { name: "Show desktop", exact: true }).click();
    await page.locator(".os-icons").getByRole("button", { name, exact: true }).click();
    return page.locator('.os-win[data-folder-id="projects"]');
  }
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await menu.getByRole("searchbox", { name: "Search apps" }).fill(name);
  await menu.getByRole("list", { name: "Search results" }).getByRole("button", { name, exact: true }).click();
  const win = page.locator(`.os-win[data-app="${app}"]`);
  await expect(win).toHaveClass(/is-active/);
  return win;
}

async function choose(page: Page, name: "Light" | "Dark" | "System") {
  await page.getByRole("button", { name: "Open Settings", exact: true }).click();
  await appearance(page).getByRole("radio", { name, exact: true }).check();
}

const siteFrame = (page: Page, app = "search") => page.frameLocator(`.os-win[data-app="${app}"] iframe.os-frame`);

/* Resolve computed colors (including color-mix and alpha) against their painted ancestors, not
   theme attributes. SVG labels use fill. Images/gradients aren't candidates for this assertion. */
async function readable(locator: Locator, minimum = 4.5) {
  await expect(locator).toBeVisible();
  const metrics = await locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    const rgba = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (front: number[], back: number[]) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      return [0, 1, 2].map((i) => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / (alpha || 1)).concat(alpha);
    };
    let background = [0, 0, 0, 0];
    for (let node: Element | null = element; node && background[3] < 0.999; node = node.parentElement) {
      background = over(background, rgba(getComputedStyle(node).backgroundColor));
    }
    background = over(background, [255, 255, 255, 1]);
    const css = getComputedStyle(element);
    const foreground = over(rgba(element instanceof SVGElement ? css.fill : css.color), background);
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const a = luminance(foreground);
    const b = luminance(background);
    return { contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), background: b, text: element.textContent?.slice(0, 70), color: css.color };
  });
  expect(metrics, `Readability of ${await locator.getAttribute("class")}`).toMatchObject({ contrast: expect.any(Number) });
  expect(metrics.contrast, JSON.stringify(metrics)).toBeGreaterThanOrEqual(minimum);
  expect(metrics.background, JSON.stringify(metrics)).toBeLessThan(0.2);
}

async function darkPage(frame: FrameLocator, sample: string) {
  await expect(frame.locator("html")).toHaveCSS("background-color", darkSurface);
  await readable(frame.locator(sample).first());
}

test("Light is the default even on a dark device, and the radio group is keyboard accessible", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await desktop(page);
  await page.getByRole("button", { name: "Open Settings" }).click();
  await expect(appearance(page).getByRole("radio", { name: "Light", exact: true })).toBeChecked();
  await expect(settings(page).locator(".os-set__section").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(siteFrame(page).locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await appearance(page).getByRole("radio", { name: "Light", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(appearance(page).getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  await expect(settings(page).locator(".os-set__section").first()).toHaveCSS("background-color", darkSurface);
  await readable(settings(page).locator(".os-set__hint").first());
  await darkPage(siteFrame(page), ".se-result__snippet");
});

test("appearance persists, stays independent, and Reset all restores Light in already-open frames", async ({ page }) => {
  await desktop(page);
  await choose(page, "Dark");
  await settings(page).getByRole("radio", { name: "Daylight", exact: true }).check();
  await settings(page).getByRole("group", { name: "Reduce motion" }).getByRole("radio", { name: "On", exact: true }).check();
  await settings(page).getByRole("radio", { name: "Retro", exact: true }).check();
  const wallpaper = await page.locator(".os").evaluate((element) => getComputedStyle(element).backgroundImage);
  await choose(page, "Light");
  expect(await page.locator(".os").evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(wallpaper);
  await choose(page, "Dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-os-style", "retro");
  await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "daylight");
  await expect(page.locator(".os")).toHaveClass(/os--no-motion/);
  await expect(page.locator(".os-icons .os-icon").first()).toHaveCSS("color", "rgb(0, 0, 0)");
  await darkPage(siteFrame(page), ".se-result__snippet");
  await page.getByRole("button", { name: "Open Settings" }).click();
  await expect(appearance(page).getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).appearance, key)).toBe("dark");
  await settings(page).getByRole("button", { name: "Reset all Lab OS settings…" }).click();
  await readable(settings(page).locator(".os-set__confirm p"));
  await settings(page).getByRole("button", { name: "Reset everything", exact: true }).click();
  await expect(appearance(page).getByRole("radio", { name: "Light", exact: true })).toBeChecked();
  await expect(siteFrame(page).locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("System follows live device changes; explicit choices override them", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await desktop(page);
  await choose(page, "System");
  await page.emulateMedia({ colorScheme: "dark" });
  await darkPage(siteFrame(page), ".se-result__snippet");
  await readable(settings(page).locator(".os-set__hint").first());
  await page.emulateMedia({ colorScheme: "light" });
  await expect(siteFrame(page).locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await choose(page, "Dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await darkPage(siteFrame(page), ".se-result__snippet");
  await choose(page, "Light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(siteFrame(page).locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await choose(page, "System");
  await page.reload();
  await darkPage(siteFrame(page), ".se-result__snippet");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(siteFrame(page).locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

for (const value of [undefined, "invalid", null]) {
  test(`old or invalid appearance (${value}) preserves valid saved fields`, async ({ page }) => {
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, JSON.stringify({ appearance: value, wallpaper: "clouds", clock: "24", motion: "reduce" }));
    }, { key, value });
    await page.emulateMedia({ colorScheme: "dark" });
    await desktop(page);
    await expect(page.locator(".os")).toHaveAttribute("data-wallpaper", "clouds");
    await expect(siteFrame(page).locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.getByRole("button", { name: "Open Settings" }).click();
    await expect(appearance(page).getByRole("radio", { name: "Light", exact: true })).toBeChecked();
    await expect(settings(page).getByRole("radio", { name: "24-hour", exact: true })).toBeChecked();
  });
}

test("blocked storage still themes existing and new frames, and reports save/reset failures", async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "{}");
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (name: string, value?: string) {
        if (name === key) throw new DOMException("Storage blocked", "SecurityError");
        return original.call(this, name, value!);
      };
    }
  }, key);
  await desktop(page);
  await choose(page, "Dark");
  await expect(settings(page).getByText("This browser isn't saving settings", { exact: false })).toBeVisible();
  await darkPage(siteFrame(page), ".se-result__snippet");
  await launch(page, "Journal", "journal");
  await darkPage(siteFrame(page, "journal"), ".masthead__location");
  await page.getByRole("button", { name: "Open Settings" }).click();
  await settings(page).getByRole("button", { name: "Reset all Lab OS settings…" }).click();
  await settings(page).getByRole("button", { name: "Reset everything", exact: true }).click();
  await expect(settings(page).getByText("This browser isn't saving settings", { exact: false })).toBeVisible();
  await expect(appearance(page).getByRole("radio", { name: "Light", exact: true })).toBeChecked();
  await expect(siteFrame(page, "journal").locator("html")).toHaveCSS("background-color", "rgb(253, 253, 252)");
});

for (const style of ["modern", "retro"]) {
  test(`${style}: native apps, chrome, dialogs, and chart labels have real dark surfaces and readable text`, async ({ page }) => {
    test.setTimeout(90_000);
    await desktop(page, style);
    await choose(page, "Dark");
    await readable(settings(page).locator(".os-win__title"));
    await readable(page.locator(".os-task").filter({ hasText: "Sid Search" }).locator("span"));
    await readable(page.locator(".os-welcome__hint"));
    await page.locator(".os-start").click();
    await readable(page.locator(".os-menu__heading").first());
    await readable(page.locator(".os-menu__who span"));
    await page.keyboard.press("Escape");
    const library = await launch(page, "Library", "library");
    await readable(library.locator(".lib__intro"));
    await library.locator(".lib-card", { hasText: "Acquired" }).click();
    await readable(library.locator(".lib-detail__note"));
    const reader = await launch(page, "Reader", "reader");
    await readable(reader.locator(".rdr__lede"));
    await readable(reader.locator(".rdr__meta"));
    const github = await launch(page, "GitHub", "github");
    await readable(github.locator(".gh-head__name"));
    await readable(github.locator(".gh-stat dt").first());
    await readable(github.locator(".gh-card__lead").first());
    await readable(github.locator(".gh-axis text").first());
    const arxiv = await launch(page, "arXiv Search", "arxiv");
    await readable(arxiv.locator(".ax-lede"));
    await readable(arxiv.locator(".ax-axis text").first());
    await readable(arxiv.locator(".ax-point text").first());
    const folder = await launch(page, "Projects", "projects");
    await readable(folder.locator(".os-folder-path strong"));
    const bin = await launch(page, "Recycle Bin", "recyclebin");
    await readable(bin.locator(".os-recycle-bin p").first());
    await page.getByRole("button", { name: "Date and calendar" }).click();
    await readable(page.locator(".os-calendar h2"));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Send feedback", exact: true }).click();
    await readable(page.locator(".os-fb__notice"));
    await readable(page.locator(".os-fb__label"));
    await expect(page.locator(".os-fb__comment")).toHaveCSS("background-color", darkSurface);
  });

  test(`${style}: all portfolio views, live pages, new and nested frames follow live changes`, async ({ page }) => {
    test.setTimeout(90_000);
    await desktop(page, style);
    const pages = [
      ["Sid Search", "search", ".se-result__snippet"],
      ["Journal", "journal", ".masthead__location"],
      ["Forward pass", "forward", ".fp-location"],
      ["Training run", "training", ".tr-dash__stat"],
      ["Terminal", "terminal", ".tm-status"],
      ["Markets", "markets", ".live-hero__lede"]
    ];
    await choose(page, "Dark");
    for (const [title, app, sample] of pages) {
      await launch(page, title, app);
      await darkPage(siteFrame(page, app), sample);
      if (app === "search") await readable(siteFrame(page, app).locator('.se-filters button[aria-pressed="true"]').first());
      if (app === "markets") {
        await readable(siteFrame(page, app).locator('.mk-level__number').first());
        await siteFrame(page, app).getByRole("tab", { name: "Insights", exact: true }).click();
        await readable(siteFrame(page, app).locator('.mk-capex__name').first());
        await readable(siteFrame(page, app).locator('.mk-capex__name').nth(1));
        await readable(siteFrame(page, app).locator('.mk-capex__name').nth(2));
        await readable(siteFrame(page, app).locator('.mk-treemap__group span').first());
      }
    }
    const journal = siteFrame(page, "journal");
    await journal.locator("body").evaluate((body) => {
      const frame = document.createElement("iframe");
      frame.name = "labos:training";
      frame.title = "Nested portfolio";
      frame.src = "./?view=training";
      body.append(frame);
    });
    const nested = journal.frameLocator('iframe[title="Nested portfolio"]');
    await darkPage(nested, ".tr-dash__stat");
    await choose(page, "Light");
    for (const [, app] of pages) await expect(siteFrame(page, app).locator("html")).not.toHaveCSS("background-color", darkSurface);
    await expect(nested.locator("html")).toHaveCSS("background-color", "rgb(252, 252, 251)");
    await choose(page, "Dark");
    await darkPage(nested, ".tr-dash__stat");
    const journalWindow = await launch(page, "Journal", "journal");
    await journalWindow.getByRole("button", { name: "Reload", exact: true }).click();
    await darkPage(journal, ".masthead__location");
    await launch(page, "AI leaderboards", "leaderboards");
    await darkPage(siteFrame(page, "leaderboards"), ".live-hero__lede");
    await launch(page, "Launches", "launches");
    await darkPage(siteFrame(page, "launches"), ".live-hero__lede");
  });

  for (const width of [320, 390]) {
    test(`${style}: appearance and app content fit a ${width}px phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 760 });
      await page.goto(`./?view=os&style=${style}`);
      await page.locator(".os-home").getByRole("button", { name: "Settings", exact: true }).click();
      await appearance(page).getByRole("radio", { name: "Dark", exact: true }).check();
      await readable(settings(page).locator(".os-set__hint").first());
      await expect(appearance(page)).toBeInViewport();
      await settings(page).locator(".os-win__home").click();
      await page.locator(".os-home").getByRole("button", { name: "Sid Search", exact: true }).click();
      await darkPage(siteFrame(page), ".se-result__snippet");
      expect(await siteFrame(page).locator("html").evaluate((html) => html.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.locator('.os-win[data-app="search"] .os-win__home').click();
      await page.locator(".os-home").getByRole("button", { name: "Library", exact: true }).click();
      await readable(page.locator(".lib__intro"));
      await page.locator(".lib-card").first().click();
      await readable(page.locator(".lib-detail__note"));
      expect(await page.locator("html").evaluate((html) => html.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }
}

test("external iframe and PDF content are not recolored or inverted", async ({ page }) => {
  await page.route("https://arxiv.agarwal-labs.com/**", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><body style="background:white;color:black">External provider<script>parent.postMessage({type:"arxiv-search:ready"}, new URL(document.referrer).origin)</script>'
  }));
  await desktop(page);
  const arxiv = await launch(page, "arXiv Search", "arxiv");
  await arxiv.getByRole("tab", { name: "Try it live" }).click();
  const external = arxiv.frameLocator("iframe");
  await expect(external.getByText("External provider")).toBeVisible();
  await choose(page, "Dark");
  await expect(external.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(external.locator("html")).not.toHaveAttribute("data-theme");
  await expect(arxiv.locator("iframe")).toHaveCSS("filter", "none");
  await launch(page, "Resume.pdf", "resume");
  await expect(page.locator(".os-pdf__doc")).toHaveCSS("filter", "none");
  await readable(page.locator(".os-pdf .os-address"));
});
