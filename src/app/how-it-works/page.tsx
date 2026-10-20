import type { Metadata } from "next";
import { DayStory, type Beat } from "@/components/day-story";
import { currentUser } from "@/lib/auth";
import { botEnabled, env } from "@/lib/env";
import { KAJU } from "@/lib/kaju";
import { FLOAT_RADIUS_M, MATCH_WINDOW_MIN, VILLAGE_RADIUS_M } from "@/lib/match";
import { SAME_PLACE_M } from "@/lib/places";
import { CHECK_AFTER_MIN, CHECK_GRACE_MIN } from "@/services/floats";
import { DEDUPE_M } from "@/services/places";
import { PRIZE_KAJU, PRIZES } from "@/services/prizes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "How Pillion works (beta)",
  description: "Everything about Pillion: how to share a ride, float, earn kaju and win the 9pm prizes, step by step.",
};

const km = (m: number) => `${m / 1000} km`;

const BEATS: Beat[] = [
  { time: "8:40am", who: "Asha (scooty)", title: "Asha posts at breakfast", body: "In the bot she taps “I'm going somewhere”, picks Arambol, from Riva, and “in 5 h”. Done in four taps.", gif: "/gifs/welcome.gif", kaju: `+${KAJU.planEarly} (posted 2 h+ ahead)` },
  { time: "8:41am", who: "Ben (no wheels)", title: "Ben gets a ping", body: `Ben had asked for Arambol around 2pm the night before. Asha's 1:40pm is within ${MATCH_WINDOW_MIN} minutes, so the bot DMs him: “Asha has a seat to Arambol around 1:40pm.” He taps 🛵 Hop on.` },
  { time: "8:41am", who: "Both", title: "Matched!", body: "Both get a message with the other's name and Telegram, so they can say where exactly to meet. Ben's other requests around that time close: nobody is in two places at once.", gif: "/gifs/matched.gif" },
  { time: "1:25pm", who: "Both", title: "Helmet check", body: "Fifteen minutes before, the bot reminds them both. If something came up, “Can't make it” is right there (inside 30 minutes it costs 5 kaju, and the other person gets a kind note)." },
  { time: "2:00pm", who: "Both", title: "“Did you ride together?”", body: "Twenty minutes after the time, the bot asks. One ✅ from either of them is enough.", gif: "/gifs/kaju.gif", kaju: `Asha +${KAJU.ridePilot}, Ben +${KAJU.rideHitcher}` },
  { time: "4:10pm", who: "Flo (scooty, nowhere to be)", title: "Flo floats", body: "Flo shares her live location with the bot and lies on the sand. She earns 5 kaju every 15 minutes while she's floating.", gif: "/gifs/float.gif", kaju: `+${KAJU.floatPer15} per 15 min` },
  { time: "4:32pm", who: "Ben", title: "A quick errand", body: "Ben needs the pharmacy and back. He asks for “Quick errand nearby & back” from Riva, now. Flo is within 3 km, so she's pinged with “I'll take them” and “Can't right now”." },
  { time: "4:33pm", who: "Flo", title: "Floaters say yes", body: `Flo taps “I'll take them”. (If she'd said no, or ignored it for ${KAJU.floaterAnswerMin} minutes while nobody else took it, she'd lose ${-KAJU.floaterRefusal} kaju and the last hour of float pay, and her float would end. Busy? /stop first, no penalty.)` },
  { time: "9:00pm", who: "Everyone", title: "Prizes!", body: `Many small winners every evening: Most Generous Pilot, Earliest Bird, Longest Float, Best Avatar, Pharmacy Run Hero, Mystery Kaju. Each winner gets ${PRIZE_KAJU} kaju and a real, small prize.`, gif: "/gifs/prizes.gif" },
];

