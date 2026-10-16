# Pillion: project rules

Scooty ride-sharing as a village game for Edge City India 2026 (Mandrem, Goa, 11 Oct – 1 Nov).
Pilots (have a scooty), hitchers (want a ride), floaters (share live location, "ping me"). Everything earns
**kaju**; early plans earn more than ride-now alerts; last-minute cancels cost a little; floaters earn most.

## Shipping in increments
Each release must be useful on its own. Roadmap and status: `docs/ROADMAP.md`.
1. Landing page + avatar maker (avatar saved in localStorage, key `pillion.avatar.v1`). **Live.**
2. Telegram login (carry the local avatar into the account).
3. Bot sign-up (name, vehicle, usual seats), plans, ride-now alerts, floaters, matching, kaju ledger.
4. Daily prizes (many small winners).

## Always
- pnpm only. Node 22. TypeScript stays on 5.x (TS 7 breaks `next build` on Next 15).
- Never read `.env` files. Never print secrets.
- Before committing: `pnpm typecheck` and `pnpm build`.
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
