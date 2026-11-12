import { expect, test, type Page } from "@playwright/test";
import { iconAreaWidth } from "../../src/features/views/os/desktopLayout";

const noteKey = "lab-os-note-v1";
const sizeKey = "lab-os-note-size-v1";
const defaultText = "Welcome!\n\nThis site represents my interests and passions.\n\nHappy exploring!\n— Sid";
const searchWin = '.os-win[data-app="search"]';

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/**", (route) => route.abort());
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com|avatars\.githubusercontent\.com|s3\.tradingview\.com|datasets-server\.huggingface\.co)\//, (route) => route.abort());
});

async function openDesktop(page: Page, style = "modern") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`./?view=os&style=${style}`);
  await expect(page.locator(searchWin)).toBeVisible();
}

const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), noteKey);
const storedSize = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), sizeKey);
const noteRegion = (page: Page) => page.getByRole("region", { name: "Welcome note" });

async function expectSize(page: Page, width: number, height: number) {
  await expect(noteRegion(page)).toHaveCSS("width", `${width}px`);
  await expect(noteRegion(page)).toHaveCSS("height", `${height}px`);
}

async function expectIconsWithinDesktop(page: Page) {
  const desk = (await page.locator(".os-desktop").boundingBox())!;
  const icons = await page.locator(".os-icons > li").evaluateAll((items) => items.map((item) => {
    const { x, y, width, height } = item.getBoundingClientRect();
    return { x, y, width, height, label: item.textContent ?? "" };
  }));
  expect(icons.length).toBeGreaterThan(0);
  for (const icon of icons) {
    expect(icon.x, icon.label).toBeGreaterThanOrEqual(desk.x);
    expect(icon.y, icon.label).toBeGreaterThanOrEqual(desk.y);
    expect(icon.x + icon.width, icon.label).toBeLessThanOrEqual(desk.x + desk.width);
    expect(icon.y + icon.height, icon.label).toBeLessThanOrEqual(desk.y + desk.height);
  }
}

async function dragNote(page: Page, edge: "w" | "s" | "sw", dx: number, dy: number) {
  const grip = (await noteRegion(page).locator(`.os-welcome__grip--${edge}`).boundingBox())!;
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test("every visitor sees the welcome note beside Sid Search, and their edits stay in their browser", async ({ page }) => {
  await openDesktop(page);
  const note = page.getByRole("region", { name: "Welcome note" });
  const text = note.getByRole("textbox", { name: "Welcome note text" });
  await expect(note.getByRole("heading", { name: "Welcome note" })).toBeVisible();
  await expect(text).toHaveValue(defaultText);
  await expect(text).toHaveAccessibleDescription("Edit me. Saved in this browser.");
  expect(await stored(page)).toBeNull();

  const box = (await note.boundingBox())!;
  const desk = (await page.locator(".os-desktop").boundingBox())!;
  const search = (await page.locator(searchWin).boundingBox())!;
  expect(box.x + box.width).toBe(desk.x + desk.width - 16);
  expect(box.y).toBe(desk.y + 12);
  expect(search.x + search.width).toBeLessThanOrEqual(box.x - 12 + 0.5);
  expect(search.width).toBeGreaterThanOrEqual(640);

  const restore = note.getByRole("button", { name: "Restore the original note" });
  await expect(restore).toBeDisabled();
  await text.fill("Hi Sid! Leaving myself a reminder: check out the Markets app.");
  expect(await stored(page)).toBe("Hi Sid! Leaving myself a reminder: check out the Markets app.");
  await page.reload();
  await expect(text).toHaveValue("Hi Sid! Leaving myself a reminder: check out the Markets app.");

  await restore.click();
  await expect(text).toHaveValue(defaultText);
  await expect(text).toBeFocused();
  await expect(restore).toBeDisabled();
  expect(await stored(page)).toBeNull();
});

test("hiding the note keeps focus on the desktop, and Settings brings it back; Reset all restores it", async ({ page }) => {
  await openDesktop(page);
  const note = page.getByRole("region", { name: "Welcome note" });
  await note.getByRole("textbox").fill("My own note");
  await note.getByRole("button", { name: "Resize welcome note" }).press("Shift+ArrowLeft");
  expect(await storedSize(page)).toEqual({ width: 252, height: 220 });
  await note.getByRole("button", { name: "Hide welcome note" }).click();
  await expect(note).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Desktop", exact: true })).toBeFocused();
  await expect(page.locator(".os-welcome-notice")).toHaveText("Welcome note hidden. Settings can show it again.");

  /* Hidden stays hidden, and Sid Search takes the whole width again. */
  await page.reload();
  await expect(page.locator(searchWin)).toBeVisible();
  await expect(note).toHaveCount(0);
  const desk = (await page.locator(".os-desktop").boundingBox())!;
  const search = (await page.locator(searchWin).boundingBox())!;
  expect(search.x + search.width).toBe(desk.x + desk.width - 16);

  await page.getByRole("button", { name: "Open Settings" }).click();
  const settings = page.locator('.os-win[data-app="settings"]');
  const toggle = settings.getByRole("checkbox", { name: "Show welcome note" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(note.getByRole("textbox")).toHaveValue("My own note");
  await expectSize(page, 252, 220);

  await toggle.uncheck();
  await expect(note).toHaveCount(0);
  await settings.getByRole("button", { name: "Reset all Lab OS settings…" }).click();
  await settings.getByRole("button", { name: "Reset everything" }).click();
  await expect(note.getByRole("textbox")).toHaveValue(defaultText);
  await expect(toggle).toBeChecked();
  expect(await stored(page)).toBeNull();
  expect(await storedSize(page)).toBeNull();
  await expectSize(page, 220, 220);
  await page.reload();
  await expectSize(page, 220, 220);
});

