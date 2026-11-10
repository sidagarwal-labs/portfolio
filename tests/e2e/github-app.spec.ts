import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { buildLaunch, buildMarket, buildRepoLab, computeStats, createTrainer } from "../../src/features/views/os/github/analytics";
import { curateOwnInsights } from "../../src/features/views/os/github/client";
import { OWN_HIDDEN_REPOS, type GitHubInsights } from "../../src/features/views/os/github/contract";
import { fmtDate, fmtInt, fmtNum, fmtP, fmtPct, plural } from "../../src/features/views/os/github/ui/format";

const rawSnapshot = JSON.parse(readFileSync(new URL("../../src/content/generated/github-insights.json", import.meta.url), "utf8")) as GitHubInsights;
// The app shows the owner's snapshot with tutorial repositories removed.
const snapshot = curateOwnInsights(rawSnapshot);
const stats = computeStats(snapshot);
const githubWin = '.os-win[data-app="github"]';

/* ---------- REST fixtures (relative to today, like the client's 90-day window) ---------- */

const DAY_MS = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "x-ratelimit-remaining, x-ratelimit-reset, retry-after"
};

type RestFixture = { user: Record<string, unknown>; repos: Record<string, unknown>[]; events: Record<string, unknown>[] };

const restUser = (login: string, name: string) => ({
  login, name, type: "User", bio: `${name} writes code.`,
  avatar_url: `https://avatars.githubusercontent.com/u/${login.length}`, html_url: `https://github.com/${login}`
});
const restRepo = (owner: string, name: string, language: string | null, ageDays: number) => ({
  name, full_name: `${owner}/${name}`, html_url: `https://github.com/${owner}/${name}`, description: null, language, size: 40 + ageDays,
  stargazers_count: ageDays % 3, forks_count: 0, created_at: `${daysAgo(ageDays)}T00:00:00Z`, pushed_at: `${daysAgo(2)}T00:00:00Z`,
  fork: false, private: false, owner: { login: owner }
});
const restEvent = (type: string, day: number, repo: string) => ({
  type, created_at: `${daysAgo(day)}T12:00:00Z`, repo: { name: repo }, payload: type === "PullRequestEvent" ? { action: "opened" } : {}, public: true
});

const OCTO_REPOS = ["alpha", "beta", "gamma", "delta", "epsilon"];
const octo: RestFixture = {
  user: restUser("Octo", "Octo Cat"),
  repos: OCTO_REPOS.map((name, i) => restRepo("Octo", name, ["Python", "TypeScript", "Jupyter Notebook", "Go", null][i], 120 + i * 200)),
  events: Array.from({ length: 88 }, (_, i) => i + 1)
    .filter((day) => day % 3 === 0 || day % 7 === 1)
    .flatMap((day) => {
      const repo = `Octo/${OCTO_REPOS[day % OCTO_REPOS.length]}`;
      return day % 5 === 0 ? [restEvent("PushEvent", day, repo), restEvent("PullRequestEvent", day, repo)] : [restEvent("PushEvent", day, repo)];
    })
};
const quiet: RestFixture = {
  user: restUser("quiet", "Quiet Person"),
  repos: [restRepo("quiet", "solo", "Python", 400)],
  events: [3, 10, 40].map((day) => restEvent("PushEvent", day, "quiet/solo"))
};

async function blockExternal(page: Page) {
  // Registered first so the GitHub mocks registered later take precedence.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
}

async function mockGitHub(page: Page, users: Record<string, RestFixture>, special: Record<string, (route: Route) => Promise<void>> = {}) {
  await page.route("https://api.github.com/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*" } });
      return;
    }
    const url = new URL(route.request().url());
    const match = url.pathname.match(/^\/users\/([^/]+)(\/repos|\/events\/public)?$/);
    const login = match?.[1].toLowerCase() ?? "";
    if (special[login]) return special[login](route);
    const fixture = users[login];
    if (!match || !fixture) {
      await route.fulfill({ status: 404, headers: CORS, contentType: "application/json", body: JSON.stringify({ message: "Not Found" }) });
      return;
    }
    const body = match[2] === "/repos" ? fixture.repos : match[2] === "/events/public" ? (url.searchParams.get("page") === "1" ? fixture.events : []) : fixture.user;
    await route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function openGitHub(page: Page, { reducedMotion = true, url = "./?view=os" } = {}) {
  await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  await page.goto(url);
  await page.getByRole("button", { name: "Show desktop", exact: true }).click();
  await page.locator(".os-icons .os-icon", { hasText: "GitHub" }).click();
  const win = page.locator(githubWin);
  await expect(win).toHaveClass(/is-active/);
  await expect(win.getByRole("heading", { level: 3, name: snapshot.name ?? snapshot.login })).toBeVisible();
  return win;
}

