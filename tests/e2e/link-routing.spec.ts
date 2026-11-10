import { expect, test, type Page } from "@playwright/test";

const searchWin = '.os-win[data-app="search"]';

/* Records every new tab or window, so routed links can prove they stayed inside Lab OS. */
function trackNewTabs(page: Page) {
  const opened: string[] = [];
  page.context().on("page", (tab) => opened.push(tab.url()));
  return opened;
}

async function openSearch(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com|avatars\.githubusercontent\.com)\//, (route) => route.abort());
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.goto("./");
  const frame = page.frameLocator(`${searchWin} iframe`);
  await expect(frame.locator("#se-query")).toHaveValue("Sid Agarwal");
  return frame;
}

/* The taskbar button minimizes the active window, so only click it when another window is in front. */
async function bringSearchForward(page: Page) {
  const win = page.locator(searchWin);
  if (!/\bis-active\b/.test((await win.getAttribute("class")) ?? "")) await page.locator(".os-task", { hasText: "Sid Search" }).click();
  await expect(win).toHaveClass(/is-active/);
}

test("Microsoft links in Sid Search open their summaries in one Reader window", async ({ page }) => {
  const opened = trackNewTabs(page);
  const frame = await openSearch(page);

  await frame.getByRole("link", { name: "Power BI", exact: true }).first().click();
  const reader = page.locator('.os-win[data-app="reader"]');
  await expect(reader).toHaveClass(/is-active/);
  await expect(reader.getByRole("article", { name: "Copilot in Power BI" })).toBeVisible();
  await expect(reader.getByRole("heading", { name: "Copilot in Power BI", level: 2 })).toBeFocused();

  await bringSearchForward(page);
  await frame.getByRole("link", { name: "Copilot Connectors", exact: true }).first().click();
  await expect(reader).toHaveClass(/is-active/);
  await expect(reader.getByRole("article", { name: "Microsoft 365 Copilot connectors" })).toBeVisible();
  await expect(reader).toHaveCount(1);
  expect(opened).toEqual([]);
});

test("book and podcast links open the Library on that title", async ({ page }) => {
  const opened = trackNewTabs(page);
  const frame = await openSearch(page);

  await frame.locator("#library").getByRole("link", { name: "The Nvidia Way" }).click();
  const library = page.locator('.os-win[data-app="library"]');
  await expect(library).toHaveClass(/is-active/);
  await expect(library.getByRole("complementary", { name: "The Nvidia Way" })).toBeVisible();

  await bringSearchForward(page);
  await frame.locator("#se-query").fill("Acquired");
  await frame.locator("#se-query").press("Enter");
  await frame.locator('a[href^="https://open.spotify.com/show/7Fj0XEuUQLUqoMZQdsLXqp"]').first().click();
  await expect(library.getByRole("complementary", { name: "Acquired" })).toBeVisible();
  await expect(library).toHaveCount(1);
  expect(opened).toEqual([]);
});

test("links to Sid's GitHub open the GitHub app, research notes open in its file view, and other pages open a new tab", async ({ page }) => {
  await page.context().route(/^https:\/\/(www\.linkedin\.com|github\.com)\//, (route) => route.fulfill({ contentType: "text/html", body: "<p>Outside site</p>" }));
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({ contentType: "text/plain; charset=utf-8", headers: { "access-control-allow-origin": "*" }, body: "# Routed Note\n\nFrom Sid Search.\n" })
  );
  const frame = await openSearch(page);

  await frame.locator("#contact").getByRole("link", { name: "GitHub", exact: true }).click();
  const github = page.locator('.os-win[data-app="github"]');
  await expect(github).toHaveClass(/is-active/);
  await expect(github.getByRole("heading", { name: "Sid Agarwal", level: 3 })).toBeVisible();
  await page.getByRole("button", { name: "Close GitHub" }).click();
  await expect(github).toHaveCount(0);

  await bringSearchForward(page);
  await frame.getByRole("link", { name: "arXiv Search on GitHub" }).first().click();
  await expect(github).toHaveClass(/is-active/);
  const repo = github.locator('.gh-repo[data-repo="arxiv-search"]');
  await expect(repo).toHaveClass(/is-highlighted/);
  await expect(repo).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "Close GitHub" }).click();

  await page.locator(".os-quick").getByRole("link", { name: "GitHub", exact: true }).click();
  await expect(github).toHaveClass(/is-active/);

  await bringSearchForward(page);
  const linkedIn = page.context().waitForEvent("page");
  await frame.locator("#contact").getByRole("link", { name: "LinkedIn", exact: true }).click();
  await expect(await linkedIn).toHaveURL("https://www.linkedin.com/in/sid-agarwal-labs/");

  await bringSearchForward(page);
  await frame.locator('a[href^="https://github.com/sidagarwal-labs/models/blob/"][href$=".md"]').first().click();
  await expect(github).toHaveClass(/is-active/);
  await expect(github.getByRole("article", { name: "Routed Note" })).toBeVisible();
  await expect(github).toHaveCount(1);

  // Code and other files on GitHub are not routed.
  const codeUrl = "https://github.com/sidagarwal-labs/models/blob/main/src/model.py";
  await bringSearchForward(page);
  await frame.locator("body").evaluate((body, href) => {
    const link = Object.assign(document.createElement("a"), { href, textContent: "Model code" });
    link.style.cssText = "position: fixed; top: 8px; left: 8px; z-index: 99999; background: #fff;";
    body.append(link);
  }, codeUrl);
  const code = page.context().waitForEvent("page");
  await frame.getByRole("link", { name: "Model code" }).click();
  await expect(await code).toHaveURL(codeUrl);
  await expect(github.getByRole("article", { name: "Routed Note" })).toBeAttached();
  await expect(github).toHaveCount(1);
});
