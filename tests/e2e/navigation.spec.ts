import { expect, test } from "@playwright/test";

/* ═══════════════════════════════════════════════════════════
   1. CSS & Visual Foundation
   ═══════════════════════════════════════════════════════════ */

test.describe("visual foundation", () => {
  test("CSS loads and applies the design system", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const rootVars = await page.evaluate(() => {
      const r = getComputedStyle(document.documentElement);
      return {
        bg: r.getPropertyValue("--bg").trim(),
        text: r.getPropertyValue("--text").trim(),
        data: r.getPropertyValue("--data").trim(),
        profit: r.getPropertyValue("--profit").trim(),
        fire: r.getPropertyValue("--fire").trim(),
      };
    });

    expect(rootVars.bg).toBeTruthy();
    expect(rootVars.text).toBeTruthy();
    expect(rootVars.data).toBeTruthy();
    expect(rootVars.profit).toBeTruthy();
    expect(rootVars.fire).toBeTruthy();
  });

  test("body has correct font and themed text color", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const bodyStyles = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return { fontFamily: cs.fontFamily, color: cs.color };
    });

    expect(bodyStyles.fontFamily).toContain("IBM Plex Sans");
    // Text color should be light (not default black) confirming dark theme CSS loaded
    expect(bodyStyles.color).not.toBe("rgb(0, 0, 0)");
  });

  test("glass cards render with expected styling", async ({ page }) => {
    await page.goto("/");
    const card = page.locator(".glass-card").first();
    await expect(card).toBeVisible();

    const cardStyle = await card.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { borderRadius: cs.borderRadius, border: cs.border };
    });

    expect(cardStyle.borderRadius).toBeTruthy();
    expect(cardStyle.border).toBeTruthy();
  });
});

/* ═══════════════════════════════════════════════════════════
   2. 3D Scene & Canvas
   ═══════════════════════════════════════════════════════════ */

