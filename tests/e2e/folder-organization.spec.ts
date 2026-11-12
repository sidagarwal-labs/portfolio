import { expect, test, type Locator, type Page } from "@playwright/test";

type Point = { x: number; y: number };
const desktopIcon = (page: Page, id: string) => page.locator(`.os-icons .os-icon[data-entry-id="${id}"]`);
const folderWindow = (page: Page, id: string) => page.locator(`.os-win[data-folder-id="${id}"]`);
const folderIcon = (window: Locator, id: string) => window.locator(`.os-folder .os-icon[data-entry-id="${id}"]`);
const savedFolders = (page: Page) => page.evaluate(() => localStorage.getItem("lab-os-folders-v1"));

async function center(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function startDrag(page: Page, source: Locator, target: Locator | Point) {
  const from = await center(source);
  const to = "boundingBox" in target ? await center(target) : target;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8);
  await expect(page.locator(".os-entry-drag")).toBeVisible();
  await page.mouse.move(to.x, to.y, { steps: 10 });
}

async function drag(page: Page, source: Locator, target: Locator | Point) {
  await startDrag(page, source, target);
  await page.mouse.up();
  await expect(page.locator(".os-entry-drag")).toHaveCount(0);
}

async function createFolder(page: Page, name: string) {
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await menu.getByLabel("New folder name").fill(name);
  await menu.getByRole("button", { name: "Create folder" }).click();
  const controls = await menu.getByRole("button", { name, exact: true }).getAttribute("aria-controls");
  expect(controls).toMatch(/^os-menu-folder-custom-folder-/);
  await page.locator(".os-start").click();
  return controls!.replace("os-menu-folder-", "");
}

async function createSubfolder(window: Locator, name: string) {
  await window.getByLabel("New subfolder").fill(name);
  await window.getByRole("button", { name: "Create", exact: true }).click();
  const id = await window.getByRole("list").getByRole("button", { name, exact: true }).getAttribute("data-entry-id");
  expect(id).toMatch(/^custom-folder-/);
  return id!;
}

async function placeWindow(page: Page, window: Locator, x: number, y: number) {
  const box = (await window.boundingBox())!;
  await page.mouse.move(box.x + 120, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 18, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await window.boundingBox())!.x)).toBe(x);
}

