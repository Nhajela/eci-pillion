# Roadmap

| # | Release | Status | What makes it useful on its own |
|---|---|---|---|
| 1 | Landing page + avatar maker + toy village map | live | Explains the game, gets people drawing avatars before anything else exists |
| 2 | Telegram login | built; live when the bot token is set | Avatar attached to a real village member; we can count who's in |
| 3 | Bot sign-up, plans, ride-now, floaters, matching, kaju ledger | built; live with the bot | Actual rides |
| 9 | Events as destinations, fake-account guards, admin-side group messages, prizes off, hidden flight board | live (20 Oct) | "Ride to the 5pm circle" is two taps; no group needed; the game stays fair without one |
| 8 | Open destinations, distances, crowd-ranked places | live (20 Oct) | Ask "somewhere ~5 km away"; drivers always see how far and how long; the places people use rise to the top |
| 7 | Invites + the village board | live (20 Oct) | Bringing friends pays (most when they actually ride); the village sees itself: rides shared, who's asking, milestones, leaders |
| 6 | Onboarding avatar step, GIF moments, /how-it-works | live (20 Oct) | Drawing yourself is step 2 of sign-up, not a landing-page detour; the bot celebrates the big moments; one page explains everything |
| 5 | Beta launch: bugs + ideas, admin/staff dashboards, any place, errands | live (20 Oct) | People tell us what breaks (/bug, /feature, 🧪 button), admins hear at once; stays, cafés and tonight's dinner become destinations without anyone editing a list; "pop to a shop and back" works |
| 4 | Daily prizes + leaderboard | built; /today is live, 9pm post needs ANNOUNCE_CHAT_ID | Many small winners every evening |

## Open questions for later releases
- Prizes: off for now; bring back later, made fun (the flight board at /departures is the seed of that).
- Bot persona: whimsical, rhyming announcements (samples in `docs/copy.md` §8). Plain commands first, LLM chat optional.
- Kaju numbers in `docs/copy.md` §3 are a first guess; tune after a few days of data.
- Where announcements go: one Telegram group, or DMs only, or both.
