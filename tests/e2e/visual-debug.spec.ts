import { expect, test } from "@playwright/test";

/**
 * Visual diagnosis — captures screenshots at every section to inspect:
 *  - Ground / city colors
 *  - Scene centering (Moon, Mars, Spaceship, ISS)
 *  - Camera transition smoothness
 */

test.describe("visual diagnosis screenshots", () => {
  test("capture each section from nav clicks", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();
    // Wait for 3D scene to initialize
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "test-results/debug-01-home.png", fullPage: false });

    const nav = page.getByRole("navigation", { name: "Primary" });

    // Experience (Moon)
    await nav.getByRole("link", { name: "Experience", exact: true }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/debug-02-experience.png", fullPage: false });

    // Projects (Mars)
    await nav.getByRole("link", { name: "Projects", exact: true }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/debug-03-projects.png", fullPage: false });

    // Books (Spaceship)
    await nav.getByRole("link", { name: "Books", exact: true }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/debug-04-books.png", fullPage: false });

    // Contact (ISS)
    await nav.getByRole("link", { name: "Contact", exact: true }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/debug-05-contact.png", fullPage: false });

    // Back to Home
    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/debug-06-back-to-home.png", fullPage: false });
  });
});
