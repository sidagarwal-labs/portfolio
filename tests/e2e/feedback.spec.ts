import { expect, test, type Page, type Route } from "@playwright/test";

/* vite.config.ts points the test build's feedback form at this origin; every request to it is stubbed here. */
const api = "https://feedback-api.playwright.test/feedback/v1";
const issue = { ok: true, number: 123, url: "https://github.com/sidagarwal-labs/portfolio/issues/123" };

test.beforeEach(async ({ page }) => {
  await page.route("https://finnhub.io/**", (route) => route.abort());
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/**", (route) => route.fulfill({ json: { results: [] } }));
  await page.route(/^https:\/\/(i\.scdn\.co|m\.media-amazon\.com|avatars\.githubusercontent\.com|s3\.tradingview\.com|datasets-server\.huggingface\.co)\//, (route) => route.abort());
});

type Sent = { rating: string; comment: string; context: Record<string, string>; website: string };

/* Answers the CORS preflight like the Worker, then the POST with the given status and body; returns the POSTed payloads. */
async function stubApi(page: Page, status = 201, body: object = issue) {
  const sent: Sent[] = [];
  await page.route(api, async (route: Route) => {
    const request = route.request();
    const cors = { "Access-Control-Allow-Origin": await request.headerValue("origin") ?? "*", Vary: "Origin" };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
      return;
    }
    sent.push(request.postDataJSON() as Sent);
    await route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  });
  return sent;
}

async function openDesktop(page: Page, style = "modern") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`./?view=os&style=${style}`);
  await expect(page.locator('.os-win[data-app="search"]')).toBeVisible();
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Send feedback" });