const stat = (win: Locator, id: string) => win.locator(`[data-stat="${id}"] .gh-stat__value`);
const metric = (scope: Locator, id: string) => scope.locator(`[data-metric="${id}"] .gh-metric__value`);

test.beforeEach(async ({ page }) => {
  await blockExternal(page);
});

test("opens from the desktop on the owner's snapshot with an accessible heatmap and computed stats", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openGitHub(page);

  await expect(win.getByText(`@${snapshot.login}`, { exact: true })).toBeVisible();
  const profileLink = win.getByRole("link", { name: "Open on GitHub" }).first();
  await expect(profileLink).toHaveAttribute("href", snapshot.htmlUrl);
  await expect(profileLink).toHaveAttribute("target", "_blank");
  await expect(win.getByRole("note")).toHaveCount(0);

  await expect(win.locator("rect.gh-cell")).toHaveCount(snapshot.days.length);
  expect(snapshot.days.length).toBe(367);
  const summary = `${fmtInt(stats.total)} contributions on ${stats.activeDays} of ${stats.days} days`;
  await expect(win.getByRole("img", { name: new RegExp(`^Contribution calendar.*${summary}`) })).toHaveCount(1);
  const months = new Set(snapshot.days.map((day) => day.date.slice(0, 7))).size;
  await expect(win.getByRole("table", { name: "contributions by month" }).locator("tbody tr")).toHaveCount(months);
  const busiest = stats.maxDay!;
  await expect(win.locator(`rect.gh-cell[data-date="${busiest.date}"] title`)).toHaveText(`${fmtDate(busiest.date)}: ${busiest.count} contributions`);

  await expect(stat(win, "total")).toHaveText(fmtInt(stats.total));
  await expect(stat(win, "active-days")).toHaveText(fmtInt(stats.activeDays));
  await expect(stat(win, "longest-streak")).toHaveText(plural(stats.longestStreak?.length ?? 0, "day"));
  await expect(stat(win, "current-streak")).toHaveText(plural(stats.currentStreak, "day"));
  await expect(stat(win, "busiest-week")).toHaveText(fmtInt(stats.busiestWeek!.total));
  await expect(stat(win, "concentration")).toHaveText(fmtNum(stats.giniConcentration));

  await expect(win.locator(".gh-repo__name")).toHaveText(stats.topRepos.slice(0, 8).map((repo) => repo.name));
  if (stats.topRepos.length > 8) {
    await win.getByRole("button", { name: `Show all ${stats.topRepos.length}` }).click();
    await expect(win.locator(".gh-repo__name")).toHaveCount(stats.topRepos.length);
  }
  const repoNames = new Set(snapshot.repos.map((repo) => repo.name));
  const hidden = new Set(OWN_HIDDEN_REPOS.map((name) => name.toLowerCase()));
  for (const name of await win.locator(".gh-repo__name").allTextContents()) {
    expect(repoNames.has(name)).toBe(true);
    expect(hidden.has(name.toLowerCase()), `${name} should be hidden`).toBe(false);
  }
  await expect(win.locator(".gh-langs li").first()).toContainText(stats.languages[0].name);
});