test("an icon saved under the note waits beside it until the note is hidden", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lab-os-icons-v3", JSON.stringify({ github: { col: 14, row: 0 } })));
  await openDesktop(page);
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  const note = (await page.getByRole("region", { name: "Welcome note" }).boundingBox())!;
  const github = page.locator('.os-icons .os-icon[data-app="github"]');
  await expect.poll(async () => (await github.boundingBox())!.x + 92).toBe(note.x);

  await page.getByRole("button", { name: "Hide welcome note" }).click();
  await expect.poll(async () => (await github.boundingBox())!.x).toBe(8 + 14 * 92);
});

test("icons can't be dragged or moved with the keyboard under the note", async ({ page }) => {
  await openDesktop(page);
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  const note = (await page.getByRole("region", { name: "Welcome note" }).boundingBox())!;
  const library = page.locator('.os-icons .os-icon[data-app="library"]');
  const before = (await library.boundingBox())!;
  await page.mouse.move(before.x + 46, before.y + 40);
  await page.mouse.down();
  await page.mouse.move(note.x + note.width / 2, note.y + note.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".os-desktop-notice")).toHaveText("The welcome note is using that spot.");
  expect(await library.boundingBox()).toEqual(before);

  await library.focus();
  for (let step = 0; step < 14; step += 1) await page.keyboard.press("Shift+ArrowRight");
  const moved = (await library.boundingBox())!;
  expect(moved.x + moved.width).toBeLessThanOrEqual(note.x + 0.5);
  await expect(page.locator(".os-desktop-notice")).toHaveText("The welcome note is using that spot.");
});

test("Retro style shows the note as a small Notepad window", async ({ page }) => {
  await openDesktop(page, "retro");
  const note = page.getByRole("region", { name: "Welcome note" });
  await expect(note.getByRole("heading", { name: "Welcome.txt - Notepad" })).toBeVisible();
  await expect(note.getByRole("textbox", { name: "Welcome note text" })).toHaveCSS("font-family", /Courier New/);
  await expect(note.locator(".os-welcome__bar")).toHaveCSS("background-image", /linear-gradient/);
});