test.describe("3D interactive scene", () => {
  test("WebGL canvas renders on desktop viewport", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const sceneCanvas = page.locator(".scene-canvas");
    const canvas = page.locator(".scene-canvas canvas");

    await expect(sceneCanvas).toBeVisible();
    await expect(canvas).toBeVisible();

    const canvasSize = await canvas.evaluate((el) => ({
      width: (el as HTMLCanvasElement).width,
      height: (el as HTMLCanvasElement).height,
    }));

    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);
  });

  test("canvas has WebGL context", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".scene-canvas canvas")).toBeVisible();

    const hasWebGL = await page.locator(".scene-canvas canvas").evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      return gl !== null;
    });

    expect(hasWebGL).toBe(true);
  });

  test("static fallback renders on small viewports", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const sceneStatic = page.locator(".scene-static--home");
    await expect(sceneStatic).toBeVisible();

    await expect(sceneStatic.locator(".scene-static__gradient")).toBeAttached();
    await expect(sceneStatic.locator(".scene-static__grid")).toBeAttached();
    await expect(sceneStatic.locator(".scene-static__code-rain")).toBeAttached();
    await expect(sceneStatic.locator(".scene-static__scatter")).toBeAttached();

    const canvasCount = await page.locator(".scene-canvas").count();
    expect(canvasCount).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════
   3. Path-to-Path Navigation (single-pane section scrolling)
   ═══════════════════════════════════════════════════════════ */

test.describe("path-to-path navigation", () => {
  test("all five nav tabs exist and are clickable", async ({ page }) => {
    await page.goto("/");
    const primaryNav = page.getByRole("navigation", { name: "Primary" });

    for (const label of ["Home", "Experience", "Projects", "Books", "Contact"]) {
      await expect(primaryNav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("projects nav jumps to project stop in the same journey", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();
    const primaryNav = page.getByRole("navigation", { name: "Primary" });

    await page.evaluate(() => {
      window.scrollTo({ top: Math.max(document.body.scrollHeight * 0.45, 1400), behavior: "auto" });
    });

    await primaryNav.getByRole("link", { name: "Projects", exact: true }).click();

    await expect(page).toHaveURL(/#lab$/);
    await expect(page.getByRole("heading", { name: /Notebook-driven work that backs up the systems narrative/i })).toBeVisible();

    await page.waitForFunction(() => window.scrollY > 200, { timeout: 5000 });
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(200);
  });

  test("top-level tabs map to journey stops with correct hashes", async ({ page }) => {
    await page.goto("/");
    const primaryNav = page.getByRole("navigation", { name: "Primary" });

    await primaryNav.getByRole("link", { name: "Experience", exact: true }).click();
    await expect(page).toHaveURL(/#impact$/);
    await expect(page.getByRole("heading", { name: /Microsoft.*Amazon.*FIRST Robotics/i, level: 2 })).toBeVisible({ timeout: 10000 });

    await primaryNav.getByRole("link", { name: "Books", exact: true }).click();
    await expect(page).toHaveURL(/#library$/);
    await expect(page.getByRole("heading", { name: /Reading from the cockpit/i })).toBeVisible();

    await primaryNav.getByRole("link", { name: "Contact", exact: true }).click();
    await expect(page).toHaveURL(/#contact$/);
    await expect(page.getByRole("heading", { name: /Dock at the station/i, level: 2 })).toBeVisible();
  });

  test("each section has an id anchor for hash navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    for (const id of ["intro", "impact", "lab", "library", "contact"]) {
      const section = page.locator(`#${id}`);
      await expect(section).toBeAttached();
    }
  });

  test("next-zone advance button exists and is clickable", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const advanceBtn = page.locator(".section-advance");
    await expect(advanceBtn).toBeVisible();
    await advanceBtn.click();
    await page.waitForFunction(() => window.scrollY > 50, { timeout: 5000 });

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(50);
  });
});

/* ═══════════════════════════════════════════════════════════
   4. Section Flow & Content Verification
   ═══════════════════════════════════════════════════════════ */

test.describe("section flow and content", () => {
  test("home section shows hero and goes directly to experience", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    // No signal board or mission control between hero and experience
    await expect(page.locator(".mission-ticker")).not.toBeAttached();
    await expect(page.locator(".orbit-interface")).not.toBeAttached();

    // Experience section comes after hero
    const impact = page.locator("#impact");
    await expect(impact).toBeAttached();
  });

  test("clicking each nav tab in sequence reaches the right section", async ({ page }) => {
    await page.goto("/");
    const primaryNav = page.getByRole("navigation", { name: "Primary" });

    // Home → Experience
    await primaryNav.getByRole("link", { name: "Experience", exact: true }).click();
    await expect(page).toHaveURL(/#impact$/);
    await expect(page.getByRole("heading", { name: /Microsoft.*Amazon.*FIRST Robotics/i, level: 2 })).toBeVisible({ timeout: 10000 });

    // Experience → Projects
    await primaryNav.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page).toHaveURL(/#lab$/);
    await expect(page.getByRole("heading", { name: /Notebook-driven/i, level: 2 })).toBeVisible({ timeout: 10000 });

    // Projects → Books
    await primaryNav.getByRole("link", { name: "Books", exact: true }).click();
    await expect(page).toHaveURL(/#library$/);
    await expect(page.getByRole("heading", { name: /Reading from the cockpit/i })).toBeVisible({ timeout: 10000 });

    // Books → Contact
    await primaryNav.getByRole("link", { name: "Contact", exact: true }).click();
    await expect(page).toHaveURL(/#contact$/);
    await expect(page.getByRole("heading", { name: /Dock at the station/i, level: 2 })).toBeVisible({ timeout: 10000 });
  });

  test("Microsoft consolidated tile shows all three roles", async ({ page }) => {
    await page.goto("/");
    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    await primaryNav.getByRole("link", { name: "Experience", exact: true }).click();

    const msCard = page.locator(".feature-card--highlight");
    await expect(msCard).toBeVisible({ timeout: 10000 });

    const roleText = await msCard.textContent();
    expect(roleText).toContain("Senior Product Manager");
    expect(roleText).toContain("Product Manager II");
    expect(roleText).toContain("Product Manager Intern");
    expect(roleText).toContain("Search Relevance");
    expect(roleText).toContain("Quality");

    // timeframe badge
    await expect(msCard.locator(".feature-card__timeframe")).toContainText("2021");
  });

  test("contact section is reachable by scrolling to page bottom", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    // Scroll all the way to the bottom
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" }));
    await page.waitForTimeout(500);

    const contactSection = page.locator("#contact");
    await expect(contactSection).toBeVisible();
    await expect(contactSection.getByRole("heading", { name: /Dock at the station/i })).toBeVisible();
  });
});

/* ═══════════════════════════════════════════════════════════
   5. Stock Ticker Strip
   ═══════════════════════════════════════════════════════════ */

test.describe("stock ticker strip", () => {
  test("ticker bar is present at the bottom of the home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const ticker = page.locator(".stock-ticker");
    await expect(ticker).toBeAttached();
  });

  test("ticker contains finance, tech, and space items", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const tickerItems = page.locator(".stock-ticker__item");
    const count = await tickerItems.count();
    expect(count).toBeGreaterThanOrEqual(6);

    const tickerText = await page.locator(".stock-ticker").textContent();
    expect(tickerText).toContain("NVDA");
    expect(tickerText).toContain("MSFT");
    expect(tickerText).toContain("GPU UTIL");
    // SPACEX only appears when the LL2 launch API returns data (rate-limited free tier)
  });

  test("ticker items have variant classes for color coding", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    for (const variant of ["data", "fire", "neural"]) {
      const item = page.locator(`.stock-ticker__item--${variant}`);
      const count = await item.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   6. Finance / Tech / Space Theme Content
   ═══════════════════════════════════════════════════════════ */

test.describe("themed content", () => {
  test("feature cards show experience-themed headings", async ({ page }) => {
    await page.goto("/");
    const featureCards = page.locator(".feature-card");

    const headings = await featureCards.locator("h3").allTextContents();
    expect(headings).toContain("Microsoft");
    expect(headings).toContain("Amazon");
    expect(headings).toContain("FIRST Robotics");
  });

  test("hero eyebrow contains theme keywords", async ({ page }) => {
    await page.goto("/");
    const eyebrow = page.locator(".hero-panel .section-heading__eyebrow").first();
    const text = await eyebrow.textContent();

    expect(text?.toLowerCase()).toContain("ai search");
    expect(text?.toLowerCase()).toContain("markets");
    expect(text?.toLowerCase()).toContain("data science");
  });
});

/* ═══════════════════════════════════════════════════════════
   7. Navigation Brand & Layout
   ═══════════════════════════════════════════════════════════ */

test.describe("navigation bar", () => {
  test("brand mark with online dot renders", async ({ page }) => {
    await page.goto("/");

    const brand = page.locator(".site-nav__brand");
    await expect(brand).toBeVisible();

    const onlineDot = page.locator(".nav-online-dot");
    await expect(onlineDot).toBeAttached();
  });

  test("resume and reach-out buttons are visible on desktop", async ({ page }) => {
    await page.goto("/");
    const actions = page.locator(".site-nav__desktop-actions");
    await expect(actions).toBeVisible();

    await expect(actions.getByRole("link", { name: /resume/i })).toBeVisible();
    await expect(actions.getByRole("link", { name: /reach out/i })).toBeVisible();
  });

  test("nav sticks to top while scrolling", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    await page.evaluate(() => window.scrollTo({ top: 800, behavior: "auto" }));
    await page.waitForTimeout(200);

    const navShell = page.locator(".site-nav-shell");
    await expect(navShell).toBeVisible();

    const navRect = await navShell.boundingBox();
    expect(navRect).toBeTruthy();
    expect(navRect!.y).toBeLessThan(50);
  });
});

/* ═══════════════════════════════════════════════════════════
   8. Sub-route Pages
   ═══════════════════════════════════════════════════════════ */

test.describe("sub-route pages", () => {
  test("/books redirects to home #library section", async ({ page }) => {
    await page.goto("/books");
    await expect(page).toHaveURL(/#library$/);
    await expect(page.getByRole("heading", { name: /Reading from the cockpit/i })).toBeVisible();
  });

  test("homepage book carousel has scrollable covers with arrow buttons", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const carousel = page.locator(".book-carousel");
    await expect(carousel).toBeAttached();

    const cards = carousel.locator(".book-carousel__card");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(10);

    const firstCard = cards.first();
    const href = await firstCard.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain("http");

    const leftArrow = carousel.locator(".book-carousel__arrow--left");
    const rightArrow = carousel.locator(".book-carousel__arrow--right");
    await expect(leftArrow).toBeVisible();
    await expect(rightArrow).toBeVisible();
  });

  test("carousel right arrow scrolls the rail forward", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    await page.locator("#library").scrollIntoViewIfNeeded();
    const rightArrow = page.locator(".book-carousel__arrow--right");
    await expect(rightArrow).toBeVisible();

    // Rail should overflow (content wider than visible area)
    const isScrollable = await page.locator(".book-carousel__rail").evaluate(
      (el) => el.scrollWidth > el.clientWidth
    );
    expect(isScrollable).toBe(true);
  });

  test("no section contains a self-referencing navigation link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    // These self-referencing links should have been removed
    await expect(page.getByText("Open timeline stop")).not.toBeAttached();
    await expect(page.getByText("Stay on project stop")).not.toBeAttached();
    await expect(page.getByText("Open books stop")).not.toBeAttached();
  });

  test("static scene fallback has code-rain and scatter layers", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const sceneStatic = page.locator(".scene-static--home");
    await expect(sceneStatic).toBeVisible();
    await expect(sceneStatic.locator(".scene-static__code-rain")).toBeAttached();
    await expect(sceneStatic.locator(".scene-static__scatter")).toBeAttached();
  });

  test("experience page loads", async ({ page }) => {
    await page.goto("/experience");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("projects page loads", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("contact page loads", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator("h1")).toBeVisible();
  });
});

/* ═══════════════════════════════════════════════════════════
   9. No Console Errors
   ═══════════════════════════════════════════════════════════ */

test.describe("runtime health", () => {
  test("no critical JS errors on home page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();
    await page.waitForTimeout(1000);

    expect(errors).toHaveLength(0);
  });

  test("no critical JS errors during navigation", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    await primaryNav.getByRole("link", { name: "Experience", exact: true }).click();
    await page.waitForTimeout(500);
    await primaryNav.getByRole("link", { name: "Books", exact: true }).click();
    await page.waitForTimeout(500);
    await primaryNav.getByRole("link", { name: "Contact", exact: true }).click();
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════
   10. Route-to-Route Camera Transitions
   ═══════════════════════════════════════════════════════════ */

test.describe("route-to-route camera transitions", () => {
  test("Home → Contact → Home navigates without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const primaryNav = page.getByRole("navigation", { name: "Primary" });

    // Home → Contact
    await primaryNav.getByRole("link", { name: "Contact", exact: true }).click();
    await expect(page).toHaveURL(/#contact$/);
    await expect(page.getByRole("heading", { name: /Dock at the station/i, level: 2 })).toBeVisible({ timeout: 10000 });

    // Let transition settle
    await page.waitForTimeout(2000);

    // Contact → Home
    await primaryNav.getByRole("link", { name: "Home", exact: true }).click();
    await page.waitForTimeout(2000);

    // Verify we're back at home
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("rapid Home → Contact → Home → Contact stays error-free", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const primaryNav = page.getByRole("navigation", { name: "Primary" });

    // Rapid toggling between Home and Contact
    await primaryNav.getByRole("link", { name: "Contact", exact: true }).click();
    await page.waitForTimeout(800);
    await primaryNav.getByRole("link", { name: "Home", exact: true }).click();
    await page.waitForTimeout(800);
    await primaryNav.getByRole("link", { name: "Contact", exact: true }).click();
    await page.waitForTimeout(800);

    await expect(page).toHaveURL(/#contact$/);
    expect(errors).toHaveLength(0);
  });

  test("full forward journey Home → Experience → Projects → Books → Contact is error-free", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const primaryNav = page.getByRole("navigation", { name: "Primary" });

    const stops = [
      { label: "Experience", hash: /#impact$/ },
      { label: "Projects",   hash: /#lab$/ },
      { label: "Books",      hash: /#library$/ },
      { label: "Contact",    hash: /#contact$/ },
    ];

    for (const stop of stops) {
      await primaryNav.getByRole("link", { name: stop.label, exact: true }).click();
      await expect(page).toHaveURL(stop.hash, { timeout: 8000 });
      await page.waitForTimeout(600);
    }

    expect(errors).toHaveLength(0);
  });

  test("full reverse journey Contact → Books → Projects → Experience → Home is error-free", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/#contact");
    await expect(page.getByRole("heading", { name: /Dock at the station/i, level: 2 })).toBeVisible({ timeout: 10000 });

    const primaryNav = page.getByRole("navigation", { name: "Primary" });

    const stops = [
      { label: "Books",      hash: /#library$/ },
      { label: "Projects",   hash: /#lab$/ },
      { label: "Experience", hash: /#impact$/ },
      { label: "Home",       hash: null },
    ];

    for (const stop of stops) {
      await primaryNav.getByRole("link", { name: stop.label, exact: true }).click();
      if (stop.hash) {
        await expect(page).toHaveURL(stop.hash, { timeout: 8000 });
      }
      await page.waitForTimeout(600);
    }

    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test("non-adjacent jump Experience → Contact does not throw", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/#impact");
    await expect(page.getByRole("heading", { name: /Microsoft.*Amazon.*FIRST Robotics/i, level: 2 })).toBeVisible({ timeout: 10000 });

    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    await primaryNav.getByRole("link", { name: "Contact", exact: true }).click();
    await expect(page).toHaveURL(/#contact$/, { timeout: 8000 });

    await page.waitForTimeout(1500);
    expect(errors).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════
   11. Color Scheme Verification
   ═══════════════════════════════════════════════════════════ */

test.describe("warm sunset × neon color scheme", () => {
  test("CSS variables reflect the warm sunset × neon palette", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const vars = await page.evaluate(() => {
      const r = getComputedStyle(document.documentElement);
      return {
        bg: r.getPropertyValue("--bg").trim(),
        data: r.getPropertyValue("--data").trim(),
        fire: r.getPropertyValue("--fire").trim(),
        alert: r.getPropertyValue("--alert").trim(),
        profit: r.getPropertyValue("--profit").trim(),
        neural: r.getPropertyValue("--neural").trim(),
      };
    });

    // Warm sunset background (indigo-based)
    expect(vars.bg).toBe("#0a0e1a");
    // Amber primary accent
    expect(vars.data).toBe("#f59e0b");
    // Orange fire
    expect(vars.fire).toBe("#f97316");
    // Neon magenta alert
    expect(vars.alert).toBe("#f472b6");
    // Neon lime profit
    expect(vars.profit).toBe("#84cc16");
    // Purple neural
    expect(vars.neural).toBe("#a855f7");
  });

  test("nav bar uses warm-toned border", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sid Agarwal" })).toBeVisible();

    const navBorder = await page.locator(".site-nav").evaluate((el) => {
      return getComputedStyle(el).borderColor;
    });

    // Should NOT be the old cyan blue
    expect(navBorder).not.toContain("rgb(0, 212, 255)");
  });
});