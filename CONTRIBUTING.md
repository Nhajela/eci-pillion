# Building Pillion with us

Pillion is built in the open by people at Edge City India. Small, useful changes are the best kind.

## Ways to help
- **Use it and tell us.** In the bot: `/bug what broke` or `/feature what you wish it did`. That's the most useful thing.
- **Open an issue** for anything bigger, or to say you'd like to pick something up (see `docs/ROADMAP.md`).
- **Send a pull request.** Fork, branch, change, `pnpm test && pnpm typecheck && pnpm build`, open a PR. We deploy `main`.

## How the code is laid out
- `src/services/*`: every game rule (plans, rides, floats, kaju, invites, places, events). Functions take
  `(db, notifier, user, …, now)` so tests can run them with a fake clock and a fake Telegram.
- `src/lib/*`: pure helpers (kaju amounts, matching, places, time in IST).
- `src/bot/handle.ts`: the Telegram bot. `src/app/*`: the site. Both only call services.
- `tests/*`: vitest, against a local Postgres (`pnpm test-db`). New rules come with a test.

## House style
- Phone first (390 px), tap targets at least 44 px, warm and playful copy (`docs/copy.md`), times in IST.
- Kaju is an append-only ledger: never update or delete kaju rows.
- Never commit secrets. Configuration comes from environment variables (see `docs/DEPLOY.md`).

Questions? Ask in the bot with `/feature`, or open an issue.
