import { EarlySlider } from "@/components/early-slider";
import { Ticker } from "@/components/ticker";
import { VillageMap } from "@/components/village-map";
import { currentUser } from "@/lib/auth";
import { botEnabled, env } from "@/lib/env";
import { db, hasDb } from "@/db";
import { Milestone, Pulse, ago } from "@/components/pulse";
import { destName, placeName } from "@/lib/places";
import { istHHMM } from "@/lib/time";
import { loadPlaces } from "@/services/places";
import { openBoard, pulse, recentRides } from "@/services/stats";

/** What's actually happening, for the ticker: recent rides, open asks, floaters. */
async function liveLines(now: Date) {
  const d = db();
  await loadPlaces(d);
  const [feed, open, p] = await Promise.all([recentRides(d, 8), openBoard(d, now), pulse(d, now)]);
  const lines = [
    ...open.filter((o) => o.plan.kind === "request").slice(0, 3).map((o) => `🙋 ${o.name} is asking for a ride: ${placeName(o.plan.fromPlace)} → ${destName(o.plan.toPlace, o.plan.note, o.plan.rangeKm)}, around ${istHHMM(o.plan.departAt)}. Anyone?`),
    ...open.filter((o) => o.plan.kind === "offer").slice(0, 2).map((o) => `${o.vehicle === "car" ? "🚗" : "🛵"} ${o.name} has ${o.plan.seats} seat${o.plan.seats > 1 ? "s" : ""} to ${placeName(o.plan.toPlace)} around ${istHHMM(o.plan.departAt)}.`),
    ...feed.map((r) => `🎉 ${r.pilot.name} took ${r.hitcher.name} ${r.to === "errand" ? "on an errand and back" : `to ${destName(r.to, null, r.rangeKm)}`} · ${ago(r.at, now)}`),
    ...(p.floatingNow ? [`🌴 ${p.floatingNow} floating right now, waiting to be asked.`] : []),
  ];
  return { lines, p };
}

export const dynamic = "force-dynamic";

const ROLES = [
  {
    key: "pilot",
    title: "Pilot",
    tag: "You've got the scooty (or the car). Someone's got the time.",
    body: "Say where you're going and when: “around 4pm, Arambol, 1 seat free.” A hitcher claims it. You ride, you chat (or don't), you both earn kaju. Pilots earn more: you brought the wheels. One scooty, one pillion. Got a car? Offer up to six seats, and every passenger counts.",
  },
  {
    key: "hitcher",
    title: "Hitcher",
    tag: "No scooty? No problem. Say the word.",
    body: "Post “around 4pm I want to go to Riva,” and the village finds you a seat. Need to pop to the pharmacy and come straight back? Ask for a quick errand: a floater nearby takes you and brings you home. Need one right now? Send a ride-now alert. Fewer kaju, same goodwill.",
  },
  {
    key: "floater",
    title: "Floater",
    tag: "The hero of the story. Also: not doing much.",
    body: "Got nowhere to be? Share your live location on Telegram, tell the bot “I'm around, ping me,” and go lie on the sand. When someone needs a ride, you're the nearest answer. You're not giving up your plans, you're giving the village your lack of them. Aimlessness, donated. That's why floaters earn the most kaju. The one rule: floaters say yes. Turn down a nearby request and you weren't really floating (−10, and that hour's on us, not you). Susegad, but make it useful.",
  },
];

const KAJU = [
  ["Sign up on Telegram", "+10", "Name, vehicle, seats. Welcome aboard."],
  ["Post a plan 2h+ ahead (pilot or hitcher)", "+15", "Prophets get paid."],
  ["Ride-now alert", "+5", "Spontaneity is still a virtue. A smaller one."],
  ["Complete a ride as pilot", "+30", "You brought the Activa. Respect."],
  ["Complete a ride as hitcher", "+10", "You brought the company. Also respect."],
  ["Float for an hour", "+10", "Every hour, 7am to 11pm. Nap on the beach, get rich. But if a request comes in that hour and you can't answer it, that hour's kaju goes."],
  ["Cancel last-minute", "−5", "Not a punishment. Someone just checked their phone twice."],
  ["Floater turns down a request", "−10", "And that hour isn't paid. If you say no, you weren't really floating. Busy? Stop floating first."],
];


const ROADMAP = (live: boolean) => [
  ["Beta: bugs, ideas, any place, errands", "live now", "Type /bug or /feature in the bot. Name any stay or café as a destination. Ask for a quick errand and back."],
  ["This page + your avatar", "live now", "Draw yourself right after you sign up: it's you on the map and next to your rides."],
  ["Telegram login", live ? "live now" : "built, bot waking up", "Your avatar meets your Telegram name. Now the village knows you."],
  ["Sign-up, rides, floating, kaju", live ? "live now" : "built, bot waking up", "Pilots post, hitchers hop, floaters float. The map wakes up."],
];

