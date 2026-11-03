# Oche

A calm, phone-friendly darts scoreboard for game night. Name your players, choose a game, and keep your attention on the board.

## Features

- **Up to 8 players** with customizable names; each mode enforces its own player limits.
- **An electronic-darts game menu:** X01, Cricket variants, Count Up, Gotcha!, Bermuda Triangle, Tic Tac Darts, Shark Tank, and timed practice.
- **Live 01 scoring:** each entered dart immediately updates the remaining score and checkout suggestion, using only the darts left in the turn.
- **Dart-by-dart entry** with singles, doubles, trebles, bull, and misses.
- **Automatic scoring**, turn rotation, bust detection, and checkout suggestions for X01.
- **Undo, per-dart automatic saving, and match history** in the current browser. An unfinished turn resumes after a refresh or closing the tab.
- **Responsive design** for phones, tablets, and desktop screens.
- **Static hosting:** no account, API key, database, or production server required.

Players share one device for scoring. Game data is stored in that browser; opening the site on a different phone does not join or synchronize a match. Clearing browser storage removes saved data. Live rooms would require a shared backend.

## Saved games and removal

The current game, entered darts, player names, and last 30 completed matches are stored under the `oche-v1` localStorage key in the user's browser. Scores and player names are not uploaded to GitHub. Returning to the same website in the same browser resumes the game. Private browsing and browser storage eviction can erase local records; there is no cloud backup.

- **End game** removes the current game after confirmation, keeping completed matches and names. For a finished game, **Close game** returns to setup while keeping its result.
- **Match history → select a match → Delete match** removes one result after confirmation.
- **Saved data** in the footer explains storage. **Clear all saved data** removes the game's localStorage entry after confirmation, including names and history, without clearing unrelated browser storage.

Each dart saves immediately. The **Next player** button completes the turn; ending a turn early counts unused darts as misses. A bust restores the turn's starting score immediately. Tapping a filled dart removes it and recalculates the remaining score. A winning dart shows zero immediately; **Finish game** records the result.

## Run locally

Install [Node.js](https://nodejs.org/) 22 or newer, then run:

```sh
npm run dev
```

Open the local URL printed by the server. No dependency installation is needed. Use the server rather than opening `index.html` directly, because the application uses JavaScript modules.

```sh
npm test       # Scoring-rule tests
npm run build  # Generate dist/ for static hosting
```

## Deploy to GitHub Pages

The repository's `main` branch deploys automatically through GitHub Actions. After editing, commit and push your changes to publish an update. The workflow tests the application before deploying.

### Manual GitHub setup

1. Create a GitHub repository and upload this project's source, including `.github/workflows/deploy.yml`, to its `main` branch.
2. In the repository, open **Settings → Pages → Build and deployment**. Select **GitHub Actions** as the source.
3. Open **Actions → Deploy Oche to GitHub Pages → Run workflow**. Future pushes to `main` deploy automatically.
4. After the workflow succeeds, open the URL shown by the deployment, usually `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

The workflow tests the scoring engine, builds the website, and deploys the `dist/` artifact. Assets use relative paths, so repository subpaths and custom domains work without changing a base URL. If your default branch has a different name, update `branches: [main]` in the workflow. No repository secrets are needed.

GitHub's [custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) explains the deployment environment and permissions. Any static host can also serve the generated `dist/` directory.

## Games and reference

Oche's menu follows the original **Arachnid Galaxy 3**: a machine sold by [Amusements Plus in Rochester, New York](https://amusementsplus.com/shop/darts-dart-boards/dart-machines-darts-dart-boards-2/arachnid-galaxy-3-dart-machine-reconditioned/). This is a specific reference, not a statewide standard; other brands and firmware have different menus. Game families and player limits come from [section 4.2 of the Galaxy 3 Rev. H operator manual](https://www.arachnid360.com/wp-content/uploads/2016/12/G3manrevH.pdf#page=14).

| Game | Players |
| --- | --- |
| 301, 501, 701, 901, 1101, 1501; 501 Quickie | 1–8 |
| Cricket/200, Wild Card Cricket, Cricket Quickie | 1–8 |
| Cut-Throat Cricket | 2–8 |
| Double Down Cricket | 1–4 |
| Hammer Cricket | 2–4 |
| Team Cricket, Team Hammer | 4 |
| Count Up, Bermuda Triangle | 1–8 |
| Gotcha!, Shark Tank | 2–4 |
| Tic Tac Darts | 2 |
| Count Down, Quick Cricket (timed) | 1 |

The in-app rules describe each mode and its available options. Quickie variants are limited-round matches; the similarly named Quick Cricket is a solo speed game. Around the Clock is intentionally excluded.

Oche provides manual scoring for these games. Physical dart detection, cabinet lights, payments, machine operator settings, remote leagues, player accounts, and Top Gun ladders are outside this website's scope. Timed practice includes the time spent entering scores; it cannot measure physical throws automatically. This is an independent application, without a connection to the machine manufacturer's network.

### App scoring conventions

The reference manual does not resolve every edge case. Oche makes these choices explicit so casual games remain predictable:

- **Hammer:** Master mode accepts the inner bull on bull rounds. Missing every dart on a bull round costs 75 points, including with full-bull scoring. Ties remaining after the MPR comparison share the win.
- **Bermuda:** Halving an odd score rounds down.
- **Gotcha!:** Finishing on a single segment with Master Out restores the turn-start score and cancels that turn's opponent resets. Either bull can finish.
- **Tic Tac Darts:** Points accrue only on unclaimed numbered cells. The points tiebreaker applies as soon as neither player can complete a line.
- **Shark Tank:** If every remaining player is eliminated together, that round's leading players share the win.

Double Down retains closed targets when a finishing dart misses D1. Cricket Quickie resolves at the limit by highest points, sharing ties. Team Cricket uses the traditional both-partners-close rules.

Count Up defaults to eight rounds and also offers configurable match lengths. These application choices are not claims about every cabinet's firmware.

## Project structure

```text
index.html                 Application entry point
src/app.js                 Interface and browser persistence
src/style.css              Responsive styles
src/engine.js              Pure scoring logic
src/party.js               Arcade party-game scoring
tests/engine.test.js       Scoring regression tests
tests/party.test.js        Party-game regression tests
tests/ui.test.js           Interface and persistence contract tests
scripts/serve.mjs          Local development server
scripts/build.mjs          Static build
.github/workflows/deploy.yml
```

The application uses plain HTML, CSS, and JavaScript modules with no runtime dependencies. Keep scoring behavior in `src/engine.js`, UI changes in `src/app.js`, and visual customization in `src/style.css`.