const KAJU_ROWS: [string, string, string][] = [
  ["Sign up", `+${KAJU.signup}`, "Once."],
  ["Post a plan 2 h or more ahead", `+${KAJU.planEarly}`, `Pilot or hitcher. Up to ${KAJU.planAwardsPerDay} paid plans a day.`],
  ["Post a plan 30 min – 2 h ahead", `+${KAJU.planSoon}`, "Still kind of you."],
  ["Post a plan for right now", `+${KAJU.planNow}`, "Spontaneity is a virtue, a smaller one."],
  ["A ride happens, you were the pilot", `+${KAJU.ridePilot}`, `You brought the wheels. The same two people are paid for ${KAJU.pairRidesPerDay} rides together a day.`],
  ["A ride happens, you were the hitcher", `+${KAJU.rideHitcher}`, "You brought the company."],
  ["Float", `+${KAJU.floatPer15} / 15 min`, `7am to 11pm only, up to ${KAJU.floatMaxPerDay} a day.`],
  ["Win a 9pm prize", `+${PRIZE_KAJU}`, "Plus the prize itself."],
  ["Cancel inside 30 min of the time", `${KAJU.lateCancel}`, "Someone was waiting by the gate."],
  ["Floater says no (or doesn't answer)", `${KAJU.floaterRefusal}`, "And the last hour of floating isn't paid. The float ends."],
  ["Cancel a plan nobody rode on", "back", "Its plan kaju goes back, so post-and-cancel earns nothing."],
];

const COMMANDS: [string, string][] = [
  ["/start", "Sign up (or say hi)"],
  ["/go", "🛵 I'm going somewhere and have a seat"],
  ["/ride", "🙋 I need a ride, or a quick errand and back"],
  ["/float", "🌴 How floating works (share live location to start)"],
  ["/stop", "Stop floating, no penalty"],
  ["/mine", "📋 My plans and rides, with cancel buttons"],
  ["/kaju", "🥜 My kaju and the last few changes"],
  ["/web", "🌐 A one-time link to log in on the site"],
  ["/wheels", "🛵 / 🏍️ / 🚗 Change your vehicle (cars: seats)"],
  ["/name", "Change what the village calls you"],
  ["/bug …", "🐞 Something broke (also /error)"],
  ["/feature …", "💡 Something you wish it did (also /idea)"],
  ["/help", "This list"],
];

