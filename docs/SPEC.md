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
| float | +10 an hour, paid per full 30 min, ≤ 120 per IST day (changed 20 Oct from +5 per 15 min) |
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
- **Merge** (admin, "Same as… → Merge"): every plan and ride on the duplicate moves to the other place, the duplicate
  leaves the pickers, and its name keeps finding the place it went into (`places.merged_into`; chains are flattened).
  The kept place takes the duplicate's pin if it had none.

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

## Open destinations and distances (release 8)
- `to_place = 'open'` with `range_km` (2, 5, 10 or 15): "somewhere ~5 km from the pickup, I'll say where" (request) or
  "free to drop someone up to 5 km" (offer). Optional note ("towards Morjim").
- Fit (`destinationsFit` in `src/lib/match.ts`): pickups within 1.5 km (or the same place), then: request open → any
  offer; offer open → the request's trip ≤ range (when measurable) or an open request with range ≤ offer's; both
  concrete → same place / within 600 m as before.
- A ride takes the hitcher's request ends when there is one (open stays open, with its range), else the offer's.
- Distance for drivers (`tripLabel`): straight line × 1.35 road factor at 25 km/h, minimum 3 min, shown in pings,
  match messages, the bot's confirmations, /home and /board ("≈2.5 km · ~6 min", "up to ~5 km · ~12 min").
- Crowd ranking: after hubs and events, pickers sort places by how often they were a destination in the last 7 days.
  The board lists "Where the village goes".

## Release 9 (20 Oct)
- **No daily prizes for now** (`PRIZES_ON = false` in `services/prizes.ts`; the rules stay for later). Prize copy is off
  the site, /today shows the map, numbers and today's rides. Leaderboards moved to a hidden flight board.
- **Hidden flight board** `/departures` (not linked, `noindex`): departures (matched rides and open plans for the next
  18 h, with BOARDING / ON TIME / SEEKING SEAT / SEATS FREE), arrivals, who's floating, kaju today and all time, and the
  four leaderboards.
- **No group**: `ANNOUNCE_CHAT_ID` is unset; every group message is saved in `announcements` and shown on the admin
  dashboard with a Copy button. If a chat id is ever set, they're posted as well.
- **Events as destinations**: `EDGEOS_KEY` (read-only; `PILLION_EDGEOS_KEY` in secrets). Every 10 minutes the ticker
  syncs the next 36 h of public published events of the edge-india popup into `edge_events`, resolving the venue to a
  place (`venueToName`: Riva rooms → riva, Circle.Work / Cuebebar → circle, "X 2nd floor above Y" → X, TBD / remote /
  links → none). `/ride` or `/go` → 📅 To an event: destination = the event's place, note = its title, leave 15 min
  before it starts. The web form has the same under "📅 Events coming up". The board lists what's coming up.
- **Fake-account guards** (no group membership check): `is_bot` updates are ignored; rides with an account onboarded
  < 24 h ago need both "yes" (`rides.confirmed_by`); invite join kaju ≤ 5 a day per inviter and the first-ride bonus
  ignores rides with the inviter; role `blocked` (admin-set) can't post, take, hop, float or earn; the dashboard's
  "Worth a look" lists pairs with ≥ 3 rides together, ≥ 3 invited sign-ups in 24 h, and accounts < 48 h old with ≥ 2 rides.
- **Float pay**: +10 an hour (5 per full half hour), was +20.

## Release 10 (20 Oct)
- **/home redesigned for phones**: what needs you first (confirm rides, your plans), then the plan form, then what's on
  the road (each ride a card, its button full width), float, invites, kaju, the village numbers last.
- **Plan form**: big "I need a ride / I'm going" choice; From and To as big rows that open a searchable bottom sheet
  (`components/place-picker.tsx`: special options, hubs, events coming up, everywhere else by use, "➕ Add …"); ⇅ swap;
  time chips plus a native time picker; a − / + seat stepper for cars; a summary with the kaju before posting.
- **Place aliases** (`PLACE_ALIASES` in `services/places.ts`): Chique Shanti Villa is the Community Builders Residency.
  The event sync merges an alias into its main place once, and new events there land on the main place.

## Release 11 (20 Oct): bot-first, bring everyone
- The bot is the app: menu = I need a ride · I'm going somewhere · 🛣️ Who's going where (`/road`, also `/now`, `/board`:
  open asks with Take buttons, seats with Hop on, distances) · Float · My rides · Kaju · Invite · Bug / Idea. The website
  is optional (`/web`). The landing page's main button opens the bot.
- Copy asks people to bring others ("Pillion works when lots of us are on it"): landing beta box, /how-it-works,
  /home invite card, the board, `/invite`, and right after sign-up (a share button for your invite link).

## Follow-up for asks nobody took (release 12)
`services/followups.ts`, run by the ticker, once per ask (`sent_keys followup:<id>`), 07:00–22:00 IST: an ask open ≥ 10 min,
leaving within 2 h, with no ride, gets (1) pilots with offers ±90 min going within 1.5 km of the destination (open asks:
pickups within 4 km), skipping those normal matching already pinged; (2) floaters within 6 km not already pinged (no
refusal penalty: outside their radius); (3) up to 8 people with wheels, not floating, not busy then, active this week,
at most 2 such nudges per person per IST day. All get an "I'll take them" button.

## Admin alerts (release 15)
`services/admin-alerts.ts`. Each first-time sign-up DMs every admin ("🆕 Priya joined: 🛵 scooty, invited by Asha.
That's 42 people now"), at most 20 a day (`sent_keys signup-alert:<day>:<n>`); admins aren't told about themselves.
At 21:00 IST (`digest:<day>`) every admin gets the day's summary: who joined, plans posted, rides matched and done,
asks from today nobody took, new places, and the dashboard's Worth-a-look list. Both carry an "Open the dashboard" button.
