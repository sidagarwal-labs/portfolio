import { expect, test, type Locator, type Page } from "@playwright/test";

const icon = (page: Page, name: string) => page.locator(".os-icons").getByRole("button", { name, exact: true });
const editor = (page: Page) => page.getByRole("textbox", { name: "Folder name", exact: true });
const folderWindow = (page: Page, id: string) => page.locator(`.os-win[data-folder-id="${id}"]`);
const bin = (page: Page) => page.locator('.os-win[data-app="recyclebin"]');
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("lab-os-folders-v1") ?? "null"));

async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function startDrag(page: Page, source: Locator, target: Locator) {
  const from = await center(source);
  const to = await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8);
  await expect(page.locator(".os-entry-drag")).toBeVisible();
  await page.mouse.move(to.x, to.y, { steps: 10 });
}

async function placeWindow(page: Page, window: Locator, x: number, y: number) {
  const box = (await window.boundingBox())!;
  await page.mouse.move(box.x + 120, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 18, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await window.boundingBox())!.x)).toBe(x);
}

async function create(page: Page, name: string, parent?: Locator) {
  if (parent) await parent.locator(".os-folder-toolbar").getByRole("button", { name: "New folder", exact: true }).click();
  else await page.locator(".os-icons").press("Control+Shift+n");
  await expect(editor(page)).toBeFocused();
  await editor(page).fill(name);
  await editor(page).press("Enter");
  const entry = (parent ?? page.locator(".os-icons")).getByRole("button", { name, exact: true });
  return (await entry.getAttribute("data-entry-id"))!;
}

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/**", (route) => route.abort());
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com|avatars\.githubusercontent\.com|s3\.tradingview\.com|datasets-server\.huggingface\.co)\//, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto("./?view=os");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
});

for (const style of ["modern", "retro"]) {
  test(`${style}: context menus create folders and rename inline, with keyboard navigation`, async ({ page }) => {
    await page.goto(`./?view=os&style=${style}`);
    await page.getByRole("button", { name: "Show desktop", exact: true }).click();
    const desktop = page.locator(".os-desktop");
    const bounds = (await desktop.boundingBox())!;
    await desktop.click({ button: "right", position: { x: bounds.width - 6, y: bounds.height - 6 } });
    const menu = page.getByRole("menu", { name: "Folder actions" });
    const box = (await menu.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(1800);
    expect(box.y + box.height).toBeLessThanOrEqual(1000);
    await expect(menu.getByRole("menuitem", { name: /^New folder/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(editor(page)).toBeFocused();
    await expect(editor(page)).toHaveValue("New folder");
    await editor(page).fill("Work");
    await editor(page).press("Enter");
    await expect(icon(page, "Work")).toBeFocused();
    await icon(page, "Work").press("F2");
    await editor(page).fill("Cancelled");
    await editor(page).press("Escape");
    await expect(icon(page, "Work")).toBeFocused();
    await icon(page, "Work").press("Shift+F10");
    await expect(menu.getByRole("menuitem", { name: "Open", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: /^Rename/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await editor(page).fill("My work");
    await editor(page).press("Enter");
    await expect(icon(page, "My work")).toBeVisible();
    await page.reload();
    await expect(icon(page, "My work")).toBeVisible();
    await expect(page.locator(".os-folder-name")).toHaveCount(0);
  });
}

test("inline naming rejects blank and duplicate names; default names are unique", async ({ page }) => {
  await create(page, "Work");
  await page.locator(".os-icons").press("Control+Shift+n");
  await editor(page).fill("work");
  await editor(page).press("Enter");
  await expect(page.getByRole("alert")).toContainText("already exists");
  await expect(editor(page)).toBeFocused();
  await editor(page).fill("   ");
  await editor(page).press("Enter");
  await expect(page.getByRole("alert")).toContainText("1–32 characters");
  await editor(page).press("Escape");
  await expect(icon(page, "New folder")).toBeVisible();
  await page.locator(".os-icons").press("Control+Shift+n");
  await expect(editor(page)).toHaveValue("New folder (2)");
  await editor(page).press("Escape");
  await expect(icon(page, "New folder (2)")).toBeVisible();
  expect(new Set((await saved(page)).root).size).toBe((await saved(page)).root.length);
});

test("Recycle Bin preserves an entire nested folder across reload and restores it without duplicating apps", async ({ page }) => {
  const workId = await create(page, "Work");
  await icon(page, "Work").click();
  const work = folderWindow(page, workId);
  const childId = await create(page, "Child", work);
  await work.getByRole("button", { name: "Child", exact: true }).click();
  const child = folderWindow(page, childId);
  await icon(page, "Library").press("Control+x");
  await child.locator(".os-folder-window").press("Control+v");
  await icon(page, "Games").press("Control+x");
  await work.locator(".os-folder-window").press("Control+v");
  const originalIndex = (await saved(page)).root.indexOf(workId);
  await icon(page, "Work").press("Delete");
  await expect(work).toHaveCount(0);
  await expect(child).toHaveCount(0);
  await expect(icon(page, "Work")).toHaveCount(0);
  await expect(icon(page, "Library")).toHaveCount(0);
  await expect(icon(page, "Games")).toHaveCount(0);
  expect((await saved(page)).trash).toEqual([{ id: workId, parent: null, index: originalIndex }]);
  await page.locator(".os-start").click();
  const start = page.getByRole("dialog", { name: "Start menu" });
  await start.getByRole("searchbox", { name: "Search apps" }).fill("Library");
  await expect(start.getByRole("list", { name: "Search results" }).getByRole("button", { name: "Library", exact: true })).toHaveCount(0);
  await page.reload();
  await icon(page, "Recycle Bin").click();
  await expect(bin(page).getByRole("button", { name: "Restore Work", exact: true })).toBeVisible();
  await bin(page).getByRole("button", { name: "Restore Work", exact: true }).click();
  await expect(bin(page).getByRole("status")).toHaveText("Restored Work to Desktop.");
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await icon(page, "Work").click();
  await expect(work.getByRole("button", { name: "Games", exact: true })).toBeVisible();
  await work.getByRole("button", { name: "Child", exact: true }).click();
  await expect(child.getByRole("button", { name: "Library", exact: true })).toBeVisible();
  expect((await saved(page)).trash).toEqual([]);
  await page.reload();
  expect((await saved(page)).folders[childId].items).toEqual(["library"]);
  await expect(icon(page, "Library")).toHaveCount(0);
});

test("restoring uses the original parent, or Desktop with a unique name when that parent is recycled", async ({ page }) => {
  const parentId = await create(page, "Parent");
  await icon(page, "Parent").click();
  const parent = folderWindow(page, parentId);
  const childId = await create(page, "Child", parent);
  await parent.getByRole("button", { name: "Child", exact: true }).press("Delete");
  await icon(page, "Recycle Bin").click();
  await bin(page).getByRole("button", { name: "Restore Child", exact: true }).click();
  await expect(bin(page).getByRole("status")).toHaveText("Restored Child to Parent.");
  await parent.getByRole("button", { name: "Child", exact: true }).press("Delete");
  await icon(page, "Parent").press("Delete");
  await create(page, "Child");
  await icon(page, "Recycle Bin").click();
  await bin(page).getByRole("button", { name: "Restore Child", exact: true }).click();
  await expect(bin(page).getByRole("status")).toHaveText("Restored Child (2) to Desktop.");
  await expect(icon(page, "Child (2)")).toHaveAttribute("data-entry-id", childId);
  await bin(page).getByRole("button", { name: "Restore Parent", exact: true }).click();
  await page.reload();
  await expect(icon(page, "Parent")).toBeVisible();
  await expect(icon(page, "Child")).toBeVisible();
  await expect(icon(page, "Child (2)")).toBeVisible();
  expect((await saved(page)).folders[parentId].items).toEqual([]);
});

test("built-in apps and folders recycle and restore to their old slots, while the Recycle Bin stays on the desktop", async ({ page }) => {
  const slot = (name: string) => icon(page, name).boundingBox();
  const gamesSlot = await slot("Games");
  const readmeSlot = await slot("README.txt");
  const searchSlot = await slot("Sid Search");
  await icon(page, "Games").click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Move to Recycle Bin/ }).click();
  await expect(icon(page, "Games")).toHaveCount(0);
  await expect(page.locator(".os-folder-notice")).toContainText("Moved Games to Recycle Bin.");
  await icon(page, "README.txt").press("Delete");
  await expect(icon(page, "README.txt")).toHaveCount(0);
  expect(await slot("Sid Search")).toEqual(searchSlot);
  expect((await saved(page)).trash.map(({ id }: { id: string }) => id)).toEqual(["games", "readme"]);
  await page.locator(".os-start").click();
  const start = page.getByRole("dialog", { name: "Start menu" });
  await start.getByRole("searchbox", { name: "Search apps" }).fill("Snake");
  await expect(start.getByRole("list", { name: "Search results" }).getByRole("button", { name: "Snake", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await icon(page, "Recycle Bin").press("Delete");
  await expect(page.getByRole("alert")).toContainText("Recycle Bin stays on the desktop");
  await expect(icon(page, "Recycle Bin")).toBeVisible();
  await icon(page, "Recycle Bin").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: /^Move to Recycle Bin/ })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /^Cut/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await icon(page, "Recycle Bin").click();
  await expect(bin(page).getByRole("list", { name: "Recycled items" }).getByRole("listitem")).toHaveText([
    /README\.txt\s*App · From Desktop/,
    /Games\s*\d+ items · From Desktop/
  ]);
  await bin(page).getByRole("button", { name: "Restore all", exact: true }).click();
  await expect(bin(page).getByRole("status")).toHaveText("Restored 2 items.");
  await expect(bin(page)).toContainText("The Recycle Bin is empty.");
  await expect(bin(page).getByRole("button", { name: "Restore all", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  expect(await slot("Games")).toEqual(gamesSlot);
  expect(await slot("README.txt")).toEqual(readmeSlot);
  expect((await saved(page)).trash).toEqual([]);
  await icon(page, "Games").press("F2");
  await editor(page).fill("Fun");
  await editor(page).press("Enter");
  await expect(icon(page, "Fun")).toHaveAttribute("data-entry-id", "games");

  const id = await create(page, "Destination");
  await icon(page, "Destination").click();
  await icon(page, "Recycle Bin").press("Control+x");
  await folderWindow(page, id).locator(".os-folder-window").press("Control+v");
  await expect(page.getByRole("alert")).toContainText("Recycle Bin stays on the desktop");
  await expect(icon(page, "Recycle Bin")).toBeVisible();
});

test("cutting items, opening the Recycle Bin, and pressing Ctrl+V recycles them", async ({ page }) => {
  await icon(page, "Library").click({ modifiers: ["Control"] });
  await icon(page, "GitHub").click({ modifiers: ["Control"] });
  await page.keyboard.press("Control+x");
  await expect(icon(page, "Library")).toHaveClass(/is-cut/);
  await icon(page, "Recycle Bin").click();
  await expect(bin(page).locator(".os-recycle-bin")).toBeFocused();
  await page.keyboard.press("Control+v");
  await expect(icon(page, "Library")).toHaveCount(0);
  await expect(icon(page, "GitHub")).toHaveCount(0);
  await expect(page.locator(".os-folder-notice")).toContainText("Moved 2 items to Recycle Bin.");
  const items = bin(page).getByRole("list", { name: "Recycled items" }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(bin(page).getByRole("button", { name: "Paste", exact: true })).toHaveCount(0);

  await placeWindow(page, bin(page), 900, 120);
  await icon(page, "Sid Search").click({ modifiers: ["Control"] });
  await icon(page, "README.txt").click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  await expect(icon(page, "Sid Search")).toHaveCount(0);
  await expect(icon(page, "README.txt")).toHaveCount(0);
  await expect(items).toHaveCount(4);
  await expect(items.first()).toContainText(/README\.txt|Sid Search/);
  await bin(page).getByRole("button", { name: "Restore GitHub", exact: true }).click();
  await expect(bin(page).getByRole("status")).toHaveText("Restored GitHub to Desktop.");
  await expect(bin(page).locator(".os-recycle-bin")).toBeFocused();
  await expect(icon(page, "GitHub")).toBeVisible();
});

test("Ctrl+V goes to the window you last clicked, the focused Recycle Bin icon, or explains where paste works", async ({ page }) => {
  const id = await create(page, "Inbox");
  await icon(page, "Inbox").click();
  const folder = folderWindow(page, id);
  await placeWindow(page, folder, 980, 80);
  await icon(page, "Games").press("Control+x");
  await icon(page, "README.txt").click();
  const readme = page.locator('.os-win[data-app="readme"]');
  await placeWindow(page, readme, 420, 80);
  await readme.locator(".os-note p").first().click();
  await page.keyboard.press("Control+v");
  await expect(page.locator(".os-folder-notice")).toContainText("Paste works on the desktop, in a folder, or in the Recycle Bin.");
  await expect(icon(page, "Games")).toHaveClass(/is-cut/);
  await folder.locator(".os-win__title").click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Control+v");
  await expect(folder.getByRole("button", { name: "Games", exact: true })).toBeVisible();
  await expect(icon(page, "Games")).toHaveCount(0);

  await icon(page, "Library").press("Control+x");
  await icon(page, "Recycle Bin").press("Control+v");
  await expect(icon(page, "Library")).toHaveCount(0);
  expect((await saved(page)).trash.map(({ id }: { id: string }) => id)).toEqual(["library"]);
});

test("dragging icons onto the Recycle Bin icon or into its window recycles them", async ({ page }) => {
  await startDrag(page, icon(page, "Library"), icon(page, "Recycle Bin"));
  await expect(icon(page, "Recycle Bin")).toHaveAttribute("data-drop-state", "valid");
  await expect(page.locator(".os-entry-drag")).toContainText("Move to Recycle Bin");
  await page.mouse.up();
  await expect(icon(page, "Library")).toHaveCount(0);
  await icon(page, "Recycle Bin").click();
  await placeWindow(page, bin(page), 900, 120);
  const content = bin(page).locator(".os-recycle-bin");
  await startDrag(page, icon(page, "GitHub"), content);
  await expect(content).toHaveAttribute("data-drop-state", "valid");
  await page.mouse.up();
  await expect(icon(page, "GitHub")).toHaveCount(0);
  await expect(bin(page).getByRole("list", { name: "Recycled items" }).getByRole("listitem")).toHaveText([/GitHub/, /Library/]);
  await startDrag(page, icon(page, "Recycle Bin"), content);
  await expect(page.locator(".os-entry-drag")).toContainText("Recycle Bin stays on the desktop");
  await page.mouse.up();
  await expect(icon(page, "Recycle Bin")).toBeVisible();
  await bin(page).getByRole("button", { name: "Restore all", exact: true }).click();
  await expect(icon(page, "Library")).toBeVisible();
  await expect(icon(page, "GitHub")).toBeVisible();
});

test("restoring an app inside a folder puts it back in its original place in that folder", async ({ page }) => {
  await icon(page, "Games").click();
  const games = folderWindow(page, "games");
  const before = await games.locator(".os-folder .os-icon").evaluateAll((items) => items.map((item) => item.getAttribute("data-entry-id")));
  await games.locator(`.os-icon[data-entry-id="${before[1]}"]`).press("Delete");
  await games.locator(`.os-icon[data-entry-id="${before[2]}"]`).press("Delete");
  await expect(games.locator(".os-folder .os-icon")).toHaveCount(before.length - 2);
  await page.getByRole("button", { name: "Open Settings", exact: true }).click();
  await page.getByRole("region", { name: "Folder organization" }).getByRole("button", { name: "Open Recycle Bin", exact: true }).click();
  await expect(bin(page)).toContainText("App · From Games");
  await bin(page).getByRole("button", { name: "Restore all", exact: true }).click();
  await expect(games.locator(".os-folder .os-icon")).toHaveCount(before.length);
  expect(await games.locator(".os-folder .os-icon").evaluateAll((items) => items.map((item) => item.getAttribute("data-entry-id")))).toEqual(before);
});

test("existing folder layouts migrate without losing names, locations, or apps", async ({ page }) => {
  const id = await create(page, "Legacy");
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("lab-os-folders-v1")!);
    delete state.trash;
    state.root = state.root.filter((entry: string) => entry !== "recyclebin");
    localStorage.setItem("lab-os-folders-v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(icon(page, "Legacy")).toHaveAttribute("data-entry-id", id);
  await expect(icon(page, "Recycle Bin")).toBeVisible();
  await create(page, "After migration");
  const state = await saved(page);
  expect(state.trash).toEqual([]);
  expect(state.root.filter((entry: string) => entry === "recyclebin")).toHaveLength(1);
  expect(state.folders[id].name).toBe("Legacy");
});

test("a stale cut selection cannot pull contents out of the Recycle Bin", async ({ page }) => {
  const id = await create(page, "Cut folder");
  await icon(page, "Cut folder").click();
  const folder = folderWindow(page, id);
  await icon(page, "Library").press("Control+x");
  await folder.locator(".os-folder-window").press("Control+v");
  await folder.getByRole("button", { name: "Library", exact: true }).press("Control+x");
  await icon(page, "Cut folder").press("Delete");
  const before = await saved(page);
  await page.locator(".os-icons").press("Control+v");
  await expect(page.getByRole("alert")).toContainText("Restore items from the Recycle Bin");
  expect(await saved(page)).toEqual(before);
  await expect(icon(page, "Library")).toHaveCount(0);
});

test("folder naming keeps the storage-unavailable warning visible after editing finishes", async ({ page }) => {
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "lab-os-folders-v1") throw new DOMException("Quota exceeded", "QuotaExceededError");
      setItem.call(this, key, value);
    };
  });
  await create(page, "Unsaved");
  await expect(icon(page, "Unsaved")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("browser storage is unavailable");
  expect(await saved(page)).toBeNull();
  await page.reload();
  await expect(icon(page, "Unsaved")).toHaveCount(0);
});

test("invalid saved Recycle Bin data logs a warning rather than dropping or duplicating apps", async ({ page }) => {
  const id = await create(page, "Invalid");
  await page.evaluate((folderId) => {
    const state = JSON.parse(localStorage.getItem("lab-os-folders-v1")!);
    state.trash = [{ id: folderId, parent: null, index: 0 }];
    localStorage.setItem("lab-os-folders-v1", JSON.stringify(state));
  }, id);
  const warnings: string[] = [];
  page.on("console", (message) => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.reload();
  await expect(icon(page, "Library")).toBeVisible();
  await expect(icon(page, "Recycle Bin")).toHaveCount(1);
  await expect(icon(page, "Invalid")).toHaveCount(0);
  expect(warnings.some((message) => message.includes("Saved folder organization could not be read"))).toBe(true);
});

test("Reset all clears the Recycle Bin and returns every app to its default folder", async ({ page }) => {
  const id = await create(page, "Temporary");
  await icon(page, "Temporary").click();
  await icon(page, "Library").press("Control+x");
  await folderWindow(page, id).locator(".os-folder-window").press("Control+v");
  await icon(page, "Temporary").press("Delete");
  await page.getByRole("button", { name: "Open Settings", exact: true }).click();
  const settings = page.locator('.os-win[data-app="settings"]');
  await settings.getByRole("button", { name: "Reset all Lab OS settings…" }).click();
  await settings.getByRole("button", { name: "Reset everything", exact: true }).click();
  await expect(icon(page, "Library")).toBeVisible();
  await icon(page, "Recycle Bin").click();
  await expect(bin(page)).toContainText("The Recycle Bin is empty.");
  expect(await saved(page)).toBeNull();
});

test.describe("touch folder actions", () => {
  test.use({ hasTouch: true });
  for (const style of ["modern", "retro"]) {
    test(`${style}: phone buttons create, rename, recycle and restore without right-click`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.goto(`./?view=os&style=${style}`);
      const home = page.locator(".os-home");
      await home.getByRole("button", { name: "New folder", exact: true }).tap();
      await editor(page).fill("Phone folder");
      await editor(page).press("Enter");
      await home.getByRole("button", { name: "Actions for Phone folder", exact: true }).tap();
      await page.getByRole("menuitem", { name: /^Rename/ }).tap();
      await editor(page).fill("Phone notes");
      await editor(page).press("Enter");
      await home.getByRole("button", { name: "Actions for Phone notes", exact: true }).tap();
      await page.getByRole("menuitem", { name: /^Move to Recycle Bin/ }).tap();
      await expect(home.getByRole("button", { name: "Phone notes", exact: true })).toHaveCount(0);
      await home.getByRole("button", { name: "Recycle Bin", exact: true }).tap();
      await bin(page).getByRole("button", { name: "Restore Phone notes", exact: true }).tap();
      await bin(page).getByRole("button", { name: "Home", exact: true }).tap();
      await expect(home.getByRole("button", { name: "Phone notes", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  }
});
