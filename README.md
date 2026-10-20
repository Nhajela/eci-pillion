# Pillion 🛵

Ride sharing as a village game, for [Edge City India 2026](https://pillion.housefulloflove.com) (Mandrem, Goa, 11 Oct – 1 Nov).
People with a scooty or a car say where they're going, people without one hop on, and people with nowhere to be
"float" and pick folks up. Everything earns **kaju** (pretend cashews). It all happens in a Telegram bot,
[@eci_pillion_bot](https://t.me/eci_pillion_bot); the site is optional.

- **Live:** https://pillion.housefulloflove.com · **How it works:** https://pillion.housefulloflove.com/how-it-works
- **It's a beta and an experiment.** Ideas and bugs: `/feature` and `/bug` in the bot, or open an issue here.

## Stack
Next.js 15 (App Router) + TypeScript, Postgres with Drizzle, a Telegram bot on a webhook, deployed with Coolify.
Game rules live in `src/services` (pure helpers in `src/lib`); the bot (`src/bot/handle.ts`) and the site
(`/api/act`) are thin adapters over them. Rules: [`docs/SPEC.md`](docs/SPEC.md). Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Run it locally
```sh
pnpm install
pnpm test-db        # a throwaway Postgres on 127.0.0.1:5549 (Docker)
pnpm test           # the game rules, end to end, against that database
DATABASE_URL=postgres://postgres:test@127.0.0.1:5549/pillion_test SESSION_SECRET=dev pnpm dev
```
Without `TELEGRAM_BOT_TOKEN` the bot stays off and messages are only logged, so you can work on the site and the rules
without a bot. See [CONTRIBUTING.md](CONTRIBUTING.md).
