# Sid Agarwal

A simple personal site for writing, research notes, projects, and reading.

Public site: https://sidagarwal-labs.github.io/portfolio/

## Local development

```sh
npm install
npm run dev
```

## Content

- `src/content/journalContent.ts`: selected projects, research links, verified fallback commit dates, stock symbols, and the dated Arena leaderboard snapshot. The repository list is curated; note dates refresh from GitHub.
- `src/content/siteContent.ts`: books, cover images, social links, resume, and optional local essays. The local `writing` list is currently empty; the LLM-coding note was removed. Future entries receive a page at `/writing/<slug>`.
- `src/features/home/JournalHomePage.tsx`: introduction, background, and section order.
- `src/styles/journal.css`: the active, light, single-column design.

Research notes link to the original Markdown in the public financial-models repository. `useResearchNoteDates` requests each file's most recent commit, caches the dates for an hour between visits, and retains verified fallback dates if GitHub is unavailable. Dates are displayed in UTC so they do not shift across time zones. The fallback timestamps were verified on September 5, 2026.

Book covers use the existing image URLs as small, uncropped thumbnails. Space is reserved before they load; a failed image is hidden without removing the book's title or link.

## Market ticker

Stock quotes and custom metrics move together on one native scrolling track with matching typography. There is no embedded TradingView widget or separate fixed metrics area. Hover pauses the track; keyboard focus and reduced-motion preferences make it a static, horizontally scrollable row. Readers can turn the ticker off, and the choice is stored locally.

`useStockQuotes` uses the existing `VITE_FINNHUB_KEY` configuration and refreshes the seven symbols once per minute while the page is visible. The existing GitHub Actions deployment already reads this value from its repository secret; local development reads Vite's environment files. Quote timestamps, source, delay information, and cached status are available in each stock's hover text, not as a separate scrolling item. Failed requests retain real cached quotes or show "Unavailable" if there is no quote. Prices are never simulated.

Vite variables prefixed with `VITE_` are public in the client bundle. This follows the original site's quote configuration; a credential that must remain private needs a server-side proxy instead. Never put unrelated private credentials in these variables.

The same track includes:

- **SpaceX:** the next SpaceX launch from [The Space Devs' Launch Library 2](https://thespacedevs.com/llapi). The countdown advances once per minute, schedules are cached for two hours, and failed requests have a 15-minute backoff. Tentative dates are not displayed as precise countdowns. Passing the scheduled time shows "Awaiting update", not a claim that the launch happened.
- **Mars gravity:** a fixed reference value of 3.71 m/s squared.
- **Highest ELO LLM:** the model name, score, and date from [Arena's overall text leaderboard](https://arena.ai/leaderboard/text), ranked by point-estimate score. This is a manually verified, visibly dated snapshot, not a live feed. Update `arenaLeader` in `src/content/journalContent.ts` after checking the leaderboard; preserve its update date and score uncertainty. The September 2, 2026 snapshot, checked September 5, has claude-fable-5 at 1507 (+/-5). Overlapping ranking intervals do not establish a definitive best model.

The old combined stock/launch/simulated-telemetry hook is not imported. The native quote hook and existing launch hook each run once, not once per visual copy of the scrolling loop.

## Verification

```sh
npm run build
npm run test:e2e
```

The test command builds in Vite's `test` mode with a non-secret fixture quote key, then starts a temporary preview on port 4175 with the real `/portfolio/` base path. Tests cover desktop and mobile layouts, keyboard access, removed-note recovery, legacy links, GitHub Pages redirects, commit dates and caching, book thumbnails, launch scheduling, shared ticker motion, and quote loading, failure, cleanup, and reduced-motion behavior. Provider responses are mocked for repeatability. A normal `npm run build` uses the real configured key; the deploy command always performs that normal build first.

The production TypeScript project checks `src/main.tsx` and its transitive imports. Previous 3D pages, styles, and supporting dependencies remain in the repository but are not part of the deployed app. This also leaves unrelated work-in-progress pages untouched.

## Publish to GitHub Pages

Commit the website changes and push `main`:

```sh
git push origin main
```

The existing `.github/workflows/deploy.yml` workflow builds the app using the repository's `VITE_FINNHUB_KEY` secret and deploys the `dist` artifact to GitHub Pages. The Pages source should be set to GitHub Actions. The workflow also supports manual dispatch from the Actions tab.

Verify the completed deployment at https://sidagarwal-labs.github.io/portfolio/. `public/404.html` preserves direct article links on GitHub Pages.

`npm run deploy` is the older branch-based publishing command. Use it only when Pages is explicitly configured to serve the `gh-pages` branch instead of the Actions workflow.
