import { expect, test, type Page } from "@playwright/test";

const readerWin = '.os-win[data-app="reader"]';

async function openReaderFromStart(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await menu.getByRole("list", { name: "Apps", exact: true }).getByRole("button", { name: "Projects", exact: true }).click();
  await menu.getByRole("list", { name: "Projects", exact: true }).getByRole("button", { name: "Reader", exact: true }).click();
  const win = page.locator(readerWin);
  await expect(win).toHaveClass(/is-active/);
  return win;
}

test("Reader lists the Microsoft summaries with text sizes and links to each original", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openReaderFromStart(page);
  await expect(page.locator(".os-icons .os-icon", { hasText: "Reader" })).toHaveCount(0);

  const nav = win.getByRole("navigation", { name: "Articles" });
  await expect(nav.locator(".rdr__nav-title")).toHaveText([
    "Microsoft 365 Copilot",
    "Copilot in Power BI",
    "Viva Engage in Microsoft 365 Copilot",
    "Microsoft 365 Copilot connectors"
  ]);
  const article = win.getByRole("article", { name: "Microsoft 365 Copilot", exact: true });
  await expect(article).toBeVisible();
  await expect(article.getByRole("complementary", { name: "My part" })).toContainText("Senior Product Manager");
  await expect(win.getByText("Original summary", { exact: true })).toBeVisible();
  const original = win.locator(".rdr__bar").getByRole("link", { name: "Open original" });
  await expect(original).toHaveAttribute("href", "https://www.microsoft.com/en-us/microsoft-365-copilot");
  await expect(original).toHaveAttribute("target", "_blank");

  await nav.getByRole("button", { name: /^Microsoft 365 Copilot connectors/ }).click();
  await expect(nav.getByRole("button", { name: /^Microsoft 365 Copilot connectors/ })).toHaveAttribute("aria-current", "page");
  const connectors = win.getByRole("article", { name: "Microsoft 365 Copilot connectors" });
  await expect(connectors).toContainText("Source updated September 30, 2026");
  await expect(connectors).toContainText("Federated connectors");
  await expect(original).toHaveAttribute("href", "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-copilot-connector");
  await expect(connectors.locator(".rdr__note a")).toHaveAttribute("href", "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-copilot-connector");

  const size = () => connectors.evaluate((element) => getComputedStyle(element).fontSize);
  expect(await size()).toBe("16px");
  const larger = win.getByRole("button", { name: "Larger text" });
  const smaller = win.getByRole("button", { name: "Smaller text" });
  await larger.click();
  expect(await size()).toBe("17px");
  for (let step = 0; step < 6; step += 1) if (await smaller.isEnabled()) await smaller.click();
  await expect(smaller).toBeDisabled();
  expect(await size()).toBe("14px");
});

test("Reader fits a phone with the article list above the summary", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("./?view=os");
  await page.locator(".os-home .os-icon", { hasText: "Projects" }).click();
  await page.getByRole("list", { name: "Projects apps", exact: true }).locator(".os-icon", { hasText: "Reader" }).click();
  const win = page.locator(readerWin);
  const nav = win.getByRole("navigation", { name: "Articles" });
  const article = win.getByRole("article");
  await expect(article).toBeVisible();
  const navBox = (await nav.boundingBox())!;
  const articleBox = (await article.boundingBox())!;
  expect(navBox.y + navBox.height).toBeLessThanOrEqual(articleBox.y + 1);
  expect(articleBox.width).toBeGreaterThan(340);
  await nav.getByRole("button", { name: /^Viva Engage/ }).click();
  await expect(win.getByRole("article", { name: "Viva Engage in Microsoft 365 Copilot" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