test("lab tabs follow the ARIA tabs pattern and show model output", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openGitHub(page);
  const tab = (name: string) => win.getByRole("tab", { name, exact: true });
  const panel = (name: string) => win.getByRole("tabpanel", { name, exact: true });

  await expect(win.getByRole("tab")).toHaveText(["Training run", "Market", "Launch", "Data science lab"]);
  await expect(tab("Training run")).toHaveAttribute("aria-selected", "true");
  await expect(panel("Training run").getByRole("heading", { level: 4 })).toHaveText(["Training", "Results", "Caveats", "Method"]);

  await tab("Training run").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Market")).toBeFocused();
  await expect(tab("Market")).toHaveAttribute("aria-selected", "true");
  await expect(tab("Training run")).toHaveAttribute("tabindex", "-1");
  await expect(panel("Training run")).toBeHidden();
  const market = buildMarket(snapshot.days);
  if ("insufficient" in market) throw new Error(market.insufficient);
  const marketPanel = panel("Market");
  await expect(marketPanel.getByRole("heading", { level: 4 })).toHaveText(["Results", "Caveats", "Method"]);
  await expect(metric(marketPanel, "momentum")).toHaveText(`r = ${fmtNum(market.momentum.statistic)}`);
  await expect(marketPanel.locator('[data-metric="momentum"]')).toContainText(`p = ${fmtP(market.momentum.pValue)}, ${market.momentum.significant ? "significant" : "not significant"}`);
  await expect(metric(marketPanel, "trend")).toHaveText(fmtPct(market.trendBacktest.accuracy, 1));
  await expect(marketPanel.locator("g.gh-candle")).toHaveCount(market.candles.length);
  const priceFigure = marketPanel.locator("figure").first();
  await expect(priceFigure.locator("figcaption")).toContainText("log scale");
  await expect(priceFigure.locator("svg")).toHaveAttribute("aria-label", /log scale/);
  // Log-axis ticks are doublings, so each is twice the one below it.
  const priceTicks = (await priceFigure.locator("svg > g.gh-axis").first().locator("text").allTextContents()).map((t) => Number(t.replace(/,/g, "")));
  expect(priceTicks.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < priceTicks.length; i++) expect(priceTicks[i] / priceTicks[i - 1]).toBeCloseTo(2, 9);
  const paths = await marketPanel.locator("svg path, svg rect, svg line").evaluateAll((els) =>
    els.flatMap((el) => ["d", "x", "y", "width", "height", "x1", "x2", "y1", "y2"].map((name) => el.getAttribute(name) ?? ""))
  );
  expect(paths.filter((v) => /NaN|Infinity/.test(v))).toEqual([]);
  await expect(marketPanel.getByRole("img", { name: /MACD\(12, 26, 9\).*after a 33-day warm-up/ })).toBeVisible();
  await expect(marketPanel.getByRole("img", { name: /RSI\(14\).*after a 14-day warm-up/ })).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(tab("Launch")).toBeFocused();
  const launch = buildLaunch(snapshot);
  const launchPanel = panel("Launch");
  await expect(launchPanel.locator(".gh-stage")).toHaveCount(launch.stages.length);
  await expect(launchPanel.locator(".gh-stage__title").first()).toContainText(`Stage 1: led by ${launch.stages[0].dominantRepo}`);
  await expect(metric(launchPanel, "peak-velocity")).toHaveText(`${fmtNum(launch.maxVelocity!.velocity)}/day`);
  const slider = launchPanel.getByRole("slider", { name: "Day to inspect" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(launchPanel.locator(".gh-scrubber__readout")).toContainText(fmtDate(snapshot.days[0].date));

  await tab("Launch").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Data science lab")).toBeFocused();
  const lab = buildRepoLab(snapshot.repos);
  if ("insufficient" in lab) throw new Error(lab.insufficient);
  const labPanel = panel("Data science lab");
  await expect(metric(labPanel, "k")).toHaveText(String(lab.k));
  await expect(metric(labPanel, "silhouette")).toHaveText(fmtNum(lab.silhouette));
  await expect(labPanel.locator("circle.gh-point")).toHaveCount(lab.points.length);
  const frames = lab.iterations.length;
  await expect(labPanel.locator(".gh-frames__label")).toContainText(`Frame ${frames} of ${frames}`);
  const updates = frames - lab.k;
  const last = lab.iterations[frames - 1];
  await expect(labPanel.locator(".gh-frames__label")).toContainText(`Update ${updates}: centroids move to cluster means, ${plural(last.changed, "repository", "repositories")} changed cluster; inertia ${fmtNum(last.inertia)}`);
  await expect(metric(labPanel, "updates")).toHaveText(String(updates));
  await labPanel.getByRole("button", { name: "Previous frame" }).click();
  await expect(labPanel.locator(".gh-frames__label")).toContainText(`Frame ${frames - 1} of ${frames}`);
  for (let i = frames - 1; i > 1; i--) await labPanel.getByRole("button", { name: "Previous frame" }).click();
  await expect(labPanel.locator(".gh-frames__count")).toHaveText(`Frame 1 of ${frames}`);
  await expect(labPanel.locator(".gh-frames__step")).toHaveText(`Seed 1 of ${lab.k}: one repository picked at random; inertia ${fmtNum(lab.iterations[0].inertia)}`);
  await expect(labPanel.getByRole("button", { name: "Previous frame" })).toBeDisabled();
  await expect(labPanel.locator(".gh-centroid")).toHaveCount(1);
  await labPanel.getByRole("button", { name: "Next frame" }).click();
  await expect(labPanel.locator(".gh-frames__label")).toContainText(`Seed 2 of ${lab.k}: picked at random, favoring repositories far from earlier seeds`);
  await expect(labPanel.locator(".gh-centroid")).toHaveCount(2);

  const caveats = labPanel.getByRole("region", { name: "Caveats" });
  const largestK = lab.silhouetteByK.at(-1)!.k;
  await expect(caveats.getByText("the largest k tried", { exact: false })).toHaveCount(lab.k === largestK ? 1 : 0);
  await expect(labPanel.locator(".gh-figure rect.gh-bar")).toHaveCount(lab.silhouetteByK.length);
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const feature of lab.droppedFeatures) await expect(caveats).toContainText(new RegExp(escape(feature), "i"));
  if (lab.droppedFeatures.length === 1) await expect(caveats).toContainText("was left out because it is the same for every repository here.");
  await expect(labPanel).toContainText(`which leaves ${lab.featureNames.length} features here`);
  await labPanel.locator("circle.gh-point").first().focus();
  await expect(labPanel.locator(".gh-scatter__readout")).toContainText(lab.points[0].name);

  await tab("Data science lab").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Training run")).toBeFocused();
  await page.keyboard.press("End");
  await expect(tab("Data science lab")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tab("Training run")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(tab("Data science lab")).toBeFocused();
});

test("method and caveat notes start folded and expand on demand", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openGitHub(page);
  const panel = win.getByRole("tabpanel", { name: "Training run", exact: true });
  await expect(panel.getByRole("region", { name: "Results", exact: true }).getByRole("button", { name: /details/ })).toHaveCount(0);
  for (const title of ["Caveats", "Method"]) {
    const section = panel.getByRole("region", { name: title, exact: true });
    const body = section.locator(".gh-lab__fold-body");
    const show = section.getByRole("button", { name: `Show details for ${title}` });
    await expect(show).toHaveAttribute("aria-expanded", "false");
    await expect(show).toHaveAttribute("aria-controls", (await body.getAttribute("id"))!);
    await expect(body).toBeHidden();
    await show.click();
    await expect(section.getByRole("button", { name: `Hide details for ${title}` })).toHaveAttribute("aria-expanded", "true");
    await expect(body).toBeVisible();
  }
  await expect(panel.locator(".gh-caveats li").first()).toBeVisible();
  await panel.getByRole("button", { name: "Hide details for Method" }).click();
  await expect(panel.getByRole("region", { name: "Method", exact: true }).locator(".gh-lab__fold-body")).toBeHidden();
  await expect(panel.getByRole("button", { name: "Show details for Method" })).toBeFocused();
});