test("the phone home screen shows the note as a card under About Sid", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?view=os");
  const home = page.locator(".os-home");
  const note = home.getByRole("region", { name: "Welcome note" });
  await expect(note).toBeInViewport();
  await expect(note.getByRole("button", { name: "Resize welcome note" })).toHaveCount(0);
  const about = (await home.getByRole("region", { name: "About Sid" }).boundingBox())!;
  const card = (await note.boundingBox())!;
  expect(card.y).toBeGreaterThan(about.y + about.height);
  expect(card.width).toBe(about.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await note.getByRole("textbox").fill("Phone note");
  await page.reload();
  await expect(note.getByRole("textbox")).toHaveValue("Phone note");
  await note.getByRole("button", { name: "Hide welcome note" }).click();
  await expect(note).toHaveCount(0);
  await expect(home.getByRole("list", { name: "Apps", exact: true })).toBeFocused();
});

for (const style of ["modern", "retro"]) {
  test(`${style} note resizes from its corner and edges, persists, and supports keyboard resizing`, async ({ page }) => {
    await openDesktop(page, style);
    await page.getByRole("button", { name: "Show desktop", exact: true }).click();
    const note = noteRegion(page);
    const start = (await note.boundingBox())!;
    expect(await storedSize(page)).toBeNull();
    await note.getByRole("textbox").fill("A note with room to grow");

    await dragNote(page, "sw", -120, 80);
    await expectSize(page, 340, 300);
    await dragNote(page, "w", -40, 0);
    await expectSize(page, 380, 300);
    await dragNote(page, "s", 0, 60);
    await expectSize(page, 380, 360);
    const resized = (await note.boundingBox())!;
    expect(resized.x + resized.width).toBe(start.x + start.width);
    expect(resized.y).toBe(start.y);
    expect(await storedSize(page)).toEqual({ width: 380, height: 360 });

    await note.getByRole("button", { name: "Restore the original note" }).click();
    await expect(note.getByRole("textbox")).toHaveValue(defaultText);
    await expectSize(page, 380, 360);
    await page.reload();
    await expectSize(page, 380, 360);
    await expect(note.getByRole("textbox")).toHaveValue(defaultText);

    await note.getByRole("textbox").focus();
    await page.keyboard.press("Tab");
    const grip = note.getByRole("button", { name: "Resize welcome note" });
    await expect(grip).toBeFocused();
    await expect(grip).toHaveAccessibleDescription(/Arrow Left widens.*380 by 360 pixels/);
    await page.keyboard.press("ArrowLeft");
    await expectSize(page, 388, 360);
    await page.keyboard.press("Shift+ArrowDown");
    await expectSize(page, 388, 392);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await expectSize(page, 380, 384);
    await expect(grip).toHaveAccessibleDescription(/380 by 384 pixels/);
    expect(await storedSize(page)).toEqual({ width: 380, height: 384 });
    await page.reload();
    await expectSize(page, 380, 384);
  });

  test(`${style} pointer and keyboard resizing respect minimum size and desktop bounds`, async ({ page }) => {
    await openDesktop(page, style);
    await page.getByRole("button", { name: "Show desktop", exact: true }).click();
    await dragNote(page, "sw", 1800, -1800);
    await expectSize(page, 200, 160);
    const grip = noteRegion(page).getByRole("button", { name: "Resize welcome note" });
    await grip.press("Shift+ArrowRight");
    await grip.press("Shift+ArrowUp");
    await expectSize(page, 200, 160);
    const text = noteRegion(page).getByRole("textbox");
    const textBox = (await text.boundingBox())!;
    expect(textBox.height).toBeGreaterThan(50);
    await text.fill("Still editable at minimum size");

    for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 520 }]) {
      await page.setViewportSize(viewport);
      await dragNote(page, "sw", -1800, 1800);
      const desk = (await page.locator(".os-desktop").boundingBox())!;
      await expectSize(page, desk.width - iconAreaWidth - 28, desk.height - 24);
      const box = (await noteRegion(page).boundingBox())!;
      expect(box.x).toBe(desk.x + iconAreaWidth + 12);
      expect(box.y).toBe(desk.y + 12);
      expect(box.x + box.width).toBe(desk.x + desk.width - 16);
      expect(box.y + box.height).toBe(desk.y + desk.height - 12);
      await grip.press("Shift+ArrowLeft");
      await grip.press("Shift+ArrowDown");
      await expectSize(page, desk.width - iconAreaWidth - 28, desk.height - 24);
      await expectIconsWithinDesktop(page);
    }
    await expect(text).toHaveValue("Still editable at minimum size");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });
}

