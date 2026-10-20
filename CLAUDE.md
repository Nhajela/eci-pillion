# Pillion: project rules

Scooty ride-sharing as a village game for Edge City India 2026 (Mandrem, Goa, 11 Oct – 1 Nov).
Pilots (have a scooty), hitchers (want a ride), floaters (share live location, "ping me"). Everything earns
**kaju**; early plans earn more than ride-now alerts; last-minute cancels cost a little; floaters earn most.

## Shipping in increments
Each release must be useful on its own. Roadmap and status: `docs/ROADMAP.md`. Game rules: `docs/SPEC.md`.

## Architecture
- `src/services/*`: all game rules. Functions take `(db, notifier, user, …, now)`; pure rules live in `src/lib`
  (`kaju.ts`, `match.ts`, `time.ts`, `places.ts`). Throw `GameError` for things a person did wrong.
- Every Telegram message goes through a `Notifier` (`src/bot/telegram.ts`), sent **after** the transaction commits.
  Tests use `memoryNotifier()`; never call Telegram from tests.
- Adapters are thin: the bot (`src/bot/handle.ts`), `/api/act` (one endpoint for every web button), `/api/telegram`
  (webhook), login routes. No rules in adapters.
- `src/instrumentation.ts` runs migrations at startup and ticks every minute (`services/ticker.ts`); scheduled
  messages are made idempotent with `sent_keys`.
- Kaju is an append-only ledger, unique per (user, reason, ref). Never update or delete kaju rows.
- Telegram features are off until `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` are set (`botEnabled()`).
- Bot copy pool: `src/bot/lines.ts` (`pick()`). Values passed in must already be HTML-escaped (`esc`).
- Places: seeds in `src/lib/places.ts`, the rest in the `places` table (anyone adds by name). `loadPlaces(db)` refreshes
  the in-memory list (20 s TTL); call it at the top of every adapter and page that reads place names. Place names and
  plan notes are stripped of `<>&` on the way in, since they go into Telegram HTML.
- Roles: member / staff / admin on `users.role` (`services/roles.ts`); `BOOTSTRAP_ADMINS` usernames become admin.
  `/admin` and `/staff` share `components/dashboard.tsx`; admin checks live in the services, not the adapters.

## Tests
`pnpm test-db` once (local throwaway Postgres on 127.0.0.1:5549), then `pnpm test`. Schema change: edit
`src/db/schema.ts`, then `pnpm db:generate --name <what>`; never edit applied migrations.

## Always
- pnpm only. Node 22. TypeScript stays on 5.x (TS 7 breaks `next build` on Next 15).
- Never read `.env` files. Never print secrets.
- Before committing: `pnpm test`, `pnpm typecheck` and `pnpm build`.
- Times shown to people are IST (Asia/Kolkata).
- Phone-first (390px). Tap targets ≥ 44px. Respect `prefers-reduced-motion`.
- Tone is the village, not a SaaS: warm, playful, short. Copy source: `docs/copy.md`.
- Illustrations: `tools/paint/paint.py` (Gemini image via Vertex, `secrets run -- python3 tools/paint/paint.py <name>`).
  Raw takes go to `tools/paint/out/` (ignored); a person picks one, it is converted to webp in `public/art/`.
  No text, logos or brand marks in paintings.

## Deploy
Coolify on serenity, Dockerfile build pack, auto-deploys on push to `main`. Ids and domain: `docs/DEPLOY.md`.

## Commits
Atomic, `feat: …` / `fix: …`, ending with the Co-Authored-By line you were given.
