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
- After `depart_at + 20 min` both people are asked "Did you ride together?". One *Yes* completes the ride.
- Cancelling a matched ride or plan less than 30 min before `depart_at` (or after it) costs the canceller 5 kaju,
  and the other person gets a kind DM.

## Floating
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
| floater_cancel | −10 when a floater cancels a pickup they took (any time), plus no float kaju for that hour (`floats.forfeit_minutes` += 60; if the float was already paid, `float_forfeit` takes back up to 20). Replaces late_cancel. |

## Daily prizes (21:00 IST, many small winners)
Most Generous Pilot (most rides done as pilot), Earliest Bird (longest lead on a plan that became a done ride),
Longest Float (most float minutes), Best Avatar (most hearts from others that day), Pharmacy Run Hero (a done ride
after 21:00 or to the pharmacy/market), Mystery Kaju (seeded random among everyone with a done ride).
Ties → everyone tied wins. Posted to `PILLION_ANNOUNCE_CHAT_ID` if set, and shown on `/today`.

## Background ticker (in-process, every 60 s)
Close stale floats, remind matched rides 15 min ahead, ask for completion, 08:00 morning nudge, 21:00 prizes.
Each scheduled message has a unique key in `sent_keys`, so restarts never double-send.