test("viewport clamping and phone cards preserve the preferred desktop size", async ({ page }) => {
  await openDesktop(page);
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await dragNote(page, "sw", -980, 500);
  await expectSize(page, 1200, 720);
  expect(await storedSize(page)).toEqual({ width: 1200, height: 720 });

  await page.setViewportSize({ width: 1000, height: 650 });
  const desktop = (await page.locator(".os-desktop").boundingBox())!;
  await expectSize(page, desktop.width - iconAreaWidth - 28, desktop.height - 24);
  await expectIconsWithinDesktop(page);
  const grip = noteRegion(page).getByRole("button", { name: "Resize welcome note" });
  await grip.press("ArrowLeft");
  await grip.press("ArrowDown");
  expect(await storedSize(page)).toEqual({ width: 1200, height: 720 });
  await page.reload();
  await expectSize(page, desktop.width - iconAreaWidth - 28, desktop.height - 24);
  await expectIconsWithinDesktop(page);
  await expect(page.locator(searchWin)).toHaveClass(/is-maximized/);

  await page.setViewportSize({ width: 390, height: 844 });
  const card = noteRegion(page);
  await expect(card).toHaveClass(/os-welcome--card/);
  await expect(card.locator(".os-welcome__grip")).toHaveCount(0);
  expect((await card.boundingBox())!.width).toBeLessThan(390);
  expect(await storedSize(page)).toEqual({ width: 1200, height: 720 });
  await page.reload();
  await expect(card).toBeInViewport();
  await expect(card.locator(".os-welcome__grip")).toHaveCount(0);
  await page.setViewportSize({ width: 1680, height: 900 });
  await expectSize(page, 1200, 720);
  expect(await storedSize(page)).toEqual({ width: 1200, height: 720 });
});

test("live resizing excludes icons and reopening Search leaves room for the saved note", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lab-os-icons-v3", JSON.stringify({ github: { col: 12, row: 3 } })));
  await openDesktop(page);
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  const github = page.locator('.os-icons .os-icon[data-app="github"]');
  const initialIcon = (await github.boundingBox())!;
  const grip = (await noteRegion(page).getByRole("button", { name: "Resize welcome note" }).boundingBox())!;
  await page.mouse.move(grip.x + 12, grip.y + 12);
  await page.mouse.down();
  await page.mouse.move(grip.x + 12 - 110, grip.y + 12 + 210, { steps: 8 });
  await expectSize(page, 330, 430);
  expect(await storedSize(page)).toBeNull();
  const box = (await noteRegion(page).boundingBox())!;
  expect(initialIcon.x + initialIcon.width).toBeGreaterThan(box.x);
  expect(initialIcon.y).toBeLessThan(box.y + box.height);
  await expect.poll(async () => (await github.boundingBox())!.x + 92).toBeLessThanOrEqual(box.x);
  await page.mouse.up();
  expect(await storedSize(page)).toEqual({ width: 330, height: 430 });
  await page.reload();
  await expectSize(page, 330, 430);
  const search = (await page.locator(searchWin).boundingBox())!;
  expect(search.x + search.width).toBe(box.x - 12);
  expect(search.width).toBeGreaterThanOrEqual(640);

  const resize = noteRegion(page).getByRole("button", { name: "Resize welcome note" });
  for (let step = 0; step < 7; step += 1) await resize.press("Shift+ArrowUp");
  await expectSize(page, 330, 206);
  await expect.poll(async () => (await github.boundingBox())!.x).toBe(initialIcon.x);
});

