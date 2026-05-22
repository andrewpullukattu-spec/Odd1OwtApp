// ─── DECK DEFINITIONS ────────────────────────────────────────────────────────
// To add a new deck: copy one of the blocks below, give it a unique key,
// and fill in name/icon/desc/color/cls/questions.
// To add questions to an existing deck: just push strings into its `questions` array.
// The "all" deck is built automatically from all others — don't edit it directly.

const DECKS = {

  casual1: {
    name: "Casual 1",
    icon: "😊",
    desc: "Light-hearted & everyday",
    color: "#3b82f6",
    cls: "deck-casual1",
    questions: [
      "Who is the messiest?",
      "Who is the loudest?",
      "Who is the biggest gossip?",
      "Who is most likely to crash their car?",
      "Who is always on DND?",
      "Who has the best fashion?",
      "Who is short-tempered?",
      "Who is most likely to get cancelled?",
      "Who is most likely to become an influencer?",
      "Who is most likely to own 10 cats?",
      "Who is the most childish?",
      "Who is the most responsible?",
      "Who is most likely to elope?",
      "Who is the funniest?",
      "Who is the pickiest eater?",
      "Who is the smartest?",
      "Who is the most adventurous?",
      "Who is most likely to get married first?",
      "Who smells the best?",
      "Who is the most innocent?",
      "Who is the kindest?",
      "Who is the most mature?",
      "Who is most likely to be sports captain?",
      "Who is most likely to become a priest?",
      "Who is most likely to have 10 kids?",
    ]
  },

  casual2: {
    name: "Casual 2",
    icon: "🙂",
    desc: "More everyday vibes",
    color: "#14b8a6",
    cls: "deck-casual2",
    questions: [
      "Who is the most independent?",
      "Who is the biggest money saver?",
      "Who is composed?",
      "Who is the least controversial?",
      "Who is the best dancer?",
      "Who smells the best?",
      "Who would be the best lawyer?",
      "Who is the most brainrotted?",
      "Who is the zestiest?",
      "Who is the biggest girlypops?",
      "Who is the most forgetful?",
      "Who is the most manly?",
      "Who is the worst at sports?",
      "Who is the smartest?",
      "Who is the dumbest?",
      "Who is most likely to star in a movie?",
      "Who has read the most books?",
      "Who is the most sociable?",
      "Who is the most charitable?",
      "Who is the leader?",
      "Who is the best at cooking?",
      "Who is the most creative?",
      "Who is the most special?",
      "Who is the most odd?",
      "Who would you want to back you in a fight?",
    ]
  },

  spicy: {
    name: "Spicy 🌶️",
    icon: "🔥",
    desc: "Hot takes & drama",
    color: "#f97316",
    cls: "deck-spicy",
    questions: [
      "Biggest Manipulator",
      "Who is most likely to be pregnant?",
      "Who is the biggest attention seeker?",
      "Who secretly fancies someone in the group?",
      "Who has the most rizz?",
      "Who is the biggest player?",
      "Who has the most red flags?",
      "Who is most likely to ghost someone they like?",
      "Who would sell out their best friend for £50?",
      "Who has the darkest search history?",
      "Who is most likely to get with their mate's ex?",
      "Who is most likely to start a cult?",
      "Who is the most toxic?",
      "Who is the sneakiest?",
      "Who is most likely to slide into someone's DMs?",
      "Who would be the worst ex?",
      "Who would date someone twice their age?",
      "Who is most likely to go viral for the wrong reason?",
      "Who is the biggest hypocrite?",
      "Who lies the most?",
      "Who is most likely to get blackout drunk on a Tuesday?",
      "Who is most likely to go to jail?",
      "Who is most likely to swing the other way?",
      "Who is the most jealous?",
      "Who would throw their friend under the bus?",
    ]
  },

  deep: {
    name: "Deep Cut",
    icon: "💭",
    desc: "Thoughtful & meaningful",
    color: "#a855f7",
    cls: "deck-deep",
    questions: [
      "Who is most likely to change the world?",
      "Who will be most successful in 10 years?",
      "Who has the most potential they haven't used yet?",
      "Who is the most emotionally intelligent?",
      "Who works the hardest?",
      "Who is the most self-aware?",
      "Who is the most genuine person here?",
      "Who keeps the group together?",
      "Who do people underestimate the most?",
      "Who is the most resilient?",
      "Who gives the best advice?",
      "Who is the best listener?",
      "Who would make the best parent?",
      "Who is most likely to write a book?",
      "Who is the most underrated person in this group?",
      "Who is most likely to become a CEO?",
      "Who would be the best therapist?",
      "Who thinks before they speak the most?",
      "Who is the most creative?",
      "Who has grown the most as a person?",
      "Who has gone through the most and still smiles?",
      "Who cares the most about others?",
      "Who do you look up to?",
      "Who would you go to in a time of need?",
      "Who is most likely to make a difference in someone's life?",
    ]
  },

  random: {
    name: "Random",
    icon: "🎲",
    desc: "Weird & unexpected",
    color: "#ffb703",
    cls: "deck-random",
    questions: [
      "Who is most likely to get stuck in revolving doors?",
      "Who is most likely to burn a cookie?",
      "Who is most likely to have cereal with water?",
      "Who would survive against a gorilla?",
      "Who wouldn't kill a spider?",
      "Who is most likely to adopt a pet on impulse?",
      "Who is most likely to cross the road without looking?",
      "Who is most likely to disappear for 48 hours with no explanation?",
      "Who is most likely to wear odd socks?",
      "Who would forget their own phone number?",
      "Who would survive against a gorilla attack?",
      "Who is most likely to get hit on the head with a ball?",
      "Who is the most vibes?",
      "Who is most likely to become a wolf?",
      "Who is the deadest baller?",
      "Who would fall down the stairs?",
      "Who is the worst driver?",
      "Who would be the best barber/hairdresser?",
      "Who is most likely to become a millionaire?",
      "Who would lose a fight to a 10-year-old?",
      "Who is most likely to trip over nothing?",
      "Who would put salt in their tea by mistake?",
      "Who would argue with a satnav?",
      "Who would confuse their left and right in their 20s?",
    ]
  },

  // ── "All Decks" is built automatically below — do not add questions here ──
  all: {
    name: "All Decks",
    icon: "🃏",
    desc: "Everything mixed together",
    color: "#e5e5e5",
    cls: "deck-all",
    questions: []
  }

};

// Build the "all" deck by merging every other deck (deduplicates automatically)
DECKS.all.questions = [...new Set(
  Object.entries(DECKS)
    .filter(([key]) => key !== "all")
    .flatMap(([, deck]) => deck.questions)
)];
