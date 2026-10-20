# Roadmap

| # | Release | Status | What makes it useful on its own |
|---|---|---|---|
| 1 | Landing page + avatar maker + toy village map | live | Explains the game, gets people drawing avatars before anything else exists |
| 2 | Telegram login | built; live when the bot token is set | Avatar attached to a real village member; we can count who's in |
| 3 | Bot sign-up, plans, ride-now, floaters, matching, kaju ledger | built; live with the bot | Actual rides |
| 6 | Onboarding avatar step, GIF moments, /how-it-works | live (20 Oct) | Drawing yourself is step 2 of sign-up, not a landing-page detour; the bot celebrates the big moments; one page explains everything |
| 5 | Beta launch: bugs + ideas, admin/staff dashboards, any place, errands | live (20 Oct) | People tell us what breaks (/bug, /feature, 🧪 button), admins hear at once; stays, cafés and tonight's dinner become destinations without anyone editing a list; "pop to a shop and back" works |
| 4 | Daily prizes + leaderboard | built; /today is live, 9pm post needs ANNOUNCE_CHAT_ID | Many small winners every evening |

## Open questions for later releases
- Events as destinations, automatically: pull today's EdgeOS events (venue + time) so "the 7pm talk at Riva" is a pickable place without an admin adding it.
- Merge two places that turned out to be the same (today: hide one, rename the other).
- Bot persona: whimsical, rhyming announcements (samples in `docs/copy.md` §8). Plain commands first, LLM chat optional.
- Kaju numbers in `docs/copy.md` §3 are a first guess; tune after a few days of data.
- Prizes: tangible, many, small. To be decided with the ops team.
- Where announcements go: one Telegram group, or DMs only, or both.