test("Escape, pointer cancellation, lost capture, blur, and unmount clean up without saving a partial resize", async ({ page }) => {
  await openDesktop(page);
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  const grip = noteRegion(page).getByRole("button", { name: "Resize welcome note" });
  for (const reason of ["escape", "pointercancel", "lostcapture", "blur", "unmount"]) {
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + 12, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x - 88, box.y + 112, { steps: 5 });
    await expectSize(page, 320, 320);
    if (reason === "escape") await page.keyboard.press("Escape");
    else if (reason === "pointercancel") await grip.dispatchEvent("pointercancel", { pointerId: 1 });
    else if (reason === "lostcapture") {
      await grip.evaluate((element) => element.releasePointerCapture(1));
      await page.mouse.move(box.x - 89, box.y + 113);
    } else if (reason === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".os-desktop")).not.toHaveClass(/is-dragging/);
    await page.mouse.up();
    if (reason === "unmount") await page.setViewportSize({ width: 1440, height: 900 });
    await expectSize(page, 220, 220);
    expect(await storedSize(page)).toBeNull();
  }
  await dragNote(page, "sw", -40, 40);
  await expectSize(page, 260, 260);
  expect(await storedSize(page)).toEqual({ width: 260, height: 260 });
});

test("invalid saved sizes fall back safely and report the failure", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => { if (message.type() === "warning") warnings.push(message.text()); });
  await openDesktop(page);
  for (const value of [
    "{not json", "null", "[]", '{"width":"300","height":220}', '{"width":300}',
    '{"width":-1,"height":220}', '{"width":199,"height":159}', '{"width":220.5,"height":220}',
    '{"width":1e309,"height":220}', '{"width":9007199254740992,"height":220}'
  ]) {
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: sizeKey, value });
    await page.reload();
    await expectSize(page, 220, 220);
    await expect(noteRegion(page)).toContainText("Note size is not saved in this browser.");
  }
  expect(warnings.filter((warning) => warning.includes("Saved welcome note size could not be read."))).toHaveLength(10);
  await noteRegion(page).getByRole("button", { name: "Resize welcome note" }).press("ArrowLeft");
  await expectSize(page, 228, 220);
  await expect(noteRegion(page)).not.toContainText("Note size is not saved");
  expect(await storedSize(page)).toEqual({ width: 228, height: 220 });
});

test("blocked size storage logs read, write, and reset failures while resizing remains usable", async ({ page }) => {
  const warnings: string[] = [];
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "warning") warnings.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ width: 320, height: 260 }));
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (name: string, value?: string) {
        if (name === key) throw new DOMException("Storage blocked", "SecurityError");
        return original.call(this, name, value!);
      };
    }
  }, sizeKey);
  await openDesktop(page);
  await expectSize(page, 220, 220);
  await expect(noteRegion(page)).toContainText("Note size is not saved in this browser.");
  const grip = noteRegion(page).getByRole("button", { name: "Resize welcome note" });
  await grip.press("ArrowLeft");
  await expectSize(page, 228, 220);
  await grip.press("ArrowRight");
  await expectSize(page, 220, 220);
  await expect(noteRegion(page)).toContainText("Note size is not saved in this browser.");
  await noteRegion(page).getByRole("textbox").fill("Text storage still works");
  expect(await stored(page)).toBe("Text storage still works");

  await page.getByRole("button", { name: "Open Settings" }).click();
  const settings = page.locator('.os-win[data-app="settings"]');
  await settings.getByRole("button", { name: "Reset all Lab OS settings…" }).click();
  await settings.getByRole("button", { name: "Reset everything" }).click();
  await expectSize(page, 220, 220);
  await expect(noteRegion(page)).toContainText("Note size is not saved in this browser.");
  expect(warnings.some((warning) => warning.includes("Saved welcome note size could not be read."))).toBe(true);
  expect(warnings.filter((warning) => warning.includes("The welcome note size could not be saved."))).toHaveLength(2);
  expect(warnings.some((warning) => warning.includes("Saved Lab OS settings could not be cleared."))).toBe(true);
  expect(errors).toEqual([]);
});
