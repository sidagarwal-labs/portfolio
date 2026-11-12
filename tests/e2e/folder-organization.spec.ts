import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/**", (route) => route.abort());
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=os");
  await expect(page.locator('.os-win[data-app="search"]')).toBeVisible();
});

test("custom nested folders organize apps across Start, Settings, and folder windows", async ({ page }) => {
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await menu.getByLabel("New folder name").fill("Personal");
  await menu.getByRole("button", { name: "Create folder" }).click();
  const personal = menu.getByRole("button", { name: "Personal", exact: true });
  await expect(personal).toBeVisible();
  const personalId = (await personal.getAttribute("aria-controls"))!.replace("os-menu-folder-", "");

  await menu.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.locator('.os-win[data-app="settings"]');
  await expect(settings.getByRole("heading", { name: "Folder organization" })).toBeVisible();
  await settings.getByLabel("Move Library to").selectOption({ label: "Personal" });
  const libraryRow = settings.locator('[data-folder-item="library"]');
  await libraryRow.getByRole("button", { name: "Move", exact: true }).click();

  await page.locator(".os-start").click();
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await page.locator(`.os-icons .os-icon[data-entry-id="${personalId}"]`).click();
  const personalWindow = page.locator('.os-win[data-folder-id^="custom-folder-"]');
  await expect(personalWindow.getByRole("list", { name: "Personal apps" }).getByRole("button", { name: "Library" })).toBeVisible();

  await personalWindow.getByLabel("New subfolder").fill("Nested");
  await personalWindow.getByRole("button", { name: "Create", exact: true }).click();

  await page.locator(".os-start").click();
  const nestedMove = page.getByRole("dialog", { name: "Start menu" });
  await nestedMove.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(settings.getByLabel("Move Library to").locator("option", { hasText: "Personal / Nested" })).toHaveCount(1);
  const destination = settings.getByLabel("Move Library to");
  const nestedFolderId = await destination.locator("option", { hasText: "Personal / Nested" }).getAttribute("value");
  expect(nestedFolderId).toBeTruthy();
  await destination.selectOption(nestedFolderId!);
  await libraryRow.getByRole("button", { name: "Move", exact: true }).click();

  await page.reload();
  await page.locator(".os-start").click();
  const reloadedMenu = page.getByRole("dialog", { name: "Start menu" });
  const personalFolder = reloadedMenu.getByRole("button", { name: "Personal", exact: true });
  await personalFolder.click();
  const personalContents = reloadedMenu.locator(`#${await personalFolder.getAttribute("aria-controls")}`);
  const nestedFolder = personalContents.getByRole("button", { name: /^Nested/ });
  await nestedFolder.click();
  const nestedContents = reloadedMenu.locator(`#${await nestedFolder.getAttribute("aria-controls")}`);
  await expect(nestedContents.getByRole("button", { name: /^Library/ })).toBeVisible();
  await nestedContents.getByRole("button", { name: /^Library/ }).click();
  await expect(page.locator('.os-win[data-app="library"]')).toHaveClass(/is-active/);
});

test("desktop icons can be dragged into a custom folder", async ({ page }) => {
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await menu.getByLabel("New folder name").fill("Drop target");
  await menu.getByRole("button", { name: "Create folder" }).click();
  const folderButton = menu.getByRole("button", { name: "Drop target", exact: true });
  const controls = await folderButton.getAttribute("aria-controls");
  expect(controls).toMatch(/^os-menu-folder-custom-folder-/);
  const folderId = controls!.replace("os-menu-folder-", "");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();

  const library = page.locator(`.os-icons .os-icon[data-entry-id="library"]`);
  const folder = page.locator(`.os-icons .os-icon[data-entry-id="${folderId}"]`);
  const from = (await library.boundingBox())!;
  const to = (await folder.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(library).toHaveCount(0);
  await folder.click();
  await expect(page.getByRole("list", { name: "Drop target apps" }).getByRole("button", { name: "Library" })).toBeVisible();
});