test("training animates epoch by epoch, pauses, and skips to the trainer's result", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openGitHub(page, { reducedMotion: false });
  const panel = win.getByRole("tabpanel", { name: "Training run" });
  const epoch = panel.locator(".gh-train__epoch");
  await epoch.scrollIntoViewIfNeeded();
  await expect.poll(async () => Number(await epoch.getAttribute("data-epoch"))).toBeGreaterThan(0);
  await panel.getByRole("button", { name: "Pause" }).click();
  await expect(panel.getByRole("button", { name: "Resume" })).toBeVisible();
  const paused = Number(await epoch.getAttribute("data-epoch"));
  expect(paused).toBeLessThan(150);
  await page.waitForTimeout(400);
  expect(Number(await epoch.getAttribute("data-epoch"))).toBe(paused);

  await panel.getByRole("button", { name: "Skip to result" }).click();
  const result = createTrainer(snapshot.days).finish();
  await expect(epoch).toHaveText(`Epoch ${result.config.epochs} of ${result.config.epochs}`);
  const results = panel.getByRole("region", { name: "Results", exact: true });
  // Lead with the classifier, then count error against every simple predictor (always-0 included).
  await expect(results.locator("[data-metric]").first()).toHaveAttribute("data-metric", "auc");
  await expect(metric(panel, "auc")).toHaveText(result.model.auc === null ? "n/a" : fmtNum(result.model.auc));
  await expect(metric(panel, "log-loss")).toContainText(`${fmtNum(result.model.logLoss, 3)} vs `);
  if (result.model.auc !== null) await expect(results.locator(".gh-lab__lead")).toContainText(`AUC ${fmtNum(result.model.auc)}`);
  await expect(metric(panel, "model-mae")).toHaveText(fmtNum(result.model.mae));
  await expect(metric(panel, "best-baseline")).toHaveText(fmtNum(result.bestBaseline.mae));
  await expect(metric(panel, "zero-mae")).toHaveText(fmtNum(result.referenceZeroMae));
  const zeroWins = result.referenceZeroMae <= result.model.mae;
  const beatsAll = result.beatsBaselines && !zeroWins;
  await expect(panel.locator('[data-metric="model-mae"]')).toHaveClass(beatsAll ? /gh-metric--good/ : result.beatsBaselines ? /gh-metric--neutral/ : /gh-metric--bad/);
  if (zeroWins) {
    await expect(results).toContainText(`always predicting 0 scores ${fmtNum(result.referenceZeroMae)}, lower still`);
    await expect(results).not.toContainText("lower than all");
  }
  const bt = result.backtestSummary;
  await expect(metric(panel, "backtest")).toHaveText(`${fmtNum(bt.modelMae)} vs ${fmtNum(bt.baselineMae)}`);
  await expect(metric(panel, "forecast")).toHaveText(fmtNum(result.forecastWeeks[0].expected, 1));
  await expect(panel.locator('[data-metric="forecast"]')).toContainText(`${fmtInt(result.forecastWeeks[0].low)}–${fmtInt(result.forecastWeeks[0].high)}`);
  await expect(panel).toContainText(bt.modelMae < bt.baselineMae ? "the model wins" : "the model loses");
  await expect(panel.getByRole("button", { name: "Train again" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Pause" })).toHaveCount(0);
});

test("reduced motion skips the animation and shows the finished run", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openGitHub(page, { reducedMotion: true });
  const panel = win.getByRole("tabpanel", { name: "Training run" });
  await expect(panel.locator(".gh-train__epoch")).toHaveText("Epoch 150 of 150");
  await expect(metric(panel, "model-mae")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Pause" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Skip to result" })).toHaveCount(0);
});

