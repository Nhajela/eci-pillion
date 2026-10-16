# Deploy

- **Coolify** on serenity (https://coolify.positivesumexperiments.com). Pushing to `main` auto-deploys.
- Project `eci-pillion` (`m5djkwffvpphhqcex0n8nutr`), app `eci-pillion-web` (`zsp1dwu9rntbyxwmvnuyzv0t`),
  server `flismobftzu4etgmosyr7c6g`, GitHub App source `lvhoppuhivrfebn4tc4ebwvl`. Build pack: Dockerfile, port 3000.
- **Domains:** https://pillion.positivesumexperiments.com (needs a Cloudflare A record → 170.187.250.12, grey cloud
  while the certificate is issued) and https://pillion.170.187.250.12.sslip.io (works without DNS).
- No env vars or secrets yet (release 1 is static). Release 2 adds `PILLION_TELEGRAM_BOT_TOKEN` etc., stored in
  serenity `secrets` under the `PILLION_` prefix and in Coolify env vars.
