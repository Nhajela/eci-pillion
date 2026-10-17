import { AvatarMaker } from "@/components/avatar-maker";
import { EarlySlider } from "@/components/early-slider";
import { Ticker } from "@/components/ticker";
import { VillageMap } from "@/components/village-map";
import { currentUser } from "@/lib/auth";
import { botEnabled, env } from "@/lib/env";

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
    body: "Post “around 4pm I want to go to the pharmacy,” and the village finds you a seat. Need one right now? Send a ride-now alert. Fewer kaju, same goodwill. One helmet, one person, twenty minutes.",
  },
  {
    key: "floater",
    title: "Floater",
    tag: "The hero of the story. Also: not doing much.",
    body: "Got nowhere to be? Share your live location on Telegram, tell the bot “I'm around, ping me,” and go lie on the sand. When someone needs a ride, you're the nearest answer. You're not giving up your plans, you're giving the village your lack of them. Aimlessness, donated. That's why floaters earn the most kaju. Susegad, but make it useful.",
  },
];

const KAJU = [
  ["Sign up on Telegram", "+10", "Name, vehicle, seats. Welcome aboard."],
  ["Post a plan 2h+ ahead (pilot or hitcher)", "+15", "Prophets get paid."],
  ["Ride-now alert", "+5", "Spontaneity is still a virtue. A smaller one."],
  ["Complete a ride as pilot", "+30", "You brought the Activa. Respect."],
  ["Complete a ride as hitcher", "+10", "You brought the company. Also respect."],
  ["Float for an hour", "+20", "Every hour. Nap on the beach, get rich."],
  ["Cancel last-minute", "−5", "Not a punishment. Someone just checked their phone twice."],
  ["Floater drops a pickup", "−10", "And no float kaju for that hour. Floaters are the village's promise."],
];

const PRIZES = [
  ["Most Generous Pilot", "Most people carried, most kaju in the jar."],
  ["Earliest Bird", "Posted tomorrow's ride while everyone else was asleep."],
  ["Longest Float", "Did the least, helped the most."],
  ["Best Avatar", "The scribble the whole map stops to look at."],
  ["Pharmacy Run Hero", "Someone needed Crocin at 11pm. You went."],
  ["Mystery Kaju", "Picked at random from everyone who rode today. Just show up."],
];

const ROADMAP = (live: boolean) => [
  ["This page + your avatar", "live now", "Draw yourself. It's saved in your browser and comes with you when you log in."],
  ["Telegram login", live ? "live now" : "built, bot waking up", "Your avatar meets your Telegram name. Now the village knows you."],
  ["Sign-up, rides, floating, kaju", live ? "live now" : "built, bot waking up", "Pilots post, hitchers hop, floaters float. The map wakes up."],
  ["Daily prizes", live ? "live now" : "built, bot waking up", "Every evening at 9, many small winners."],
];

const FAQ = [
  ["Is it free?", "Yes. Kaju is pretend money. Rides are favours between neighbours. The prizes are real, but you can't buy them, only earn them."],
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
  return (
    <main>
      <header className="hero">
        <img className="hero-art" src="/art/hero.webp" alt="" />
        <div className="hero-text">
          <p className="eyebrow">Edge City India · Mandrem · 11 Oct – 1 Nov</p>
          <h1>Your scooty has a lonely back seat.</h1>
          <p className="sub">
            Pillion matches people with scooties to people without them, all over the village. Rides earn
            kaju. Kaju wins prizes. Nobody&apos;s late to Arambol.
          </p>
          <div className="hero-ctas">
            {user ? (
              <a className="btn" href="/home">Open my Pillion</a>
            ) : live ? (
              <a className="btn" href="/login">Join on Telegram</a>
            ) : (
              <a className="btn" href="#avatar">Make my avatar</a>
            )}
            <a className="btn ghost" href={user || live ? "#avatar" : "#how"}>{user || live ? "Draw my avatar" : "How it works"}</a>
          </div>
          {live && !user && <p className="hint">Or say hi to <a href={`https://t.me/${env.botUsername()}`}>@{env.botUsername()}</a> directly.</p>}
        </div>
      </header>

      <Ticker />

      <section className="map-section" aria-labelledby="map-h">
        <h2 id="map-h">The village, in scooties</h2>
        <p className="lede">A toy map for now. Once rides begin, these are real people: you, your neighbours, and that one floater who never seems to leave Ashwem.</p>
        <div className="map-scroll"><VillageMap /></div>
        <p className="fine map-hint">← swipe the map →</p>
      </section>

      <section id="how" aria-labelledby="how-h">
        <h2 id="how-h">Three ways to play</h2>
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
        <p className="fine">Kaju is fake. The prizes are not.</p>
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
          <p><b>Early plans turn the village into a timetable. Late ones turn it into luck.</b></p>
        </div>
        <EarlySlider />
      </section>

      <section id="avatar" className="avatar-section" aria-labelledby="avatar-h">
        <h2 id="avatar-h">Draw yourself (badly is fine)</h2>
        <p className="lede">A face, a blob, a cat: whatever rides the scooty is you. Save it and watch it putter around the map up top.</p>
        <AvatarMaker />
      </section>

      <section className="prizes" aria-labelledby="prizes-h">
        <div className="prizes-head">
          <div>
            <h2 id="prizes-h">Daily prizes, lots of them</h2>
            <p className="lede">Every evening, many small winners. Never one big one. Exact prizes to be revealed: we&apos;re still choosing between things you can eat and things you can keep.</p>
          </div>
          <img src="/art/prizes.webp" alt="" width={768} height={429} loading="lazy" />
        </div>
        <ul className="prize-list">
          {PRIZES.map(([name, line]) => (
            <li key={name}><b>{name}</b><span>{line}</span></li>
          ))}
        </ul>
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
        <p>Made in Mandrem, with one spare seat and a bag of cashews.</p>
        <p className="fine">Pillion · Edge City India 2026</p>
      </footer>
    </main>
  );
}
