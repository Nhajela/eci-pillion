# Deploy

- **Coolify** on serenity (https://coolify.positivesumexperiments.com). Pushing to `main` auto-deploys.
- Project `eci-pillion` (`m5djkwffvpphhqcex0n8nutr`), app `eci-pillion-web` (`zsp1dwu9rntbyxwmvnuyzv0t`),
  server `flismobftzu4etgmosyr7c6g`, GitHub App source `lvhoppuhivrfebn4tc4ebwvl`. Build pack: Dockerfile, port 3000.
- **Domain:** https://pillion.housefulloflove.com. Cloudflare zone `housefulloflove.com`: A `pillion` → 170.187.250.12,
  grey cloud while Let's Encrypt issues. The apex keeps its own redirect; don't touch it.
  Fallback that needs no DNS: https://pillion.170.187.250.12.sslip.io.
- **Database:** Coolify Postgres `eci-pillion-db` (`z8aw1lcf3mufcoyb27wukvs3`, postgres:18-alpine, internal only).
  Migrations run on app start (`src/instrumentation.ts`). **Backups:** Coolify scheduled backup
  `kvzmbec1fnqxtbs9nrhvrdci`, nightly 21:30 UTC (03:00 IST), keeps 14 dumps in
  `/data/coolify/backups/databases/root-team-0/eci-pillion-db-…/` on serenity. Not off-server yet (no S3/R2 bucket).
- **Env vars (Coolify, app):** `DATABASE_URL`, `SESSION_SECRET`, `TELEGRAM_WEBHOOK_SECRET` (generated, never printed),
  `PUBLIC_ORIGIN`. To switch the bot on, add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`, redeploy, then run
  `scripts/setup-bot.mjs` with the same token, webhook secret and origin. Optional: `ANNOUNCE_CHAT_ID`, `VERIFY_CHAT_IDS`.
- **Admins:** `BOOTSTRAP_ADMINS` (Telegram usernames, comma-separated, @ optional; set to `HiiNaman`). Each becomes admin
  the next time they message the bot. Admins then make others staff or admin on `/admin` → People. Admins get every
  `/bug` and `/feature` as a Telegram DM.
