# Pillion spec (releases 2–4)

## People
One row per Telegram account (`users`). Sign-up happens in the bot: name (Telegram first name, `/name` to change),
vehicle (scooty / bike / none) and usual free seats. If `PILLION_VERIFY_CHAT_IDS` is set, only members of those chats
can sign up (village members only).

## Login (web)
Deep link: the site makes a one-time code, the person taps `t.me/<bot>?start=login_<code>`, the bot claims the code,
the site polls and sets a signed session cookie. The bot can also send a magic link (`/web`).

## Plans and rides
- A **plan** is an offer (pilot: "around 4pm I go to Arambol, 1 seat") or a request (hitcher: "around 4pm I want to
  go to Arambol"). `depart_at` is "around"; `lead_minutes` = depart_at − posted_at.
- A **ride** pairs one pilot and one hitcher. It is created when a hitcher taps *Hop on* on an offer, or a
  pilot/floater taps *I'll take them* on a request. First tap wins; offers lose a seat per ride.
- Matching = same destination and |Δtime| ≤ 45 min, or an active floater within 3 km of the request's start.
  Candidates get a DM with the button; the web board shows the same buttons.
- After `depart_at + 20 min` both people are asked "Did you ride together?". One *Yes* completes the ride; a *No*
  waits for the other person (two Nos close it). Unconfirmed rides expire after 24 h with no kaju.
- Nobody is in two places at once: hitchers and two-wheelers have one ride per ±45 min, cars up to their seats. On a
  match, the hitcher's other requests around then are cancelled and a two-wheeler's other offers fill up.
- The same two people are paid for at most 2 rides together per day.
- Cancelling a matched ride or plan less than 30 min before `depart_at` (or after it) costs the canceller 5 kaju,
  and the other person gets a kind DM.

## Floating
Only people with wheels can float, only inside the village (≤ 4 km from a spot), and only 07:00–23:00 IST is paid.
Pings to floaters must be answered (see floater_refusal). A float with no location update for 30 min gets "still floating?";
no answer in 15 min ends it at the question.
Share **live location** with the bot → floating. Updates move you. A float ends when the live location stops
(no update for 15 min), on `/stop`, or after 8 h. Kaju: 5 per full 15 minutes, max 120 per day.
A static location counts as floating for 60 minutes.

## Kaju (append-only ledger, idempotent per (user, reason, ref))
| reason | amount |
|---|---|
| signup | +10 once |
| plan (lead ≥ 2 h / ≥ 30 min / less) | +15 / +10 / +5, max 3 plan awards per IST day |
| ride_pilot / ride_hitcher | +30 / +10 when a ride is done |
| float | +5 per 15 min, ≤ 120 per IST day |
| late_cancel | −5 |
| floater_refusal | −10 when a floater taps "Can't right now" on a nearby request, or leaves it unanswered for 10 min while it stays open. The float ends and its last hour is unpaid (`forfeit_minutes` += 60). Stopping a float first costs nothing. |
| plan_cancel | cancelling a plan nobody ever rode on gives its plan kaju back |

## Daily prizes (21:00 IST, many small winners)
Most Generous Pilot (most rides done as pilot), Earliest Bird (longest lead on a plan that became a done ride),
Longest Float (most float minutes), Best Avatar (most hearts from others that day), Pharmacy Run Hero (a done ride
after 21:00 or to the pharmacy/market), Mystery Kaju (seeded random among everyone with a done ride).
Ties → everyone tied wins. Posted to `PILLION_ANNOUNCE_CHAT_ID` if set, and shown on `/today`.

## Background ticker (in-process, every 60 s)
Close stale floats, remind matched rides 15 min ahead, ask for completion, 08:00 morning nudge, 21:00 prizes.
Each scheduled message has a unique key in `sent_keys`, so restarts never double-send.

## Places (release 5)
- Built-in seeds live in `src/lib/places.ts` (Riva and the Circle are **hubs** and come first; a `community-dinner`
  **event** has no fixed pin: admins set tonight's pin and note). Everything else is the `places` table.
- Anyone adds a place by typing its name ("➕ Somewhere else" in the bot or on the site). The bot then asks for a pin
  (📎 → Location → pick the spot), which is optional. Same loose name, or a pin within 150 m of a known place, reuses
  that place instead of adding a duplicate.
- Matching: two destinations are the same if they share an id or are both pinned within 600 m of each other, so a stay
  next to Riva matches rides to Riva. A place without a pin matches by id only, and floaters can't be pinged for
  pickups there (the bot says so).
- Admins (dashboard → Places) add, rename, re-pin (paste "lat, lng" or a Google Maps link), change kind
  (hub / event / spot / stay), add a note, or hide a place from pickers. Old plans keep their names.

## Errands
A request can go to "a quick errand and back" (`to_place = 'errand'`, note = what for). It is a ride from `from` and
back to it. Only floaters near `from` are pinged (an offer can't go to an errand). Kaju as for any ride.

## Roles, bugs and ideas
- `users.role`: member | staff (read-only `/staff` dashboard) | admin (`/admin`: changes things). `BOOTSTRAP_ADMINS`
  usernames become admin when they next message the bot; admins set roles on the dashboard and can't demote themselves.
- Reports: `/bug` and `/error` → bug; `/feature`, `/feature request …`, `/idea` → feature. A bare command asks for the
  text next. `t.me/<bot>?start=bug|feature` does the same (the site's links). On the web, the 🧪 Beta button on every
  page (logged in). Each report DMs every admin at once; 10 per person per hour. Admins move it new → doing → done /
  won't do; done or won't do sends the reporter a thank-you.

## Onboarding (release 6)
Step 1 in the bot: what do you ride (cars: seats). Step 2: draw yourself (a one-time link to `/avatar?welcome=1`, with
"Later, show me the menu"). The site's home shows "One last step: draw yourself" until there's an avatar. The avatar
maker is no longer on the landing page.

## GIF moments (release 6, like the shuttle bot)
Sent with `sendAnimation`, the text as caption; if Telegram refuses the GIF or the text is over 1024 characters, the
text goes as a normal message (`send()` in `src/bot/telegram.ts`). Sparing: the `/start` welcome, a float starting,
"matched" (both people), "ride done" (both people, with their kaju) and the 9pm prizes post. Files: `public/gifs/*.gif`,
made by `tools/paint/gifs.py` from paintings a person picked.

## /how-it-works
The full explainer for villagers and the team: a tap-through village day, getting started, each role, places, the whole
kaju table, prizes, fair play, every command, the beta, and "under the hood" for the team. Numbers come from the code's
constants, so it can't drift from the rules.

## Invites (release 7, after the assassins game)
- Personal link `t.me/<bot>?start=inv_<code>` (`/invite`, or the 💌 card on /home). Starting the bot through it before
  signing up records `users.invited_by` (first one wins, never yourself).
- `/invite @username` saves an invite in `invites` (one per username, ever; the first inviter gets it). When that Telegram
  account signs up, link or not, it counts. Refused: yourself, someone already signed up, someone invited by another.
- Kaju for the inviter: +10 `invite_join` when the friend signs up, +15 `invite_ride` when the friend's first ride is
  done (as pilot or hitcher). Both are once per friend (ledger refs `invite:<id>`, `invite-ride:<id>`), and the bot DMs
  the inviter each time.

## The village board (release 7)
`/board`, public: totals (rides shared, riders, people who asked, asking right now, seats going, floating now), the next
ride milestone (1, 10, 25, 50, 100, 150, 200, 300, 500) with a progress bar, "asking right now" with I'll take them,
seats going with Hop on, every ride that happened (newest first), and all-time leaders (pilots, hitchers, inviters,
floaters). First names and avatars only, like the group announcements. Each milestone is announced once in the group
with the prizes GIF. The same pulse shows on the landing page (with a live ticker of real asks and rides, samples only
until there's activity), /home, /today and the explainer.
