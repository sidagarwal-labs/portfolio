import { expect, test, type Page } from "@playwright/test";

const topLevel = ["Sid Search", "Library", "GitHub", "arXiv Search", "Forward pass", "Markets", "Launches", "AI leaderboards"];
const folders = ["Projects", "Other designs", "Games"];
const designs = ["Training run", "Terminal", "Journal"];
const games = ["Snake", "Mines", "Blocks", "Rank It", "Next Token"];
const documents = ["Resume.pdf", "README.txt", "Recycle Bin"];

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/api/v1/quote?*", (route) => route.fulfill({ json: { c: 230.36, dp: 0.84, t: 1788552000 } }));
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("https://s3.tradingview.com/**", (route) => route.abort());
  await page.route("https://datasets-server.huggingface.co/**", (route) => route.abort());
});

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function openStart(page: Page, style = "modern") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`./?view=os&style=${style}`);
  await expect(page.locator('.os-win[data-app="search"]')).toBeVisible();
  await page.locator(".os-start").click();
  return page.getByRole("dialog", { name: "Start menu" });
}

for (const style of ["modern", "retro"]) {
  test(`Start menu groups apps into collapsible folders in ${style} style`, async ({ page }) => {
    const menu = await openStart(page, style);
    const appList = menu.getByRole("list", { name: "Apps", exact: true });
    await expect(appList.locator(":scope > li > button")).toHaveText([...topLevel, ...folders]);
    await expect(menu.getByRole("list", { name: "Documents", exact: true }).getByRole("button")).toHaveText(documents);

    const folder = appList.getByRole("button", { name: "Games", exact: true });
    const sub = menu.locator(`#${await folder.getAttribute("aria-controls")}`);
    await expect(folder).toHaveAttribute("aria-expanded", "false");
    await expect(sub).toBeHidden();
    for (const title of [...designs, ...games]) await expect(appList.getByRole("button", { name: title, exact: true })).toHaveCount(0);

    const before = await folder.boundingBox();
    await folder.click();
    await expect(folder).toHaveAttribute("aria-expanded", "true");
    await expect(sub).toHaveAccessibleName("Games");
    await expect(sub.getByRole("button")).toHaveText(games);
    await expect(sub).toHaveCSS("border-left-style", style === "retro" ? "dotted" : "solid");
    expect(await folder.boundingBox(), "the folder stays under the pointer").toEqual(before);
    await folder.click();
    await expect(folder).toHaveAttribute("aria-expanded", "false");
    await expect(sub).toBeHidden();

    await folder.click();
    await sub.getByRole("button", { name: "Snake", exact: true }).click();
    await expect(page.locator('.os-win[data-app="snake"]')).toHaveClass(/is-active/);
    await expect(menu).toHaveCount(0);

    await page.locator(".os-start").click();
    await expect(menu.getByRole("button", { name: "Games", exact: true })).toHaveAttribute("aria-expanded", "false");
    const box = (await menu.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}

test("Start menu folders work from the keyboard", async ({ page }) => {
  const menu = await openStart(page);
  await expect(menu.getByRole("searchbox", { name: "Search apps" })).toBeFocused();
  await menu.getByRole("button", { name: "AI leaderboards", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("button", { name: "Projects", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  const designsFolder = menu.getByRole("button", { name: "Other designs", exact: true });
  await expect(designsFolder).toBeFocused();
  await page.keyboard.press("Tab");
  const gamesFolder = menu.getByRole("button", { name: "Games", exact: true });
  await expect(gamesFolder, "collapsed folders keep their apps out of the tab order").toBeFocused();

  await page.keyboard.press("Enter");
  await expect(gamesFolder).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(gamesFolder).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(gamesFolder).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("button", { name: "Snake", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".os-start")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu.getByRole("button", { name: "Games", exact: true })).toHaveAttribute("aria-expanded", "false");
});

test("Start search lists apps inside folders and names their folder", async ({ page }) => {
  const menu = await openStart(page);
  const search = menu.getByRole("searchbox", { name: "Search apps" });
  const results = menu.getByRole("list", { name: "Search results", exact: true });

  await search.fill("snake");
  await expect(menu.getByRole("list", { name: "Apps", exact: true })).toHaveCount(0);
  await expect(results.getByRole("button")).toHaveCount(1);
  const snake = results.getByRole("button", { name: "Snake", exact: true });
  await expect(snake).toContainText("in Games");
  await expect(snake).toHaveAccessibleDescription("in Games");

  await search.fill("games");
  await expect(results.getByRole("button")).toHaveCount(games.length);
  for (const title of games) await expect(results.getByRole("button", { name: title, exact: true })).toHaveAccessibleDescription("in Games");

  await search.fill("terminal");
  await expect(results.getByRole("button", { name: "Terminal", exact: true })).toHaveAccessibleDescription("in Other designs");

  await search.fill("resume");
  const resume = results.getByRole("button", { name: "Resume.pdf", exact: true });
  await expect(resume).toBeVisible();
  await expect(resume).toHaveAccessibleDescription("");

  await search.fill("no-such-app");
  await expect(results.getByRole("button")).toHaveCount(0);
  await expect(menu.getByRole("status")).toHaveText("No apps match this search.");

  await search.fill("");
  await expect(menu.getByRole("button", { name: "Games", exact: true })).toHaveAttribute("aria-expanded", "false");
  await search.fill("snake");
  await snake.click();
  await expect(page.locator('.os-win[data-app="snake"]')).toHaveClass(/is-active/);
});

test("Start menu documents open the README and resume", async ({ page }) => {
  const menu = await openStart(page);
  const docs = menu.getByRole("list", { name: "Documents", exact: true });
  await docs.getByRole("button", { name: "README.txt", exact: true }).click();
  await expect(page.locator('.os-win[data-app="readme"]')).toHaveClass(/is-active/);

  await page.locator(".os-start").click();
  await docs.getByRole("button", { name: "Resume.pdf", exact: true }).click();
  await expect(page.locator('.os-win[data-app="resume"]')).toHaveClass(/is-active/);
});

for (const style of ["modern", "retro"]) {
  for (const width of [390, 320]) {
    test(`phone home shows folders and opens their apps at ${width}px in ${style} style`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 760 });
      await page.goto(`./?view=os&style=${style}`);
      const home = page.locator(".os-home").getByRole("list", { name: "Apps", exact: true });
      await expect(home.locator(".os-icon__label")).toHaveText([...topLevel, ...folders, ...documents, "Settings"]);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      const clipped = await home.locator(".os-icon__label").evaluateAll((labels) => labels
        .filter((label) => label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight)
        .map((label) => label.textContent));
      expect(clipped).toEqual([]);

      await home.locator(".os-icon", { hasText: "Games" }).click();
      const folder = page.getByRole("list", { name: "Games apps", exact: true });
      await expect(folder.locator(".os-icon__label")).toHaveText(games);
      await folder.locator(".os-icon", { hasText: "Snake" }).click();
      const snake = page.locator('.os-win[data-app="snake"]');
      await expect(snake).toHaveClass(/is-active/);
      expect((await snake.boundingBox())?.width).toBe(width);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      await snake.getByRole("button", { name: "Home" }).click();
      await expect(page.locator(".os-home")).toBeVisible();
      await home.locator(".os-icon", { hasText: "Other designs" }).click();
      await expect(page.getByRole("list", { name: "Other designs apps", exact: true }).locator(".os-icon__label")).toHaveText(designs);
    });
  }
}
