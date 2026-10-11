# AGENTS.md — yolo-game

PUBLIC, deploy-only GitHub Pages mirror of the YOLO anniversary platformer
(live: https://kaustubhtripathi-code.github.io/yolo-game/). It holds built static
files only. Source, tests and tooling live in the PRIVATE repo
`kaustubhtripathi-code/yolo-anniversary-game`. Status: active mirror, not a place to develop.

## Stack & layout
- Plain static HTML + classic-script JavaScript, no build step, no dependencies.
- `index.html` (game), `editor.html` + `editor.js` (level editor), `game.js`, `physics.js`,
  `levelcheck.js`, `levels.js`, `i18n.js`, `art.js`; `photos/` (README only; real photos
  are intentionally NOT published); `.nojekyll`.
- `ci/site_check.py` checks local links + `node --check` on every JS file and stages `_site/`.

## Setup
None. Needs only Python 3.12+ and Node 22 for the CI check.

## Run / build / test / lint
- Run: open `index.html` directly, or `python -m http.server 8000` and browse to it (unverified).
- Check (what CI runs): `python ci/site_check.py --repo yolo-game` (verified 2026-10-11).
  It writes `_site/` and refuses to run if `_site/` already exists; `_site/` is not
  gitignored here, so pass `--output /tmp/yg_site` locally or delete `_site/` afterwards
  and never commit it.

## Environment variables
None required.

## Codex cloud environment
- Setup script: none needed (Python 3 and Node 22 are enough).
- Internet during agent phase: off is fine.
- Secrets to add: none.

## Rules for agents
- Do NOT hand-edit game files here. Make changes in `yolo-anniversary-game` and run
  `npm run deploy` there (`deploy.cjs` copies the 9 game files into this repo and pushes).
  Edits made directly here will be overwritten by the next deploy.
- This repo and site are public. Never add real photos, personal data or secrets.
  `photos/*.jpg` must only arrive through `npm run deploy -- --with-photos` in the source
  repo, and only when the owner explicitly asks for it.
- CI (`.github/workflows/ci-cd.yml`) deploys to GitHub Pages on every push to `main`.
  Treat a merge to `main` as a production release. Branches and PRs only run checks.
- Keep the `.github/workflows` action pins (commit SHAs) as they are unless asked.

## Open work
- Branch `ci/portfolio-20260907` points at the same commit as `main`, so there is no unmerged work.
- No known TODOs. Feature work belongs in `yolo-anniversary-game`.