export default async function HowItWorks() {
  const user = await currentUser();
  const bot = env.botUsername();
  const live = botEnabled();
  return (
    <main className="how">
      <header className="how-top">
        <a href="/" className="brand">Pillion <span className="beta-pill">beta</span></a>
        <a className="btn small" href={user ? "/home" : live ? `https://t.me/${bot}` : "/"}>{user ? "My rides" : "Open the bot"}</a>
      </header>

      <section className="how-hero">
        <p className="eyebrow">How it works</p>
        <h1>Spare seats, finding people.</h1>
        <p className="sub">
          Pillion is the village sharing rides: people with a scooty or a car say where they&apos;re going, people without
          one hop on, and people with nowhere to be float around and pick folks up. It all happens in a Telegram bot,
          and it&apos;s a game: everything earns <b>kaju</b>, and every evening there are prizes.
        </p>
        <nav className="toc" aria-label="On this page">
          {[["#story", "A day, tap by tap"], ["#start", "Get started"], ["#pilot", "Pilot"], ["#hitcher", "Hitcher"], ["#floater", "Floater"], ["#places", "Places"], ["#kaju", "Kaju"], ["#prizes", "Prizes"], ["#fair", "Fair play"], ["#commands", "Commands"], ["#beta", "Beta"], ["#team", "For the team"]].map(([href, label]) => (
            <a key={href} href={href} className="chip">{label}</a>
          ))}
        </nav>
      </section>

      <section id="story" aria-labelledby="story-h">
        <h2 id="story-h">A day, tap by tap</h2>
        <p className="lede">Asha has a scooty, Ben doesn&apos;t, Flo has nowhere to be. Tap through their day.</p>
        <DayStory beats={BEATS} />
      </section>

      <section id="start" aria-labelledby="start-h">
        <h2 id="start-h">Get started (a minute)</h2>
        <ol className="steps">
          <li><b>Open the bot.</b> {live ? <a href={`https://t.me/${bot}`}>@{bot}</a> : "The Pillion bot"} on Telegram, and press <b>Start</b>.</li>
          <li><b>Step 1: what do you ride?</b> 🛵 Scooty, 🏍️ bike, 🚗 car (say how many seats) or 🚶 no wheels. A scooty or bike carries exactly one pillion. You get {KAJU.signup} kaju for joining.</li>
          <li><b>Step 2: draw yourself.</b> The bot sends a link: scribble a face (badly is fine) and pick your scooty colour. It&apos;s you on the village map and next to your rides. You can skip it and come back.</li>
          <li><b>That&apos;s it.</b> The menu has everything: going somewhere, need a ride, float, my rides, kaju. The website (/web in the bot) shows the same things with bigger buttons.</li>
        </ol>
        <p className="hint">Set a Telegram username (Settings → Username) so the people you ride with can message you to sort the pickup.</p>
      </section>

      <section id="pilot" className="how-role" aria-labelledby="pilot-h">
        <img src="/art/pilot.webp" alt="" width={240} height={240} loading="lazy" />
        <div>
          <h2 id="pilot-h">Pilot: you have the wheels</h2>
          <ol className="steps">
            <li><b>Post where you&apos;re going.</b> /go (or “I&apos;m going somewhere”): pick where to, where from, and roughly when (“in 2 h”, or type <b>4:30pm</b>). Cars pick how many seats are free.</li>
            <li><b>The bot finds your people.</b> Anyone who asked to go to the same place within {MATCH_WINDOW_MIN} minutes of your time gets a DM with <b>Hop on</b>. Your ride also shows on the site&apos;s board.</li>
            <li><b>Or pick someone up.</b> When someone asks for a ride that fits, you get a DM with <b>I&apos;ll take them</b>. First tap wins.</li>
            <li><b>Ride.</b> You both get each other&apos;s name and Telegram, a reminder 15 minutes before, and “Did you ride together?” 20 minutes after. One yes and the kaju lands.</li>
          </ol>
        </div>
      </section>

      <section id="hitcher" className="how-role" aria-labelledby="hitcher-h">
        <img src="/art/hitcher.webp" alt="" width={240} height={240} loading="lazy" />
        <div>
          <h2 id="hitcher-h">Hitcher: you need a ride</h2>
          <ol className="steps">
            <li><b>Ask.</b> /ride (or “I need a ride”): where to, where from, when. The earlier you ask, the likelier a match, and the more kaju.</li>
            <li><b>Pilots going your way get pinged</b>, and so do floaters near you if it&apos;s within the hour. You hear the moment someone says yes.</li>
            <li><b>Quick errand and back.</b> Need the pharmacy, the ATM or your laundry? Pick “🧺 Quick errand nearby &amp; back” and say what for. A floater near you takes you there and drops you back.</li>
            <li><b>Hop on someone&apos;s ride.</b> Offers going your way come to you as DMs with <b>Hop on</b>, and they&apos;re on the board.</li>
          </ol>
        </div>
      </section>

      <section id="floater" className="how-role" aria-labelledby="floater-h">
        <img src="/art/floater.webp" alt="" width={240} height={240} loading="lazy" />
        <div>
          <h2 id="floater-h">Floater: you have nowhere to be</h2>
          <p>The most helpful thing in the village is a person with a scooty and no plans. That&apos;s why floaters earn the most.</p>
          <ol className="steps">
            <li><b>Start.</b> In the bot: 📎 → Location → <b>Share My Live Location</b>. You&apos;re floating, near whichever place is closest. (A one-off pin floats you for an hour.)</li>
            <li><b>Get paid to exist.</b> {KAJU.floatPer15} kaju every 15 minutes, 7am to 11pm, up to {KAJU.floatMaxPerDay} a day. Only inside the village (within {km(VILLAGE_RADIUS_M)} of a known place), and only with wheels.</li>
            <li><b>Say yes.</b> When someone within {km(FLOAT_RADIUS_M)} needs a ride in the next hour, you get a ping with <b>I&apos;ll take them</b> and <b>Can&apos;t right now</b>. Answer within {KAJU.floaterAnswerMin} minutes.</li>
            <li><b>The one rule.</b> Saying no (or not answering while nobody else takes it) means you weren&apos;t really floating: {KAJU.floaterRefusal} kaju, the last hour isn&apos;t paid, and the float ends. Someone else grabbing it first costs nothing. Not free any more? <b>/stop</b> first, no penalty.</li>
            <li><b>Still there?</b> If your location hasn&apos;t moved for {CHECK_AFTER_MIN} minutes, the bot asks “Still floating?”. No answer in {CHECK_GRACE_MIN} minutes and the float ends where it asked. Floats end when you stop sharing, on /stop, or after 8 hours.</li>
          </ol>
          <p className="hint">You don&apos;t get pinged for rides at a time you already have one, and nobody is pinged at night.</p>
        </div>
      </section>

      <section id="places" aria-labelledby="places-h">
        <h2 id="places-h">Places: anywhere in the village</h2>
        <ul className="bullets">
          <li><b>Riva and the Circle are the hubs</b> (⭐): first in every list. The evening <b>community dinner</b> (🍲) is always there too; its pin and note say where it is tonight.</li>
          <li><b>Not on the list?</b> Tap “➕ Somewhere else” and type it: your stay, a café, a beach shack. The bot asks you to drop a pin (📎 → Location → move the map → send). From then on it&apos;s on the list for everyone. Nobody has to add places by hand.</li>
          <li><b>No duplicates.</b> The same name (any capitals) or a pin within {DEDUPE_M} m of a known place reuses that place.</li>
          <li><b>Close counts.</b> Two pinned places within {SAME_PLACE_M} m count as the same destination, so a ride to the stay next to Riva matches someone going to Riva.</li>
          <li><b>Pins help floaters.</b> A place with no pin still works for matching by name, but floaters can&apos;t be pinged to pick you up there. Drop a pin when you add it.</li>
        </ul>
      </section>

      <section id="kaju" className="kaju" aria-labelledby="kaju-h">
        <h2 id="kaju-h">Kaju: the whole table</h2>
        <p className="lede">Kaju is pretend money (Goa is cashew country). It can&apos;t be bought, only earned. The prizes are real.</p>
        <ul className="kaju-list">
          {KAJU_ROWS.map(([action, amount, note]) => (
            <li key={action}>
              <span className={`amount ${amount.startsWith("-") || amount.startsWith("−") ? "minus" : ""}`}>{amount.replace(/^-/, "−")}</span>
              <span className="action">{action}</span>
              <span className="note">{note}</span>
            </li>
          ))}
        </ul>
        <p>
          <b>Why early plans pay more:</b> we want finding a ride to be predictable, not a last-minute scramble. A plan
          posted at breakfast gives the bot all day to find its match. A ride-now alert only has minutes, and only the
          floaters nearby.
        </p>
      </section>

      <section id="prizes" aria-labelledby="prizes-h">
        <h2 id="prizes-h">The 9pm prizes</h2>
        <p className="lede">Every evening at 9, many small winners, never one big one. Ties: everyone tied wins. Each winner gets {PRIZE_KAJU} kaju and a small real prize. See who&apos;s ahead on <a href="/today">Today</a>.</p>
        <ul className="prize-list">
          {Object.values(PRIZES).map((p) => (
            <li key={p.title}><b>{p.title}</b><span>{p.line}</span></li>
          ))}
        </ul>
        <p className="hint">Best Avatar counts hearts: on Today, tap ♥ on avatars you love (one heart per person per day).</p>
      </section>

      <section id="fair" aria-labelledby="fair-h">
        <h2 id="fair-h">Fair play (and why)</h2>
        <ul className="bullets">
          <li><b>Nobody is in two places at once.</b> A hitcher, scooty or bike has one ride per {MATCH_WINDOW_MIN} minutes either side; a car takes up to its seats. When you&apos;re matched, your other plans around then close.</li>
          <li><b>Cancelling.</b> Early: nothing happens. Inside 30 minutes (or after the time): {KAJU.lateCancel} kaju, and the other person gets a kind note.</li>
          <li><b>“It didn&apos;t happen.”</b> One “didn&apos;t happen” doesn&apos;t block the other person: if they say it did, it counts. Two noes close it. Rides nobody confirms expire after 24 hours with no kaju.</li>
          <li><b>No farming.</b> At most {KAJU.planAwardsPerDay} paid plans a day; cancelling a plan nobody rode on takes its kaju back; the same two people are paid for {KAJU.pairRidesPerDay} rides together a day.</li>
          <li><b>Safety and privacy.</b> Rides are between village members on Telegram. Wear a helmet. Your location is only seen while you float, because you switched live location on; switch it off and you vanish.</li>
          <li><b>Not a taxi.</b> Nobody is working. It&apos;s neighbours going the same way. For Riva ↔ Circle, the shuttle is still your friend.</li>
        </ul>
      </section>

      <section id="commands" aria-labelledby="commands-h">
        <h2 id="commands-h">Every bot command</h2>
        <dl className="commands">
          {COMMANDS.map(([c, d]) => (<div key={c}><dt>{c}</dt><dd>{d}</dd></div>))}
        </dl>
      </section>

      <section id="beta" className="beta-section" aria-labelledby="beta2-h">
        <div className="beta-card">
          <span className="stamp">Beta · an experiment</span>
          <h2 id="beta2-h">It&apos;s a beta. Tell us everything.</h2>
          <p>Something broke, felt confusing, or you wish it did something? Type <b>/bug</b> or <b>/feature</b> and your message in the bot, or tap 🧪 Beta in the corner of any page. It goes straight to the team on Telegram, and you hear back when it&apos;s sorted.</p>
        </div>
      </section>

      <section id="team" aria-labelledby="team-h">
        <h2 id="team-h">For the team: under the hood</h2>
        <details className="under">
          <summary>Roles and dashboards</summary>
          <ul className="bullets">
            <li><b>Member</b> (everyone), <b>staff</b> and <b>admin</b>. Admins listed in the app&apos;s settings become admin when they next message the bot; admins make others staff or admin on the dashboard (and can&apos;t demote themselves).</li>
            <li><b>/admin</b> in the bot sends a one-time link. The dashboard shows today&apos;s numbers, every bug and idea (move them: on it, done, won&apos;t do; done thanks the reporter), matched rides, open plans, who&apos;s floating, places (add, rename, re-pin with “lat, lng” or a Google Maps link, change kind, hide) and people (roles).</li>
            <li><b>/staff</b> is the same dashboard, read-only.</li>
            <li>Every /bug, /error, /feature and /idea DMs every admin straight away (10 per person per hour at most).</li>
          </ul>
        </details>
        <details className="under">
          <summary>What happens when, automatically</summary>
          <ul className="bullets">
            <li><b>Every minute</b>: floater pings unanswered for {KAJU.floaterAnswerMin} min become refusals (if the request is still open); quiet floats get “still floating?”; floats past their time end and are paid; old plans and unconfirmed rides expire; rides 15 min away get a reminder; rides 20 min past get “did you ride together?”.</li>
            <li><b>8:00am</b>: a good-morning nudge to the announcement group. <b>9:00pm</b>: prizes are computed, paid and posted.</li>
            <li>Every scheduled message is sent once, even if the app restarts.</li>
          </ul>
        </details>
        <details className="under">
          <summary>How matching decides</summary>
          <ul className="bullets">
            <li>An offer fits a request when the destinations are the same place (or pinned within {SAME_PLACE_M} m), the times are within {MATCH_WINDOW_MIN} min, there&apos;s a free seat, and they&apos;re two different people.</li>
            <li>A new request pings every pilot whose offer fits, plus, if it&apos;s within the hour, floaters within {km(FLOAT_RADIUS_M)} of the pickup who are free then (7am–11pm). Errands only go to floaters.</li>
            <li>A new offer pings every hitcher whose request fits. A floater who starts floating is told about up to 3 open requests nearby.</li>
            <li>A ride starts when someone taps Hop on / I&apos;ll take them; the first tap wins, and seats are checked at that moment.</li>
          </ul>
        </details>
        <details className="under">
          <summary>Kaju bookkeeping</summary>
          <ul className="bullets">
            <li>Kaju is a ledger that is only ever added to: every change is a new line with a reason, at most once per reason and ride/plan. Nothing is edited or deleted, so balances can always be explained.</li>
            <li>Days are India time (IST). Times shown anywhere are IST.</li>
          </ul>
        </details>
      </section>

      <footer>
        <p>Questions not answered here? /feature them, and we&apos;ll add the answer.</p>
        <p className="fine">Pillion <span className="beta-pill">beta</span> · an experiment in sharing rides · Edge City India 2026</p>
      </footer>
    </main>
  );
}
