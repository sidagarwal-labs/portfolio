# Sid Agarwal

A personal site for projects, writing, background, and reading, with a browser-based desktop and alternate portfolio views.

Public site: https://agarwal-labs.com/

## Local development

```sh
npm install
npm run dev
```

## Portfolio views and Lab OS

The site defaults to Lab OS. Use `?view=os`, `?view=search`, `?view=journal`, `?view=forward`, `?view=training`, or `?view=terminal` to select a view explicitly; an earlier selection is otherwise remembered. All views also work with the development server.

- Both modern and retro desktops use a bottom Windows-style taskbar, Start app search, network status, time/date, and a calendar. Start also offers restart, shutdown, full-page views, and icon arrangement reset.
- Desktop icons snap to a grid and retain their positions in browser storage. Drag them, or focus an icon and use Shift + arrow keys. Dropping on another icon swaps their positions.
- Drag window title bars to move them, any edge or corner to resize, and double-click the title bar to maximize. Show desktop temporarily minimizes open windows; its second click restores them. Phones use a home screen and full-screen apps instead.
- Portfolio apps have independent browser history. Markets, Launches, and AI leaderboards are full pages (see [Live pages](#live-pages)) that open as desktop apps; the taskbar widgets for NVDA, the next SpaceX launch, and the top Arena text model open them. Embedded apps do not repeat the ticker.
- Games include Snake, Mines, Blocks (an original Tetris-style falling-block puzzle), Rank It, and Next Token. Snake and Blocks pause when inactive or the browser tab is hidden. Controls work with keyboards and on-screen buttons.
- Restart resets the open apps and boots directly into the actual desktop, rather than displaying a separate decorative desktop first.

Forward pass and Training run use a real miniature attention language model in a Web Worker: 12-dimensional learned embeddings, a single causal attention head, a next-token output projection, and SGD at a learning rate of 0.12. Press Train to run up to 12 epochs at a time, capped at 24. Pause and deterministic reset are available. The corpus is fixed public portfolio and educational text, with every fifth document held out. The graph shows measured cross-entropy, not a scroll-driven animation; falling training loss does not imply improved held-out performance. Model weights stay in memory and each view owns an independent instance. No pretrained download, inference API, or visitor-data collection is involved.

Forward pass displays actual learned attention and next-word probabilities. Project matching, contact sampling, notebook cell execution, and the Next Token game's hand-set logits remain explicitly labeled illustrations, not outputs of this model. This is a learning demo, not a full transformer or chatbot.

Run the focused checks with `npm run test:e2e -- views.spec.ts models-games.spec.ts`, or all browser regressions with `npm run test:e2e`. Both commands build first; the focused checks also verify genuine loss reduction, causal attention, deterministic resets, and the falling-block engine.

## Content

- `src/content/journalContent.ts`: selected projects, earlier coursework, research links, verified fallback commit dates, stock symbols with the company names and blurbs shown on `/markets`, and the dated Arena leader shown in the ticker. When a selected project includes a `websiteHref`, its title opens the website and a small GitHub pill opens its repository; arXiv Search links to https://arxiv.agarwal-labs.com/. Projects without a website keep their GitHub-linked title. The repository list is curated; note dates refresh from GitHub.
- `src/content/siteContent.ts`: books, cover images, social links, resume, and optional local essays. The local `writing` list is currently empty; the LLM-coding note was removed. Future entries receive a page at `/writing/<slug>`.
- `src/components/JournalLayout.tsx`: the masthead on every page, with name, role, location, and one row of section navigation plus resume and email links.
- `src/features/home/JournalHomePage.tsx`: introduction, background, and section order: projects, writing, background, reading, then contact.
- `src/styles/journal.css`: the Journal view's light, single-column design.
- `public/favicon.ico`, `public/icon-192.png`, `public/apple-touch-icon.png`: site icons made from the same avatar image as the masthead portrait.

The arXiv Search blurb was checked against its [README](https://github.com/sidagarwal-labs/arxiv-search/blob/ffd60e206843976efd7d610f83ee27206b5d9906/README.md), [Python dependencies](https://github.com/sidagarwal-labs/arxiv-search/blob/ffd60e206843976efd7d610f83ee27206b5d9906/pyproject.toml), [historical milestones](https://github.com/sidagarwal-labs/arxiv-search/blob/ffd60e206843976efd7d610f83ee27206b5d9906/docs/10-reproduction-guide.md#historical-retrieval-milestones), and [latest results](https://github.com/sidagarwal-labs/arxiv-search/blob/ffd60e206843976efd7d610f83ee27206b5d9906/docs/05-results.md). The rounded 0.52 and 0.84 nDCG@10 values are development milestones: early tuned BM25 scored 0.5187 with 3,294 relevance judgments, while the latest reranker scored 0.8418 with 3,678 judgments. Both use 100 development queries, but the expanded label pool prevents a like-for-like gain claim. Preserve that qualification; these are AI-graded results, not held-out or human-validated scores.

Research notes link to the original Markdown in the public financial-models repository. The newest AI buildout edition leads the writing list, followed by six topic notes; older editions, currently September 2026, sit under an "Earlier AI buildout editions" disclosure. Edition slugs follow `ai-buildout-YYYY-MM`, so a new edition automatically becomes the featured one. Reports use findings-led prose with dated source links, rather than slide-by-slide narration or monitoring checklists. `useResearchNoteDates` requests each file's most recent commit, caches dates for an hour between visits, and retains verified fallback dates if GitHub is unavailable. Dates are displayed in UTC so they do not shift across time zones. Fallbacks were verified on October 4, 2026: the October report and six topics use the October 4 published revision, while the September summary retains its September 9 commit date. Commit dates identify edits, not the observation dates of every figure.

Book covers use the existing image URLs as small, uncropped thumbnails. Space is reserved before they load; a failed image is hidden without removing the book's title or link.

## Robotics

`/robotics` is a journal-style project page linked from the background section, and its back link returns there. Its content lives in `src/features/robotics/RoboticsPage.tsx`. It covers Sid's confirmed 2013-2018 membership in the Pitt Pirates, FRC Team 2642, and his 2017 FIRST Steamworks team captaincy. Team results and alliance scores are labeled separately from personal contributions.

Featured matches are 2017 Houston Roebling Qualification 14 and the 2017 Raleigh Final 3. Additional footage includes the 2018 Turing semifinal tiebreaker, the undefeated Pembroke event's final, and the team's own 2017 recap, unveiling, and Chairman's Award video. Record links point to The Blue Alliance and FIRST. Video metadata and team-hosted images were checked September 14, 2026; Statbotics ratings are not quoted because its API was unavailable during research.

Photos remain hosted on the Pitt Pirates website, with original-file links and visible team attribution; no copies are included in this repository. Confirm the photographer's reuse permission before downloading or republishing copies. If a photo fails, its reserved space, caption, attribution, and original link remain. YouTube thumbnails load as images, but the privacy-enhanced player is created only after the reader presses play. Watch-on-YouTube links remain available if embedding is blocked.

## Market ticker

In full-page portfolio views, stock quotes and custom metrics move together on one native scrolling track with matching typography. Lab OS uses compact taskbar widgets instead. The ticker never loads TradingView; charts load only on `/markets`. An imminent SpaceX launch pins its countdown and watch action to the left of the full-page ticker while the remaining items continue scrolling to its right. Hovering or focusing the watch action does not pause the track. Hovering the scrolling area pauses it; keyboard focus within it and reduced-motion preferences make it a static, horizontally scrollable row. The full-page ticker has no on/off control, and any previously saved off preference is ignored.

`useStockQuotes` uses the existing `VITE_FINNHUB_KEY` configuration and refreshes the seven symbols once per minute while the page is visible. The existing GitHub Actions deployment already reads this value from its repository secret; local development reads Vite's environment files. Quote timestamps, source, delay information, and cached status are available in each stock's hover text, not as a separate scrolling item. Failed requests retain real cached quotes or show "Unavailable" if there is no quote. Prices are never simulated.

Vite variables prefixed with `VITE_` are public in the client bundle. This follows the original site's quote configuration; a credential that must remain private needs a server-side proxy instead. Never put unrelated private credentials in these variables.

The same track includes:

- **SpaceX:** the next SpaceX launch from [The Space Devs' Launch Library 2](https://thespacedevs.com/llapi), using the detailed response for official webcast links. The countdown advances once per minute; schedules refresh after two hours, or 15 minutes inside the four-hour launch window. Failed requests retain the last successful schedule and retry after 15 minutes. Stale data shows "Schedule cached"; missing data links to "Check schedule". A confirmed, fresh launch less than four hours away is highlighted in a fixed left-side slot, ahead of the scrolling items, instead of appearing in the scrolling loop. The action uses an HTTPS official webcast on an allowed host, or says "Launch details" when no verified stream is available. "Stream live" requires an explicit feed signal. Tentative and stale schedules never trigger the highlight. Passing the scheduled time shows "Awaiting update", not a claim that the launch happened.
- **Mars gravity:** a fixed reference value of 3.71 m/s squared.
- **Highest ELO LLM:** the model name, score, and date from [Arena's overall text leaderboard](https://arena.ai/leaderboard/text), ranked by point-estimate score. This is a manually verified, visibly dated snapshot, not a live feed. Update `arenaLeader` in `src/content/journalContent.ts` after checking the leaderboard; preserve its update date and score uncertainty. The September 2, 2026 snapshot, checked September 5, has claude-fable-5 at 1507 (+/-5). Overlapping ranking intervals do not establish a definitive best model.

The old combined stock/launch/simulated-telemetry hook is not imported. The native quote hook and existing launch hook each run once, not once per visual copy of the scrolling loop.

With the Vite dev server running, open `/?launch-preview=soon` for a labeled mock countdown starting at T-2h 14m. The mock uses an official O3b mPower webcast link verified September 10, 2026, but its countdown is simulated. It does not fetch or overwrite cached launch data and is disabled in production builds. Reloading restarts the preview.

## Live pages

`/markets`, `/launches`, and `/leaderboards` are standalone, linkable pages that also run as Lab OS apps. They are loaded on demand, so other pages never download their code or contact their data sources.

- **Markets** (`?symbol=MSFT`): a watchlist with Finnhub prices for the seven ticker symbols, then TradingView's advanced chart with volume, financials, technicals, company profile, and news widgets for the selected company. Widgets load as they scroll into view, and a widget that fails links to the symbol on TradingView. Keep TradingView's attribution visible under each widget.
- **Launches**: the next SpaceX launch with a per-second countdown, mission, orbit, booster, and landing details; the following five launches; and the nine most recent launches with replays. Data comes from Launch Library 2's detailed responses, cached in browser storage for an hour (10 minutes around a launch) and six hours for past launches. Failures back off for 10 minutes, or 30 after a 429; the free API allows 15 requests an hour per IP. From three hours before to six hours after liftoff, a live webcast signal or "In Flight" status shows a Live now banner. YouTube streams and replays play in place in the privacy-enhanced player, created only after the reader presses play, and each caption names its publisher and marks unofficial streams. SpaceX's own broadcasts are on X, which is linked rather than embedded.
- **AI leaderboards** (`?arena=webdev&bench=metr`): LMArena's Text, WebDev, Vision, Search, and Text-to-Image boards with 95% intervals and vote counts, read in the browser from LMArena's [public Hugging Face dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) and cached for three hours. When that request fails, the page shows the build-time snapshot and labels it. Benchmarks are the best result per model from [Epoch AI's benchmarking hub](https://epoch.ai/benchmarks) (CC BY 4.0): Epoch Capabilities Index, GPQA Diamond, FrontierMath, SWE-bench Verified, Humanity's Last Exam, ARC-AGI-2, METR time horizon, and Terminal-Bench 2.0.

`npm run data:leaderboards` runs `scripts/update-leaderboards.mjs`, which writes `src/content/generated/leaderboards.json`. The deploy workflow runs it before every build and also runs daily at 09:17 UTC, so benchmarks stay current without a commit. A source that fails keeps its previous snapshot, and the script never fails the deploy. GitHub disables scheduled workflows after 60 days without repository activity; re-enable it from the Actions tab if that happens.

## Verification

```sh
npm run build
npm run test:e2e
```

The test command builds in Vite's `test` mode with a non-secret fixture quote key, then starts a temporary preview on port 4175 with the real root `/` base path used by the custom domain. Tests cover desktop and mobile layouts, keyboard access, removed-note recovery, legacy links, GitHub Pages redirects, commit dates and caching, book thumbnails, launch scheduling, shared ticker motion, quote loading, failure, cleanup, and reduced-motion behavior, and the live pages' live, fallback, and failure states. Provider responses are mocked for repeatability. A normal `npm run build` uses the real configured key; the deploy command always performs that normal build first.

The production TypeScript project checks `src/main.tsx` and its transitive imports. Previous 3D pages, styles, and supporting dependencies remain in the repository but are not part of the deployed app. This also leaves unrelated work-in-progress pages untouched.

## Publish to GitHub Pages

Commit the website changes and push `main`:

```sh
git push origin main
```

The existing `.github/workflows/deploy.yml` workflow builds the app using the repository's `VITE_FINNHUB_KEY` secret and deploys the `dist` artifact to GitHub Pages. The Pages source should be set to GitHub Actions. The workflow also supports manual dispatch from the Actions tab.

Verify the completed deployment at https://agarwal-labs.com/. The custom domain is configured in the repository's Pages settings, and the old `sidagarwal-labs.github.io/portfolio/` URL redirects to it. The app is built for the domain root, so do not restore a `/portfolio/` base path. `public/404.html` preserves direct article links on GitHub Pages.

`npm run deploy` is the older branch-based publishing command. Use it only when Pages is explicitly configured to serve the `gh-pages` branch instead of the Actions workflow.
