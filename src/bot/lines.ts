// Bot copy for Pillion. Telegram messages, HTML parse mode (<b>, <i> only).
// Values passed in are already HTML-escaped. Voice: docs/copy.md.

type Fn<T> = (v: T) => string;

export const LINES: {
  match: Fn<{ pilot: string; hitcher: string; to: string; time: string }>[];
  earlyBird: Fn<{ name: string; to: string; time: string; hoursAhead: number }>[];
  floatStart: Fn<{ name: string; near: string }>[];
  rideDone: Fn<{ pilot: string; hitcher: string; pilotKaju: number; hitcherKaju: number }>[];
  rideWanted: Fn<{ name: string; from: string; to: string; time: string }>[];
  seatOffered: Fn<{ name: string; from: string; to: string; time: string }>[];
  floatThanks: Fn<{ minutes: number; kaju: number }>[];
  lateCancel: Fn<{ name: string }>[];
  dailyIntro: Fn<{ riders: number; rides: number }>[];
  morning: Fn<{}>[];
} = {
  match: [
    ({ pilot, hitcher, to, time }) =>
      `Match made! <b>${pilot}</b> (pilot) + <b>${hitcher}</b> (hitcher) → ${to}, ${time}. Helmets on, kaju off the house. 🥜`,
    ({ pilot, hitcher, to, time }) =>
      `<b>${pilot}</b> has the scooty, <b>${hitcher}</b> has the time. ${to} at ${time}. One less lonely back seat in Mandrem.`,
    ({ pilot, hitcher, to, time }) =>
      `Two plans just crossed: <b>${pilot}</b> is carrying <b>${hitcher}</b> to ${to} at ${time}. The lane dogs will barely look up.`,
    ({ pilot, hitcher, to, time }) =>
      `<b>${hitcher}</b>, your chariot is <b>${pilot}</b>. ${to}, ${time}. Hold on, chat or don't, earn kaju either way.`,
    ({ pilot, hitcher, to, time }) =>
      `A seat was spare, a hitcher was there. <b>${pilot}</b> + <b>${hitcher}</b> → ${to}, ${time}. 🛵`,
    ({ pilot, hitcher, to, time }) =>
      `Kaju alert: <b>${pilot}</b> just adopted <b>${hitcher}</b> for the ${time} run to ${to}. Short-term, no paperwork.`,
    ({ pilot, hitcher, to, time }) =>
      `<b>${pilot}</b> and <b>${hitcher}</b>, ${to}, ${time}. Susegad in the saddle, cashews in the jar.`,
    ({ pilot, hitcher, to, time }) =>
      `Boop. <b>${hitcher}</b> is on the back of <b>${pilot}</b>'s scooty to ${to} at ${time}. Village timetable: working.`,
  ],

  earlyBird: [
    ({ name, to, time, hoursAhead }) =>
      `Early bird! <b>${name}</b> posted a ${to} run for ${time}, ${hoursAhead}h ahead. +15 kaju and our undying admiration.`,
    ({ name, to, time, hoursAhead }) =>
      `<b>${name}</b> knows where they'll be at ${time}: ${to}. Told us ${hoursAhead} hours early. Prophets get paid. 🥜`,
    ({ name, to, time, hoursAhead }) =>
      `${hoursAhead} hours ahead, <b>${name}</b> said "${to}, ${time}." Now the bot has all day to find a match. Bless.`,
    ({ name, to, time, hoursAhead }) =>
      `While the dogs were still napping, <b>${name}</b> planned ${to} for ${time}. ${hoursAhead}h of head start, +15 kaju.`,
    ({ name, to, time, hoursAhead }) =>
      `Plan posted, kaju toasted: <b>${name}</b> → ${to} at ${time}, ${hoursAhead}h out. Going that way? Say so now.`,
    ({ name, to, time, hoursAhead }) =>
      `<b>${name}</b> is off to ${to} at ${time} and told us ${hoursAhead} hours early. The village timetable grows by one line.`,
  ],

  floatStart: [
    ({ name, near }) =>
      `Floater spotted near ${near}! <b>${name}</b> has a free seat and zero plans. Need a ride? Reply /ride. +20 kaju an hour. Living the dream.`,
    ({ name, near }) =>
      `<b>${name}</b> is floating near ${near}. Nowhere to be, a scooty to share. Aimlessness, donated.`,
    ({ name, near }) =>
      `A hero rises (slowly) near ${near}: <b>${name}</b> is floating. Need a lift? ${name} is the nearest yes. 🛵`,
    ({ name, near }) =>
      `<b>${name}</b> switched on live location near ${near} and lay down. Susegad, but make it useful. Hitchers, ping away.`,
    ({ name, near }) =>
      `Float on, <b>${name}</b>. Near ${near}, seat free, plans none. Every hour on the sand is 20 kaju in the jar.`,
    ({ name, near }) =>
      `The lane dogs have company: <b>${name}</b> is floating near ${near}. Ride needed? ${name} will putter over.`,
  ],

  rideDone: [
    ({ pilot, hitcher, pilotKaju, hitcherKaju }) =>
      `Ride done, kaju spun: <b>${pilot}</b> +${pilotKaju}, <b>${hitcher}</b> +${hitcherKaju}. Helmets off, high fives on.`,
    ({ pilot, hitcher, pilotKaju, hitcherKaju }) =>
      `<b>${pilot}</b> carried, <b>${hitcher}</b> tagged along. +${pilotKaju} and +${hitcherKaju} kaju. One more sunset reached on time. 🌅`,
    ({ pilot, hitcher, pilotKaju, hitcherKaju }) =>
      `Arrived! <b>${pilot}</b> brought the wheels (+${pilotKaju}), <b>${hitcher}</b> brought the company (+${hitcherKaju}). Both respect.`,
    ({ pilot, hitcher, pilotKaju, hitcherKaju }) =>
      `Two villagers, one scooty, zero drama. <b>${pilot}</b> +${pilotKaju}, <b>${hitcher}</b> +${hitcherKaju}. Cashews all round. 🥜`,
    ({ pilot, hitcher, pilotKaju, hitcherKaju }) =>
      `<b>${pilot}</b> and <b>${hitcher}</b> made it. The jar says +${pilotKaju} and +${hitcherKaju}. The jar is never wrong.`,
    ({ pilot, hitcher, pilotKaju, hitcherKaju }) =>
      `That's a wrap: <b>${pilot}</b> +${pilotKaju} kaju, <b>${hitcher}</b> +${hitcherKaju}. Who's next on the back seat?`,
  ],

  rideWanted: [
    ({ name, from, to, time }) =>
      `<b>${name}</b> wants a ride from ${from} to ${to} around ${time}. Got a spare seat? Small favour, big karma, +30 kaju.`,
    ({ name, from, to, time }) =>
      `Psst. <b>${name}</b> is at ${from}, dreaming of ${to} at ${time}. Your back seat could make that dream come true.`,
    ({ name, from, to, time }) =>
      `Ride wanted: ${from} → ${to}, ${time}. <b>${name}</b> has the time, you have the scooty. Sounds like a match. 🛵`,
    ({ name, from, to, time }) =>
      `<b>${name}</b> needs ${from} to ${to} at ${time}. You're nearby, you're lovely, you're one tap from +30 kaju.`,
    ({ name, from, to, time }) =>
      `A hitcher calls! <b>${name}</b>, ${from} to ${to}, ${time}. Take them and the cashews are yours. 🥜`,
    ({ name, from, to, time }) =>
      `Somebody at ${from} wants ${to} at ${time}. That somebody is <b>${name}</b>. Tap below if your scooty's up for it.`,
  ],

  seatOffered: [
    ({ name, from, to, time }) =>
      `<b>${name}</b> is riding from ${from} to ${to} at ${time} with a seat to spare. Going that way? Hop on.`,
    ({ name, from, to, time }) =>
      `A seat with your name on it: <b>${name}</b>, ${from} → ${to}, ${time}. Helmet on, hold on, +10 kaju. 🛵`,
    ({ name, from, to, time }) =>
      `Good news from ${from}: <b>${name}</b> is heading to ${to} at ${time} and the back seat is lonely. Fix that?`,
    ({ name, from, to, time }) =>
      `<b>${name}</b> is scooting ${from} to ${to} at ${time}. One free seat. First tap gets it, the chat is free.`,
    ({ name, from, to, time }) =>
      `Wheels, meet feet. <b>${name}</b> leaves ${from} for ${to} at ${time}. Want the pillion?`,
    ({ name, from, to, time }) =>
      `<b>${name}</b>, ${from} → ${to}, ${time}. Seats: 1. Sunset: probable. Kaju: +10. Tap below.`,
  ],

  floatThanks: [
    ({ minutes, kaju }) =>
      `Float over. ${minutes} minutes of doing beautifully little, +${kaju} kaju. The village thanks you. The sand thanks you.`,
    ({ minutes, kaju }) =>
      `You floated ${minutes} minutes and earned ${kaju} kaju doing it. Nap on the beach, get rich. 🥜`,
    ({ minutes, kaju }) =>
      `${minutes} minutes floated, ${kaju} kaju toted. Susegad has never paid so well.`,
    ({ minutes, kaju }) =>
      `Thanks for floating, ${minutes} min. +${kaju} kaju in the jar. Even the lane dogs are impressed by your stillness.`,
    ({ minutes, kaju }) =>
      `Live location off, ${kaju} kaju on. ${minutes} minutes of being the nearest answer. Come back whenever.`,
  ],

  lateCancel: [
    ({ name }) =>
      `<b>${name}</b> had to cancel, sorry. Life happens. Hang tight, we're asking the village for another seat.`,
    ({ name }) =>
      `Change of plans: <b>${name}</b> can't make it. Not your fault, not the end. Finding you a new match now.`,
    ({ name }) =>
      `<b>${name}</b> dropped out at the last minute. Breathe, look at a sunset, we'll ping pilots nearby. 🌅`,
    ({ name }) =>
      `Bad news, small: <b>${name}</b> cancelled. Good news, bigger: the village has more scooties. Stay put, we're on it.`,
    ({ name }) =>
      `<b>${name}</b> couldn't come after all. No hard feelings, just a scooty-shaped gap we're already filling.`,
  ],

  dailyIntro: [
    ({ riders, rides }) =>
      `9pm, jar's open! ${riders} villagers, ${rides} rides, a lot of cashews. Many small winners, never one big one. 🥜`,
    ({ riders, rides }) =>
      `Prize o'clock. Today: ${rides} rides, ${riders} riders, countless helmets. Here's who the kaju loved most.`,
    ({ riders, rides }) =>
      `The sun has set, the scooties rest. ${riders} people shared ${rides} rides today. Time to hand out the kaju.`,
    ({ riders, rides }) =>
      `Day done! ${rides} rides, ${riders} riders, and the lane dogs barely stirred. Tonight's winners, in no particular order:`,
    ({ riders, rides }) =>
      `Kaju count: ${riders} riders made ${rides} rides. Susegad was shared, sunsets were reached. Prizes below.`,
  ],

  morning: [
    () =>
      `Morning, Mandrem. Where are you off to today? Tell the bot now and it has all day to find your match. Early plans earn +15.`,
    () =>
      `The dogs are still asleep in the lane. Post your plan before they wake up and you're the early bird. 🥜`,
    () =>
      `Coffee first, plans second, kaju third. Arambol at 4? Pharmacy at noon? Say it now, ride it later.`,
    () =>
      `Rise and ride! Early plans turn the village into a timetable. Late ones turn it into luck. Post yours.`,
    () =>
      `Good morning. Got a scooty and somewhere to be? Got no scooty and somewhere to be? Either way, tell the bot.`,
    () =>
      `Sun's up, scooties are cold. Post today's rides early: prophets get paid (+15), and nobody's late to the sunset. 🌅`,
  ],
};

/** Pick one line. With a seed the choice is deterministic (seed % length); otherwise random. */
export function pick<T>(fns: Fn<T>[], v: T, seed?: number): string {
  if (fns.length === 0) return "";
  const i =
    seed === undefined
      ? Math.floor(Math.random() * fns.length)
      : Math.abs(Math.trunc(seed)) % fns.length;
  return fns[i](v);
}