test("looks up another user through the REST fallback, then returns to the owner", async ({ page }) => {
  await mockGitHub(page, { octo });
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openGitHub(page);

  await win.getByRole("searchbox", { name: "GitHub username" }).fill("@Octo");
  await win.getByRole("button", { name: "Look up" }).click();
  await expect(win.getByRole("heading", { level: 3, name: "Octo Cat" })).toBeVisible();
  await expect(win.getByRole("note")).toContainText("last ~90 days of public events, pushes not commits");
  await expect(win.locator("rect.gh-cell")).toHaveCount(90);
  await expect(win.locator('[data-stat="total"] .gh-stat__label')).toHaveText("Public events");
  await expect(stat(win, "total")).toHaveText(String(octo.events.length));
  await expect(win.locator(".gh-totals")).toContainText("pushes");
  await expect(win.locator(".gh-repo__name").first()).toHaveAttribute("href", /^https:\/\/github\.com\/Octo\//);

  for (const name of ["Training run", "Market", "Launch", "Data science lab"]) {
    await win.getByRole("tab", { name, exact: true }).click();
    const panel = win.getByRole("tabpanel", { name, exact: true });
    await expect(panel.locator(".gh-lab__section, .gh-guard").first()).toBeVisible();
  }
  await win.getByRole("tab", { name: "Training run", exact: true }).click();
  await expect(win.getByRole("tabpanel", { name: "Training run" }).locator(".gh-train__epoch")).toHaveText("Epoch 150 of 150");

  await win.getByRole("button", { name: `Back to ${snapshot.name}` }).click();
  await expect(win.getByRole("heading", { level: 3, name: snapshot.name! })).toBeVisible();
  await expect(win.getByRole("note")).toHaveCount(0);
  await expect(win.locator("rect.gh-cell")).toHaveCount(snapshot.days.length);
});

test("models that refuse sparse data explain why instead of crashing", async ({ page }) => {
  await mockGitHub(page, { quiet });
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openGitHub(page);
  await win.getByRole("searchbox", { name: "GitHub username" }).fill("quiet");
  await win.getByRole("button", { name: "Look up" }).click();
  await expect(win.getByRole("heading", { level: 3, name: "Quiet Person" })).toBeVisible();
  await expect(win.getByRole("tabpanel", { name: "Training run" }).locator(".gh-guard")).toContainText("Needs at least 12 active days");
  await win.getByRole("tab", { name: "Data science lab" }).click();
  await expect(win.getByRole("tabpanel", { name: "Data science lab" }).locator(".gh-guard")).toContainText("Clustering needs at least 4 repositories; found 1.");
});

test("lookup errors: invalid, not found, rate limited, and a superseded slow lookup", async ({ page }) => {
  const reset = Math.floor(Date.now() / 1000) + 30 * 60;
  await mockGitHub(page, {}, {
    busy: (route) =>
      route.fulfill({
        status: 403,
        headers: { ...CORS, "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
        contentType: "application/json",
        body: JSON.stringify({ message: "API rate limit exceeded" })
      }),
    slowpoke: async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(restUser("slowpoke", "Slow Poke")) }).catch(() => undefined);
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openGitHub(page);
  const search = win.getByRole("searchbox", { name: "GitHub username" });
  const alert = win.getByRole("alert");

  await search.fill("not a login!");
  await search.press("Enter");
  await expect(alert).toContainText("is not a valid GitHub username");

  await search.fill("ghost");
  await search.press("Enter");
  await expect(alert).toContainText("No GitHub user with that name. (@ghost)");
  await expect(win.getByRole("heading", { level: 3, name: snapshot.name! })).toBeVisible();

  await search.fill("busy");
  await search.press("Enter");
  await expect(alert).toContainText("hourly limit");
  await expect(alert).toContainText(/Try again after .+ \(in (2\d|30) minutes\)/);
  await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();

  await search.fill("slowpoke");
  await search.press("Enter");
  await expect(win.locator(".gh-status")).toContainText("Looking up @slowpoke");
  await search.fill("ghost");
  await search.press("Enter");
  await expect(alert).toContainText("(@ghost)");
  await page.waitForTimeout(1800);
  await expect(win.getByRole("heading", { level: 3, name: "Slow Poke" })).toHaveCount(0);
  await expect(alert).toContainText("(@ghost)");
});

test("fits a phone without horizontal overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto("./?view=os");
  await page.locator(".os-home .os-icon", { hasText: "GitHub" }).click();
  const win = page.locator(githubWin);
  await expect(win.getByRole("heading", { level: 3, name: snapshot.name! })).toBeVisible();
  const overflow = () =>
    page.evaluate((selector) => {
      const body = document.querySelector(`${selector} .os-win__body`)!;
      return { page: document.documentElement.scrollWidth - window.innerWidth, body: body.scrollWidth - body.clientWidth };
    }, githubWin);
  for (const name of ["Training run", "Market", "Launch", "Data science lab"]) {
    await win.getByRole("tab", { name, exact: true }).click();
    await expect(win.getByRole("tabpanel", { name, exact: true }).locator(".gh-lab__section").first()).toBeVisible();
    expect(await overflow()).toEqual({ page: 0, body: 0 });
  }
  await win.getByRole("tab", { name: "Training run", exact: true }).click();
  await expect(win.locator('[data-metric="model-mae"]')).toBeVisible();
  expect(await overflow()).toEqual({ page: 0, body: 0 });
  const box = (await win.locator(".gh-stats").boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);

  // Linux CI falls back to wider fonts than Windows; a wide font catches overflow either way.
  await page.addStyleTag({ content: "*, *::before, *::after { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }" });
  for (const name of ["Training run", "Market", "Launch", "Data science lab"]) {
    await win.getByRole("tab", { name, exact: true }).click();
    const panel = win.getByRole("tabpanel", { name, exact: true });
    await expect(panel.locator(".gh-lab__section").first()).toBeVisible();
    // Folded notes are checked too.
    const show = panel.getByRole("button", { name: /^Show details for / });
    while (await show.count()) await show.first().click();
    expect(await overflow()).toEqual({ page: 0, body: 0 });
  }
});

test("renders in the retro style", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const win = await openGitHub(page, { url: "./?view=os&style=retro" });
  await expect(page.locator(".os--retro")).not.toHaveCount(0);
  await expect(win.locator("rect.gh-cell")).toHaveCount(snapshot.days.length);
  await expect(win.getByRole("tab", { name: "Training run" })).toHaveCSS("background-color", "rgb(0, 0, 128)");
  await expect(stat(win, "total")).toHaveText(fmtInt(stats.total));
});