const FAQ = [
  ["Is it free?", "Yes. Kaju is pretend money: it can't be bought, only earned. Rides are favours between neighbours."],
  ["Is this finished?", "No! Pillion is a beta and an experiment. Some things will be wobbly. Tap the 🧪 Beta button (or type /bug or /feature in the bot) and the team hears about it straight away."],
  ["Where can I go?", "Anywhere around the village. Riva and the Circle are the hubs and come first in every list, and the evening community dinner is always there. Staying somewhere that isn't listed? Pick “Somewhere else”, type its name, and drop a pin: it's on the list for everyone from then on. Places close together count as the same destination, so the stay next to Riva matches rides to Riva."],
  ["Can I just pop to a shop and back?", "Yes. Ask for a ride and pick “Quick errand nearby & back”, then say what it's for (pharmacy, ATM, laundry). A floater near you gets pinged, takes you, waits or comes back, and drops you home."],
  ["Is it a taxi?", "No. Nobody's working. It's one villager going somewhere and another one tagging along. For the Riva ↔ Circle run, the shuttle is still your friend."],
  ["Cars too?", "Yes! Pick 🚗 when you sign up (or /wheels later) and offer as many seats as you have. Each passenger is its own ride, so a full car is a lot of kaju."],
  ["Do I need a scooty?", "Not at all. Hitchers earn kaju too, and half the village is on foot. You just need Telegram and somewhere to be."],
  ["What if I cancel?", "Life happens. Cancel early and nothing happens. Cancel last-minute and you lose 5 kaju: a tiny nudge, because someone was waiting by the gate."],
  ["Is my location tracked all the time?", "Only while you're floating, and only because you switched Telegram live location on. Switch it off and you vanish from the map."],
  ["Is it safe?", "Rides are only between village members, verified through Telegram. Wear a helmet. Ride with people from here. That's the whole safety talk."],
];

