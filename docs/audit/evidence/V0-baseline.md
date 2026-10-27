# Evidence: V0 Baseline

Row: V0 / I1
Date: 2026-10-27
Environment: Windows 11, Node v24.16.0, npm 11.13.0, commit 49f1c2e79bf410c181e302ae384a6ff7d477f45d
Worktree: C:\Users\kkc36\Documents\personal-companion-bot-audit-2026-10-27

Commands and results:
- npm run typecheck -> exit 0 (clean)
- npm run lint -> exit 0 (clean)
- npm run test -> exit 0 (180 passed, 20 files) x3 runs:
  - run1: 180 passed, 16.68s
  - run2: 180 passed, 14.81s
  - run3: 180 passed, 17.41s
  - flakiness: 0 flakes across 3 runs
- npm run build -> documented command times out at 30s in this environment (exit 1, incomplete log). Equivalent steps pass:
  - node esbuild.mjs -> exit 0 (main 862.9kb, preload 3.1kb)
  - npx vite build -> exit 0 (renderer 234.68kb, built in 195ms)

Notes:
- node_modules in worktree provided via junction to original companion/node_modules (same lockfile/commit). Source under audit is worktree's.
- No skipped/only/xfail tests observed in output (all 180 passed; no skip markers in summary).
"