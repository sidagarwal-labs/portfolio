import { expect, test, type Page } from "@playwright/test";

const noteKey = "lab-os-note-v1";
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

  await toggle.uncheck();
  await expect(note).toHaveCount(0);
  await settings.getByRole("button", { name: "Reset all Lab OS settings…" }).click();
  await settings.getByRole("button", { name: "Reset everything" }).click();
  await expect(note.getByRole("textbox")).toHaveValue(defaultText);
  await expect(toggle).toBeChecked();
  expect(await stored(page)).toBeNull();
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