export default async function Home() {
  const user = await currentUser();
  const live = botEnabled();
  const now = new Date();
  const village = hasDb() ? await liveLines(now).catch(() => null) : null;
  return (
    <main>
      <header className="hero">
        <img className="hero-art" src="/art/hero.webp" alt="" />
        <div className="hero-text">
          <p className="eyebrow">Edge City India · Mandrem · 11 Oct – 1 Nov <span className="beta-pill">beta</span></p>
          <h1>Your scooty has a lonely back seat.</h1>
          <p className="sub">
            Pillion matches people with scooties (and a few cars) to people without them, all over the village.
            It all happens in a Telegram chat: tell the bot where you&apos;re going, and it finds you a ride or a rider.
          </p>
          <div className="hero-ctas">
            {user ? (
              <a className="btn" href="/home">Open my Pillion</a>
            ) : live ? (
              <a className="btn" href={`https://t.me/${env.botUsername()}`}>Start on Telegram</a>
            ) : (
              <a className="btn" href="#how">Meet the three roles</a>
            )}
            <a className="btn ghost" href="/how-it-works">How it works</a>
          </div>
          {live && !user && <p className="hint">Opens <b>@{env.botUsername()}</b>. No app, no password. Already in? <a href="/login">Log in on the web</a>.</p>}
        </div>
      </header>

      <Ticker live={village?.lines} />

      {village && village.p.people > 0 && (
        <section className="pulse-section" aria-label="The village in numbers">
          <Pulse p={village.p} />
          <Milestone rides={village.p.rides} next={village.p.next} />
        </section>
      )}

      <section className="beta-section" aria-labelledby="beta-h">
        <div className="beta-card">
          <span className="stamp">Beta · an experiment</span>
          <h2 id="beta-h">This is a beta, and an experiment. Let&apos;s test it out together.</h2>
          <p>
            Pillion is our experiment in sharing rides around the village. Most of us have a back seat that rides
            empty, or a car with three spare seats, and most of us have stood at Riva wondering how to get to the
            Circle. We think the village can fix that for itself, if we plan a little.
          </p>
          <p>
            <b>That&apos;s why we reward planning.</b> We want finding a ride to be predictable, not a last-minute,
            half-hearted scramble. When you say at breakfast that you&apos;re going to Arambol at four, someone can
            plan around you. So early plans earn the most kaju, and a ride-now alert earns a little.
          </p>
          <ul>
            <li>Riva and the Circle are the hubs. Any stay, café or tonight&apos;s dinner can be a destination: just type it.</li>
            <li>Need to pop to a shop nearby and come back? Ask for a quick errand; a floater close by takes you.</li>
            <li>Scooties carry one pillion, cars up to six.</li>
            <li><b>It works when lots of us are on it.</b> Every person who joins makes a ride likelier for everyone else. Bring your housemates, your residency, your table at dinner.</li>
          </ul>
          <p>Some things will break. Please tell us when they do, and tell us what you wish it did.</p>
          <div className="beta-ctas">
            {live ? (
              <>
                <a className="btn small" href={`https://t.me/${env.botUsername()}?start=bug`}>🐞 Report a bug</a>
                <a className="btn small ghost" href={`https://t.me/${env.botUsername()}?start=feature`}>💡 Suggest an idea</a>
              </>
            ) : null}
          </div>
          <p className="fine">In the bot: <b>/bug</b> what broke · <b>/feature</b> what you wish it did. Or tap 🧪 Beta in the corner of any page.</p>
        </div>
      </section>

      <section className="map-section" aria-labelledby="map-h">
        <h2 id="map-h">The village, in scooties (and a few cars)</h2>
        <p className="lede">Once you sign up and draw yourself, that&apos;s you puttering around: you, your neighbours, and that one floater who never seems to leave Ashwem.</p>
        <div className="map-scroll"><VillageMap /></div>
        <p className="fine map-hint">← swipe the map →</p>
      </section>

      <section id="how" aria-labelledby="how-h">
        <h2 id="how-h">Three ways to play <span className="beta-pill">beta</span></h2>
        <p className="lede">Be any of them, any day. Most people end up being all three.</p>
        <div className="roles">
          {ROLES.map((r) => (
            <article key={r.key} className={`role role-${r.key}`}>
              <img src={`/art/${r.key}.webp`} alt="" width={512} height={512} loading="lazy" />
              <h3>{r.title}</h3>
              <p className="tag">{r.tag}</p>
              <p>{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="kaju" aria-labelledby="kaju-h">
        <div className="kaju-head">
          <img src="/art/kaju.svg" alt="" width={160} height={160} loading="lazy" />
          <div>
            <h2 id="kaju-h">Kaju: the village currency</h2>
            <p className="lede">Goa is cashew country, so we pay in cashews. Pretend ones. Every bit of joining in earns some.</p>
          </div>
        </div>
        <ul className="kaju-list">
          {KAJU.map(([action, amount, note]) => (
            <li key={action}>
              <span className={`amount ${amount.startsWith("−") ? "minus" : ""}`}>{amount}</span>
              <span className="action">{action}</span>
              <span className="note">{note}</span>
            </li>
          ))}
        </ul>
        <p className="fine">Kaju is pretend. The rides are real.</p>
      </section>

      <section className="early" aria-labelledby="early-h">
        <div>
          <h2 id="early-h">Why tell us early?</h2>
          <p>
            A ride only happens when two plans cross. Tell the bot at breakfast that you&apos;re off to Ashwem
            at four, and it has all day to find your match, and to nudge the one person who was quietly
            hoping someone would say exactly that. A ride-now alert works too, but it only has minutes, and
            it only sees who&apos;s floating nearby.
          </p>
          <p>
            We&apos;d rather value your planning than your speed. A village where people say early where they&apos;re
            going is one where a ride is something you can count on, not something you hope for.
          </p>
          <p><b>Early plans turn the village into a timetable. Late ones turn it into luck.</b></p>
        </div>
        <EarlySlider />
      </section>

      <section className="how-teaser" aria-labelledby="teaser-h">
        <h2 id="teaser-h">How it works, in full</h2>
        <p className="lede">Step by step: signing up, posting a ride, floating, errands, places, every kaju rule, and a village day you can tap through.</p>
        <a className="btn" href="/how-it-works">Read how it works →</a>
      </section>


      <section className="roadmap" aria-labelledby="road-h">
        <h2 id="road-h">What&apos;s live, what&apos;s next</h2>
        <p className="lede">We ship in small, honest steps. Each one is useful on its own.</p>
        <ol>
          {ROADMAP(live).map(([title, when, body]) => (
            <li key={title} className={when === "live now" ? "live" : ""}>
              <span className="when">{when}</span>
              <b>{title}</b>
              <span>{body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="faq" aria-labelledby="faq-h">
        <h2 id="faq-h">Questions people have asked us at the chai stall</h2>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <footer>
        <p>Made in Mandrem, with one spare seat and a bag of cashews. <a href="/how-it-works">How it works</a></p>
        <p className="fine">Pillion <span className="beta-pill">beta</span> · an experiment in sharing rides · Edge City India 2026</p>
      </footer>
    </main>
  );
}