async function folderBackground(window: Locator): Promise<Point> {
  const box = (await window.locator(".os-folder-window").boundingBox())!;
  return { x: box.x + box.width - 16, y: box.y + box.height - 16 };
}

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/**", (route) => route.abort());
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto("./?view=os");
  await expect(page.locator('.os-win[data-app="search"]')).toBeVisible();
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
});

for (const style of ["modern", "retro"]) {
  test(`${style}: drag into a folder icon and back to the desktop without reshuffling icons`, async ({ page }) => {
    await page.goto(`./?view=os&style=${style}`);
    await page.getByRole("button", { name: "Show desktop", exact: true }).click();
    const id = await createFolder(page, "Personal");
    const githubBefore = await desktopIcon(page, "github").boundingBox();
    await drag(page, desktopIcon(page, "library"), desktopIcon(page, id));
    await expect(desktopIcon(page, "library")).toHaveCount(0);
    await expect(page.locator('.os-win[data-app="library"]')).toHaveCount(0);
    await desktopIcon(page, id).click();
    const window = folderWindow(page, id);
    await expect(window.locator("select")).toHaveCount(0);
    await expect(window.getByRole("button", { name: "Move", exact: true })).toHaveCount(0);
    expect((await folderIcon(window, "library").boundingBox())!.height).toBeLessThan(112);

    await drag(page, folderIcon(window, "library"), { x: 1510, y: 820 });
    await expect(folderIcon(window, "library")).toHaveCount(0);
    const libraryAfter = (await desktopIcon(page, "library").boundingBox())!;
    expect(Math.abs(libraryAfter.x - 1510)).toBeLessThan(92);
    expect(Math.abs(libraryAfter.y - 820)).toBeLessThan(92);
    expect(await desktopIcon(page, "github").boundingBox()).toEqual(githubBefore);
    await page.reload();
    await page.getByRole("button", { name: "Show desktop", exact: true }).click();
    expect(await desktopIcon(page, "library").boundingBox()).toEqual(libraryAfter);
    expect(await desktopIcon(page, "github").boundingBox()).toEqual(githubBefore);
  });
}

test("drag into empty and populated windows, between windows, and onto nested folders", async ({ page }) => {
  const workId = await createFolder(page, "Work");
  const referenceId = await createFolder(page, "Reference");
  await desktopIcon(page, workId).click();
  const work = folderWindow(page, workId);
  await placeWindow(page, work, 420, 100);
  await desktopIcon(page, referenceId).click();
  const reference = folderWindow(page, referenceId);
  await placeWindow(page, reference, 1080, 100);

  await drag(page, desktopIcon(page, "library"), await folderBackground(work));
  await expect(folderIcon(work, "library")).toBeVisible();
  await drag(page, desktopIcon(page, "github"), await folderBackground(work));
  await expect(folderIcon(work, "github")).toBeVisible();
  await drag(page, folderIcon(work, "library"), await folderBackground(reference));
  await expect(folderIcon(reference, "library")).toBeVisible();
  await expect(folderIcon(work, "library")).toHaveCount(0);

  const nestedId = await createSubfolder(work, "Nested");
  await drag(page, folderIcon(work, "github"), folderIcon(work, nestedId));
  await expect(folderIcon(work, "github")).toHaveCount(0);
  await folderIcon(work, nestedId).click();
  const nested = folderWindow(page, nestedId);
  await placeWindow(page, nested, 420, 520);
  await expect(folderIcon(nested, "github")).toBeVisible();
  await drag(page, folderIcon(nested, "github"), nested.getByRole("button", { name: "Work", exact: true }));
  await expect(folderIcon(work, "github")).toBeVisible();
  await expect(folderIcon(nested, "github")).toHaveCount(0);
  await drag(page, folderIcon(work, "github"), folderIcon(work, nestedId));
  await drag(page, folderIcon(work, nestedId), await folderBackground(reference));
  await expect(folderIcon(reference, nestedId)).toBeVisible();
  await expect(nested.getByRole("navigation", { name: "Folder path" })).toContainText("Reference");
  await expect(folderIcon(nested, "github")).toBeVisible();

  await page.reload();
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await menu.getByRole("button", { name: "Reference", exact: true }).click();
  await menu.getByRole("button", { name: "Nested", exact: true }).click();
  await expect(menu.getByRole("list", { name: "Nested", exact: true }).getByRole("button", { name: "GitHub", exact: true })).toBeVisible();
});

test("multi-selected desktop and folder items move together", async ({ page }) => {
  const id = await createFolder(page, "Group");
  await desktopIcon(page, "library").click({ modifiers: ["Control"] });
  await desktopIcon(page, "github").click({ modifiers: ["Control"] });
  await drag(page, desktopIcon(page, "library"), desktopIcon(page, id));
  await expect(desktopIcon(page, "library")).toHaveCount(0);
  await expect(desktopIcon(page, "github")).toHaveCount(0);
  await desktopIcon(page, id).click();
  const window = folderWindow(page, id);
  await folderIcon(window, "library").click({ modifiers: ["Control"] });
  await folderIcon(window, "github").click({ modifiers: ["Control"] });
  await startDrag(page, folderIcon(window, "library"), window.getByRole("button", { name: "Desktop", exact: true }));
  await expect(page.locator(".os-entry-drag__count")).toHaveText("2");
  await expect(page.locator(".os-entry-drag__label")).toHaveText("Move to Desktop");
  await page.mouse.up();
  await expect(folderIcon(window, "library")).toHaveCount(0);
  await expect(folderIcon(window, "github")).toHaveCount(0);
  await expect(desktopIcon(page, "library")).toBeVisible();
  await expect(desktopIcon(page, "github")).toBeVisible();
  await expect(page.locator('.os-win[data-app="library"], .os-win[data-app="github"]')).toHaveCount(0);
});

test("drop feedback stays on the folder tile and is quiet while rearranging", async ({ page }) => {
  const id = await createFolder(page, "Sleek");
  const target = desktopIcon(page, id);
  await startDrag(page, desktopIcon(page, "library"), target);
  await expect(target).toHaveAttribute("data-drop-state", "valid");
  await expect(page.locator(".os-entry-drag__label")).toHaveText("Move to Sleek");
  await expect(page.locator(".os-entry-drag__count")).toHaveCount(0);
  await expect(target).toHaveCSS("outline-style", "none");
  await expect(target).not.toHaveCSS("background-color", "rgb(220, 231, 250)");
  await expect(target.locator(".os-icon__tile")).toHaveCSS("box-shadow", /79, 127, 224/);
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await startDrag(page, desktopIcon(page, "library"), { x: 1510, y: 820 });
  await expect(page.locator(".os-desktop")).toHaveAttribute("data-drop-state", "valid");
  await expect(page.locator(".os-desktop")).toHaveCSS("outline-style", "none");
  await expect(page.locator(".os-entry-drag__label")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".os-entry-drag")).toHaveCount(0);
});

test("invalid descendants, Escape, pointer cancellation, and unrelated windows do not move or open items", async ({ page }) => {
  const id = await createFolder(page, "Parent");
  await desktopIcon(page, id).click();
  const parent = folderWindow(page, id);
  await placeWindow(page, parent, 420, 100);
  const nestedId = await createSubfolder(parent, "Child");
  await folderIcon(parent, nestedId).click();
  const nested = folderWindow(page, nestedId);
  await placeWindow(page, nested, 1080, 100);
  const before = await savedFolders(page);
  const position = await desktopIcon(page, id).boundingBox();
  await startDrag(page, desktopIcon(page, id), await folderBackground(nested));
  await expect(nested.locator(".os-folder-window")).toHaveAttribute("data-drop-state", "invalid");
  await page.mouse.up();
  await expect(page.getByRole("alert")).toContainText("one of its child folders");
  expect(await savedFolders(page)).toBe(before);
  expect(await desktopIcon(page, id).boundingBox()).toEqual(position);
  await page.getByRole("button", { name: "Dismiss folder notification" }).click();

  const library = desktopIcon(page, "library");
  await startDrag(page, library, await folderBackground(parent));
  await expect(parent.locator(".os-folder-window")).toHaveAttribute("data-drop-state", "valid");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await savedFolders(page)).toBe(before);
  await expect(page.locator("[data-entry-dragging], [data-drop-state], .os-entry-drag")).toHaveCount(0);

  await startDrag(page, library, await folderBackground(parent));
  await library.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  expect(await savedFolders(page)).toBe(before);
  await expect(page.locator("[data-entry-dragging], [data-drop-state], .os-entry-drag")).toHaveCount(0);

  await desktopIcon(page, "readme").click();
  const readme = page.locator('.os-win[data-app="readme"]');
  await placeWindow(page, readme, 1080, 500);
  await drag(page, library, readme.locator(".os-note"));
  expect(await savedFolders(page)).toBe(before);
  await expect(library).toBeVisible();
  await expect(page.locator('.os-win[data-app="library"]')).toHaveCount(0);
});

test("keyboard cut/paste preserves positions and text editing, and folder management remains available", async ({ page }) => {
  const id = await createFolder(page, "Keyboard");
  await desktopIcon(page, id).click();
  const window = folderWindow(page, id);
  await placeWindow(page, window, 420, 100);
  const libraryBefore = await desktopIcon(page, "library").boundingBox();
  await desktopIcon(page, "library").press("Control+x");
  await window.locator(".os-folder-window").press("Control+v");
  await expect(folderIcon(window, "library")).toBeVisible();
  await folderIcon(window, "library").press("Control+x");
  const before = await savedFolders(page);
  const input = window.getByLabel("New subfolder");
  await input.fill("Editable text");
  await input.press("Control+a");
  await input.press("Control+x");
  await input.press("Control+v");
  expect(await savedFolders(page)).toBe(before);
  await expect(folderIcon(window, "library")).toHaveClass(/is-cut/);
  await page.locator(".os-icons").press("Control+v");
  await expect(desktopIcon(page, "library")).toBeVisible();
  expect(await desktopIcon(page, "library").boundingBox()).toEqual(libraryBefore);
  await expect(window.locator(".is-cut")).toHaveCount(0);

  await desktopIcon(page, "library").press("Control+x");
  await window.locator(".os-folder-window").press("Control+v");
  await desktopIcon(page, "github").press("Shift+ArrowLeft");
  const occupiedSlot = await desktopIcon(page, "github").boundingBox();
  await folderIcon(window, "library").press("Control+x");
  await page.locator(".os-icons").press("Control+v");
  expect(await desktopIcon(page, "github").boundingBox()).toEqual(occupiedSlot);
  expect(await desktopIcon(page, "library").boundingBox()).not.toEqual(occupiedSlot);
  await desktopIcon(page, "library").press("Control+x");
  await window.locator(".os-folder-window").press("Control+v");
  await window.getByRole("button", { name: "Rename folder", exact: true }).click();
  await window.getByLabel("Folder name", { exact: true }).fill("Renamed");
  await window.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(window.getByRole("list", { name: "Renamed apps" })).toBeVisible();
  await window.getByRole("button", { name: "Delete folder", exact: true }).click();
  await expect(desktopIcon(page, id)).toHaveCount(0);
  await expect(window).toContainText("This folder no longer exists.");
  await expect(desktopIcon(page, "library")).toBeVisible();

  await page.locator(".os-start").click();
  await page.getByRole("dialog", { name: "Start menu" }).getByRole("button", { name: "Settings", exact: true }).click();
  const organizer = page.getByRole("region", { name: "Folder organization" });
  await expect(organizer.locator("select")).toHaveCount(0);
  await expect(organizer.getByRole("button", { name: "Move", exact: true })).toHaveCount(0);
  await organizer.getByLabel("New folder on desktop").fill("From Settings");
  await organizer.getByRole("button", { name: "Create folder", exact: true }).click();
  await organizer.getByRole("button", { name: "Open From Settings folder" }).click();
  await expect(page.getByRole("list", { name: "From Settings apps" })).toBeVisible();
});

test("a full desktop rejects transfers without losing items and accepts them once a slot is free", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.reload();
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  const id = await createFolder(page, "Staging");
  await drag(page, desktopIcon(page, "library"), desktopIcon(page, id));
  const capacity = await page.evaluate(() => {
    const raw = localStorage.getItem("lab-os-folders-v1");
    const desktop = document.querySelector<HTMLElement>(".os-desktop");
    if (!raw || !desktop) throw new Error("Missing folder fixture or desktop.");
    const organization: { root: string[]; folders: Record<string, { name: string; items: string[] }> } = JSON.parse(raw);
    const slots = Math.floor((desktop.clientWidth - 16) / 92) * Math.floor((desktop.clientHeight - 16) / 92);
    for (let index = 0; organization.root.length < slots; index += 1) {
      const folder = `custom-folder-full-${index}`;
      organization.root.push(folder);
      organization.folders[folder] = { name: `Folder ${index}`, items: [] };
    }
    localStorage.setItem("lab-os-folders-v1", JSON.stringify(organization));
    return slots;
  });
  await page.reload();
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await expect(page.locator(".os-icons .os-icon")).toHaveCount(capacity);
  await desktopIcon(page, id).click();
  const window = folderWindow(page, id);
  const desktop = (await page.locator(".os-desktop").boundingBox())!;
  const point = { x: desktop.x + desktop.width - 4, y: desktop.y + desktop.height - 4 };
  const before = await savedFolders(page);
  await drag(page, folderIcon(window, "library"), point);
  await expect(page.locator(".os-desktop-notice")).toContainText("The desktop is full");
  await expect(folderIcon(window, "library")).toBeVisible();
  expect(await savedFolders(page)).toBe(before);

  const searchBefore = await desktopIcon(page, "search").boundingBox();
  await desktopIcon(page, "github").press("Control+x");
  await window.locator(".os-folder-window").press("Control+v");
  await drag(page, folderIcon(window, "library"), point);
  await expect(folderIcon(window, "library")).toHaveCount(0);
  await expect(desktopIcon(page, "library")).toBeVisible();
  await expect(page.locator(".os-icons .os-icon")).toHaveCount(capacity);
  expect(await desktopIcon(page, "search").boundingBox()).toEqual(searchBefore);
  const placed = (await desktopIcon(page, "library").boundingBox())!;
  expect(placed.x + placed.width).toBeLessThanOrEqual(desktop.x + desktop.width);
  expect(placed.y + placed.height).toBeLessThanOrEqual(desktop.y + desktop.height);
});

test("the eighth folder level accepts apps but rejects deeper folders, including after reload", async ({ page }) => {
  const root = await createFolder(page, "Level 1");
  const extra = await createFolder(page, "Extra");
  await desktopIcon(page, root).click();
  let deepest = folderWindow(page, root);
  for (let level = 2; level <= 8; level += 1) {
    const id = await createSubfolder(deepest, `Level ${level}`);
    await folderIcon(deepest, id).click();
    deepest = folderWindow(page, id);
  }
  await drag(page, desktopIcon(page, "library"), await folderBackground(deepest));
  await expect(folderIcon(deepest, "library")).toBeVisible();
  const before = await savedFolders(page);
  await drag(page, desktopIcon(page, extra), await folderBackground(deepest));
  await expect(page.getByRole("alert")).toContainText("up to 8 levels");
  expect(await savedFolders(page)).toBe(before);
  await page.reload();
  await expect(desktopIcon(page, "library")).toHaveCount(0);
  expect(await savedFolders(page)).toBe(before);
});

test.describe("touch folders", () => {
  test.use({ hasTouch: true });

  for (const style of ["modern", "retro"]) {
    test(`${style}: touch arrangement moves apps into folders and out through the Desktop path`, async ({ page, context }) => {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.goto(`./?view=os&style=${style}`);
      const home = page.locator(".os-home");
      const library = home.locator('[data-entry-id="library"]');
      const projects = home.locator('[data-entry-id="projects"]');
      await expect(library).toBeVisible();
      await expect(library).toHaveCSS("touch-action", "pan-y");
      const cdp = await context.newCDPSession(page);
      // Navigation uses clicks: Chromium/CDP suppresses the first tap after even a plain-page injected swipe.
      const touchDrag = async (source: Locator, target: Locator) => {
        const from = await center(source);
        const to = await center(target);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
        for (let step = 1; step <= 10; step += 1) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10 }] });
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };
      await home.getByRole("button", { name: "Arrange apps", exact: true }).tap();
      await expect(home.getByRole("button", { name: "Arrange apps", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(library).toHaveCSS("touch-action", "none");
      await home.locator(".os-home__grid").scrollIntoViewIfNeeded();
      await expect(projects).toBeInViewport({ ratio: 1 });
      await touchDrag(library, projects);
      await expect(library).toHaveCount(0);
      await projects.click();
      const window = folderWindow(page, "projects");
      await expect(folderIcon(window, "library")).toBeVisible();
      expect(await window.locator(".os-win__body").evaluate((body) => body.scrollWidth - body.clientWidth)).toBeLessThanOrEqual(0);
      await window.getByRole("button", { name: "Select items", exact: true }).click();
      await touchDrag(folderIcon(window, "library"), window.getByRole("button", { name: "Desktop", exact: true }));
      await expect(folderIcon(window, "library")).toHaveCount(0);
      await window.getByRole("button", { name: "Desktop", exact: true }).click();
      await expect(library).toBeVisible();
      await expect(home.getByRole("button", { name: "Settings", exact: true })).not.toHaveAttribute("data-entry-id", /.+/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - globalThis.innerWidth)).toBeLessThanOrEqual(0);
      const arrange = home.getByRole("button", { name: "Arrange apps", exact: true });
      if (await arrange.getAttribute("aria-pressed") === "true") await arrange.click();
      await expect(library).toHaveCSS("touch-action", "pan-y");
      const before = await savedFolders(page);
      await touchDrag(library, projects);
      expect(await savedFolders(page)).toBe(before);
      await expect(page.locator(".os-entry-drag")).toHaveCount(0);
      await cdp.detach();
    });
  }
});