async function expectFormBasics(page: Page) {
  const form = dialog(page);
  await expect(form).toBeVisible();
  await expect(form.getByText("This is public.")).toBeVisible();
  await expect(form.getByText(/posted as an issue on GitHub that anyone can read, so don't include personal or sensitive information/)).toBeVisible();
  await expect(form).toHaveAccessibleDescription(/This is public/);
  await expect(form.locator('input[name="website"]')).toBeHidden();
  await expect(form.getByRole("textbox", { name: "Website" })).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Thumbs up" })).toBeFocused();
  return form;
}

test("the taskbar button opens the dialog; Escape closes it and returns focus", async ({ page }) => {
  await openDesktop(page);
  const opener = page.locator(".os-tray").getByRole("button", { name: "Send feedback" });
  await opener.click();
  const form = await expectFormBasics(page);

  const up = form.getByRole("button", { name: "Thumbs up" });
  const down = form.getByRole("button", { name: "Thumbs down" });
  const send = form.getByRole("button", { name: "Send", exact: true });
  await expect(up).toHaveAttribute("aria-pressed", "false");
  await expect(send).toBeDisabled();
  await down.click();
  await expect(down).toHaveAttribute("aria-pressed", "true");
  await expect(up).toHaveAttribute("aria-pressed", "false");
  await expect(send).toBeEnabled();

  const comment = form.getByRole("textbox", { name: /Comment/ });
  await expect(form.getByText("0 / 1000 characters")).toBeVisible();
  await comment.fill("Nice");
  await expect(form.getByText("4 / 1000 characters")).toBeVisible();
  await comment.fill("x".repeat(1200));
  await expect(comment).toHaveValue("x".repeat(1000));
  await expect(form.getByText("1000 / 1000 characters")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("the Start menu entry opens the dialog; Cancel returns focus to Start", async ({ page }) => {
  await openDesktop(page, "retro");
  await page.locator(".os-start").click();
  const menu = page.getByRole("dialog", { name: "Start menu" });
  await menu.getByRole("button", { name: "Send feedback" }).click();
  await expect(menu).toHaveCount(0);
  const form = await expectFormBasics(page);
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator(".os-start")).toBeFocused();
});

test("Settings sends a thumbs up with a comment and links the new issue", async ({ page }) => {
  const sent = await stubApi(page);
  await openDesktop(page);
  await page.locator(".os-tray").getByRole("button", { name: "Open Settings" }).click();
  const win = page.locator('.os-win[data-app="settings"]');
  await expect(win.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
  const opener = win.getByRole("button", { name: "Send feedback" });
  await opener.click();
  const form = await expectFormBasics(page);

  await form.getByRole("button", { name: "Thumbs up" }).click();
  await form.getByRole("textbox", { name: /Comment/ }).fill("Love the retro mode `code` @someone");
  await form.getByRole("button", { name: "Send", exact: true }).click();

  await expect(form.getByText("Thanks! It's posted as issue #123")).toBeVisible();
  const link = form.getByRole("link", { name: "issue #123" });
  await expect(link).toHaveAttribute("href", issue.url);
  await expect(link).toHaveAttribute("target", "_blank");
  expect(sent).toEqual([{ rating: "up", comment: "Love the retro mode `code` @someone", context: { app: "settings", view: "os", style: "modern" }, website: "" }]);

  await expect(form.getByRole("button", { name: "Done" })).toBeFocused();
  await form.getByRole("button", { name: "Done" }).click();
  await expect(form).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("a failed send offers a prefilled GitHub issue link", async ({ page }) => {
  const sent = await stubApi(page, 503, { error: "Feedback is not available right now", code: "feedback-unavailable" });
  await openDesktop(page, "retro");
  await page.locator(".os-tray").getByRole("button", { name: "Send feedback" }).click();
  const form = await expectFormBasics(page);
  await form.getByRole("button", { name: "Thumbs down" }).click();
  await form.getByRole("textbox", { name: /Comment/ }).fill("The clock is wrong & slow");
  await form.getByRole("button", { name: "Send", exact: true }).click();

  const alert = form.getByRole("alert");
  await expect(alert).toContainText("Feedback can't be sent from this site right now.");
  await expect(alert).toContainText("it's public too");
  await expect(form.getByText("This is public.")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ rating: "down", context: { app: "search", view: "os", style: "retro" } });

  const href = await alert.getByRole("link", { name: "Open a prefilled issue on GitHub" }).getAttribute("href");
  const url = new URL(href ?? "");
  expect(`${url.origin}${url.pathname}`).toBe("https://github.com/sidagarwal-labs/portfolio/issues/new");
  expect(url.searchParams.get("title")).toBe("Feedback: 👎 on Sid Search");
  expect(url.searchParams.get("labels")).toBe("feedback");
  const body = url.searchParams.get("body") ?? "";
  expect(body).toContain("Rating: 👎 Thumbs down");
  expect(body).toContain("The clock is wrong & slow");
  expect(body).toContain("- app: search");
  expect(body).toContain("- style: retro");
  expect(href).not.toContain(" ");
  await expect(form.getByRole("button", { name: "Try again" })).toBeEnabled();
});

test("a network failure also falls back to GitHub", async ({ page }) => {
  await page.route(api, (route) => route.abort());
  await openDesktop(page);
  await page.locator(".os-tray").getByRole("button", { name: "Send feedback" }).click();
  const form = dialog(page);
  await form.getByRole("button", { name: "Thumbs up" }).click();
  await form.getByRole("button", { name: "Send", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Your feedback couldn't be sent.");
  await expect(form.getByRole("link", { name: "Open a prefilled issue on GitHub" })).toHaveAttribute("href", /title=Feedback%3A%20%F0%9F%91%8D%20on%20Sid%20Search&body=.*&labels=feedback$/);
});

test("feedback is reachable from Settings on a phone", async ({ page }) => {
  const sent = await stubApi(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?view=os&style=modern");
  await page.locator(".os-home").getByRole("list", { name: "Apps", exact: true }).locator(".os-icon", { hasText: "Settings" }).click();
  const win = page.locator('.os-win[data-app="settings"]');
  await win.getByRole("button", { name: "Send feedback" }).click();
  const form = await expectFormBasics(page);
  const box = await form.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844.5);
  await form.getByRole("button", { name: "Thumbs up" }).click();
  await form.getByRole("button", { name: "Send", exact: true }).click();
  await expect(form.getByRole("link", { name: "issue #123" })).toBeVisible();
  expect(sent[0].context).toEqual({ app: "settings", view: "os", style: "modern" });
});

test("an accepted send without an issue number still thanks the visitor", async ({ page }) => {
  await stubApi(page, 201, { ok: true });
  await openDesktop(page);
  await page.locator(".os-tray").getByRole("button", { name: "Send feedback" }).click();
  const form = dialog(page);
  await form.getByRole("button", { name: "Thumbs up" }).click();
  await form.getByRole("button", { name: "Send", exact: true }).click();
  await expect(form.getByText("Thanks! Your feedback was sent.")).toBeVisible();
  await expect(form.getByRole("link")).toHaveCount(0);
});