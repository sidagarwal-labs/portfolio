import { expect, test, type Page } from "@playwright/test";

type Icon = { id: string; x: number; y: number; width: number; height: number };

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
  await expect(page.locator('.os-win[data-app="search"]')).toBeVisible();
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await expect(page.locator(".os-win:not(.is-minimized)")).toHaveCount(0);
}

async function icons(page: Page): Promise<Icon[]> {
  return page.locator(".os-icons .os-icon").evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { id: (button as HTMLElement).dataset.app ?? "", x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
}

/* Icons in the nth occupied row from the top. */
async function row(page: Page, index: number) {
  const all = await icons(page);
  const tops = [...new Set(all.map((icon) => icon.y))].sort((a, b) => a - b);
  return all.filter((icon) => icon.y === tops[index]);
}

const selectedIds = (page: Page) => page.locator('.os-icons .os-icon[aria-pressed="true"]').evaluateAll((buttons) => buttons.map((button) => (button as HTMLElement).dataset.app).sort());
const ids = (list: Icon[]) => list.map((icon) => icon.id).sort();

/* Drags from empty space on the right of the desktop across a whole row of icons. */
async function selectRow(page: Page, index: number, release = true) {
  const target = await row(page, index);
  const desk = (await page.locator(".os-desktop").boundingBox())!;
  const left = Math.min(...target.map((icon) => icon.x));
  await page.mouse.move(desk.x + desk.width - 40, target[0].y + 20);
  await page.mouse.down();
  await page.mouse.move(left + 20, target[0].y + 60, { steps: 8 });
  if (release) await page.mouse.up();
  return target;
}

test("dragging across the desktop draws a selection box and selects the icons it touches", async ({ page }) => {
  await openDesktop(page);
  const target = await selectRow(page, 0, false);
  const marquee = page.locator(".os-marquee");
  await expect(marquee).toBeVisible();
  const box = (await marquee.boundingBox())!;
  const desk = (await page.locator(".os-desktop").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(desk.x);
  expect(box.x + box.width).toBeLessThanOrEqual(desk.x + desk.width);
  expect(await marquee.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe("solid");
  await expect.poll(() => selectedIds(page)).toEqual(ids(target));
  await page.mouse.move(desk.x + desk.width + 200, desk.y + desk.height + 200, { steps: 4 });
  const clipped = (await marquee.boundingBox())!;
  expect(clipped.x + clipped.width).toBeLessThanOrEqual(desk.x + desk.width + 0.5);
  expect(clipped.y + clipped.height).toBeLessThanOrEqual(desk.y + desk.height + 0.5);
  await page.mouse.move(target[0].x + 20, target[0].y + 60, { steps: 4 });
  await page.mouse.up();
  await expect(marquee).toHaveCount(0);
  await expect.poll(() => selectedIds(page)).toEqual(ids(target));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator(".os-win:not(.is-minimized)")).toHaveCount(0);
});

test("Ctrl adds to the selection, Ctrl-click toggles, and clicking empty desktop or Escape clears it", async ({ page }) => {
  await openDesktop(page);
  const first = await selectRow(page, 0);
  await page.keyboard.down("Control");
  const second = await selectRow(page, 1);
  await page.keyboard.up("Control");
  await expect.poll(() => selectedIds(page)).toEqual(ids([...first, ...second]));

  await page.locator(`.os-icon[data-app="${first[0].id}"]`).click({ modifiers: ["Control"] });
  await expect.poll(() => selectedIds(page)).toEqual(ids([...first.slice(1), ...second]));
  await expect(page.locator(`.os-win[data-app="${first[0].id}"]:not(.is-minimized)`)).toHaveCount(0);

  const desk = (await page.locator(".os-desktop").boundingBox())!;
  await page.mouse.click(desk.x + desk.width - 40, desk.y + desk.height / 2);
  await expect.poll(() => selectedIds(page)).toEqual([]);

  await selectRow(page, 0);
  await expect.poll(() => selectedIds(page)).toEqual(ids(first));
  await page.keyboard.press("Escape");
  await expect.poll(() => selectedIds(page)).toEqual([]);

  /* A tiny movement still counts as a click on the empty desktop. */
  await selectRow(page, 0);
  await page.mouse.move(desk.x + desk.width - 40, desk.y + desk.height / 2);
  await page.mouse.down();
  await page.mouse.move(desk.x + desk.width - 38, desk.y + desk.height / 2 + 2);
  await page.mouse.up();
  await expect(page.locator(".os-marquee")).toHaveCount(0);
  await expect.poll(() => selectedIds(page)).toEqual([]);
});

test("dragging a selected icon moves the whole group and the layout persists", async ({ page }) => {
  await openDesktop(page);
  const group = await selectRow(page, 0);
  const others = (await icons(page)).filter((icon) => !group.some((member) => member.id === icon.id));
  await page.mouse.move(group[0].x + 40, group[0].y + 35);
  await page.mouse.down();
  await page.mouse.move(group[0].x + 40, group[0].y + 35 + 4 * 92, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".os-win:not(.is-minimized)")).toHaveCount(0);
  const check = async () => {
    const now = await icons(page);
    for (const member of group) expect(now.find((icon) => icon.id === member.id)).toMatchObject({ x: member.x, y: member.y + 4 * 92 });
    for (const other of others) expect(now.find((icon) => icon.id === other.id)).toMatchObject({ x: other.x, y: other.y });
  };
  await check();
  await expect.poll(() => selectedIds(page)).toEqual(ids(group));
  await page.reload();
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await check();
});

test("Enter opens every selected icon and double-click still opens one", async ({ page }) => {
  await openDesktop(page);
  await page.locator('.os-icon[data-app="search"]').click({ modifiers: ["Control"] });
  await page.locator('.os-icon[data-app="forward"]').click({ modifiers: ["Control"] });
  await expect.poll(() => selectedIds(page)).toEqual(["forward", "search"]);
  await expect(page.locator('.os-icon[data-app="forward"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('.os-win[data-app="search"]:not(.is-minimized)')).toHaveCount(1);
  await expect(page.locator('.os-win[data-app="forward"]:not(.is-minimized)')).toHaveCount(1);

  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await page.locator('.os-icon[data-app="readme"]').dblclick();
  await expect(page.locator('.os-win[data-app="readme"]')).toHaveCount(1);
  await expect(page.locator('.os-win[data-app="readme"]')).toBeVisible();
  await expect.poll(() => selectedIds(page)).toEqual([]);
});

test("dragging an unselected icon moves only that icon and clears the selection", async ({ page }) => {
  await openDesktop(page);
  const group = await selectRow(page, 0);
  const loner = (await row(page, 1))[0];
  await page.mouse.move(loner.x + 40, loner.y + 35);
  await page.mouse.down();
  await page.mouse.move(loner.x + 40 + 6 * 92, loner.y + 35, { steps: 8 });
  await page.mouse.up();
  const now = await icons(page);
  expect(now.find((icon) => icon.id === loner.id)).toMatchObject({ x: loner.x + 6 * 92, y: loner.y });
  for (const member of group) expect(now.find((icon) => icon.id === member.id)).toMatchObject({ x: member.x, y: member.y });
  await expect.poll(() => selectedIds(page)).toEqual([]);
  await expect(page.locator(`.os-win[data-app="${loner.id}"]:not(.is-minimized)`)).toHaveCount(0);
});

test("Retro draws a dotted selection box and highlights selected labels", async ({ page }) => {
  await openDesktop(page, "retro");
  const target = await selectRow(page, 0, false);
  const marquee = page.locator(".os--retro .os-marquee");
  await expect(marquee).toBeVisible();
  expect(await marquee.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe("dotted");
  await page.mouse.up();
  await expect.poll(() => selectedIds(page)).toEqual(ids(target));
  const label = page.locator(`.os-icon[data-app="${target[0].id}"] .os-icon__label`);
  expect(await label.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(0, 0, 128)");
});

test("the phone home screen has no selection box", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?view=os");
  await expect(page.locator(".os-home")).toBeVisible();
  await page.mouse.move(40, 600);
  await page.mouse.down();
  await page.mouse.move(300, 700, { steps: 6 });
  await expect(page.locator(".os-marquee")).toHaveCount(0);
  await page.mouse.up();
});
