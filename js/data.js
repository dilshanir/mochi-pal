// Game content and tuning. Edit numbers here to rebalance the game.

export const FURS = {
  peach:     { name: 'Peach',     base: '#FFB59E', light: '#FFE3D8', dark: '#E2846B', price: 0 },
  mint:      { name: 'Mint',      base: '#8FDFBF', light: '#D7F7EA', dark: '#52B98F', price: 0 },
  sky:       { name: 'Sky',       base: '#9CCDFF', light: '#DDEEFF', dark: '#619FE0', price: 0 },
  lilac:     { name: 'Lilac',     base: '#C6AEFF', light: '#ECE3FF', dark: '#937AE0', price: 0 },
  butter:    { name: 'Butter',    base: '#FFDC7A', light: '#FFF3CB', dark: '#DDAA36', price: 0 },
  bubblegum: { name: 'Bubblegum', base: '#FF8FC3', light: '#FFD5E9', dark: '#DE5A9A', price: 250, level: 5 },
  matcha:    { name: 'Matcha',    base: '#A9C97A', light: '#DFEDC6', dark: '#7A9C4C', price: 300, level: 7 },
  midnight:  { name: 'Midnight',  base: '#5F63AE', light: '#A3A7E3', dark: '#3C4086', price: 400, level: 9 },
  golden:    { name: 'Golden',    base: '#FFCB45', light: '#FFF0B3', dark: '#D69C00', price: 0, exclusive: 'Week 2 streak reward' },
};
export const STARTER_FURS = ['peach', 'mint', 'sky', 'lilac', 'butter'];

// hunger/fun = how much the need goes up. level = unlock level.
export const FOODS = {
  apple:      { emoji: '🍎', name: 'Apple',        hunger: 18, fun: 0,  price: 6,  level: 1 },
  banana:     { emoji: '🍌', name: 'Banana',       hunger: 20, fun: 0,  price: 6,  level: 1 },
  riceball:   { emoji: '🍙', name: 'Rice Ball',    hunger: 30, fun: 2,  price: 10, level: 1 },
  cupcake:    { emoji: '🧁', name: 'Cupcake',      hunger: 14, fun: 14, price: 14, level: 2 },
  mango:      { emoji: '🥭', name: 'Mango',        hunger: 24, fun: 5,  price: 10, level: 2 },
  coconut:    { emoji: '🥥', name: 'King Coconut', hunger: 16, fun: 6,  price: 8,  level: 3 },
  icecream:   { emoji: '🍦', name: 'Ice Cream',    hunger: 12, fun: 18, price: 15, level: 3 },
  chili:      { emoji: '🌶️', name: 'Chili',        hunger: 4,  fun: 12, price: 5,  level: 4, spicy: true },
  noodles:    { emoji: '🍜', name: 'Noodles',      hunger: 40, fun: 4,  price: 16, level: 4 },
  watermelon: { emoji: '🍉', name: 'Watermelon',   hunger: 22, fun: 8,  price: 12, level: 5 },
  pizza:      { emoji: '🍕', name: 'Pizza',        hunger: 45, fun: 8,  price: 22, level: 6 },
  cake:       { emoji: '🎂', name: 'Party Cake',   hunger: 35, fun: 25, price: 40, level: 10 },
};
export const STARTER_FOOD = { apple: 3, riceball: 2, cupcake: 1 };

export const ITEMS = [
  { id: 'party',  slot: 'hat',  name: 'Party Hat',     price: 80,  level: 1 },
  { id: 'bow',    slot: 'hat',  name: 'Big Bow',       price: 120, level: 2 },
  { id: 'beanie', slot: 'hat',  name: 'Cozy Beanie',   price: 180, level: 3 },
  { id: 'cap',    slot: 'hat',  name: 'Sun Cap',       price: 220, level: 5 },
  { id: 'chef',   slot: 'hat',  name: 'Chef Hat',      price: 300, level: 7 },
  { id: 'crown',  slot: 'hat',  name: 'Golden Crown',  price: 0,   level: 1, exclusive: '7-day streak reward' },
  { id: 'specs',  slot: 'face', name: 'Round Specs',   price: 90,  level: 2 },
  { id: 'shades', slot: 'face', name: 'Cool Shades',   price: 200, level: 4 },
  { id: 'hearts', slot: 'face', name: 'Heart Glasses', price: 350, level: 8 },
];

// Growth stages. The sprout on the head grows with each stage.
export const STAGES = [
  { min: 1,  name: 'Sprout',    scale: 0.80 },
  { min: 4,  name: 'Seedling',  scale: 0.87 },
  { min: 8,  name: 'Leafling',  scale: 0.93 },
  { min: 12, name: 'Budling',   scale: 0.97 },
  { min: 15, name: 'Blossom',   scale: 1.00 },
  { min: 25, name: 'Starbloom', scale: 1.03 },
];

// XP to go from `level` to `level + 1`. Quadratic so early levels fly by (first evolution on
// day 1 for a casual player) and later stages take weeks. Check with `npm run balance`.
export const xpNeed = level => Math.round(30 + 12 * level + 1.6 * level * level);

// Needs lose this many points per hour while awake.
export const DECAY = { hunger: 7, energy: 5, fun: 8, clean: 3.5 };
export const OFFLINE_FLOOR = 10;          // needs never drop below this while away
export const SLEEP_ONLINE_PER_SEC = 0.4;  // energy refill while tucked in, app open (~24/min)
export const SLEEP_OFFLINE_PER_HOUR = 45; // energy refill while tucked in, app closed
export const GIFT_COOLDOWN_MS = 3 * 60 * 60 * 1000;
export const GAME_ENERGY_COST = 8;
export const MIN_ENERGY_TO_PLAY = 12;

// Mini-game payouts. coinsPer = coins per point; xp is capped per day by DAILY_XP_CAP.game.
export const GAMES = {
  catch: { name: 'Snack Catch', emoji: '🧺', blurb: 'Slide Mochi to catch falling snacks. Dodge the spiky urchins.', coinsPer: 1, xpPer: 1, fun: 18 },
  hop:   { name: 'Vine Hop',    emoji: '🌿', blurb: 'Tap to hop through the gaps in the bamboo.',                 coinsPer: 3, xpPer: 2, fun: 18 },
};
export const ROUND_XP_MAX = 25;
export const DAILY_XP_CAP = { pet: 15, talk: 30, tickle: 20, game: 120, dance: 18 };
export const DANCE = { seconds: 7, fun: 15, energy: 4, xp: 6 };

// 7-day login calendar. Day 7 is special and rotates by cycle.
export const DAILY = [
  { coins: 20 },
  { coins: 30 },
  { coins: 20, food: { cupcake: 2 } },
  { coins: 50 },
  { coins: 40, food: { icecream: 2 } },
  { coins: 80 },
  { coins: 150, special: true },
];

// Daily quests: 3 are picked each day. mode 'max' = best single result counts.
export const QUESTS = [
  { id: 'feed',   text: 'Feed {pet} {n} times',              n: [3, 4, 5] },
  { id: 'pet',    text: 'Pet {pet} {n} times',               n: [15, 20, 30] },
  { id: 'tickle', text: "Tickle {pet}'s tummy {n} times",    n: [5, 8] },
  { id: 'bath',   text: 'Give {pet} a bubble bath',          n: [1] },
  { id: 'game',   text: 'Play {n} mini-games',               n: [2, 3] },
  { id: 'catch',  text: 'Catch {n} snacks in one game',      n: [15, 25], mode: 'max' },
  { id: 'hop',    text: 'Hop through {n} vines in one game', n: [5, 10], mode: 'max' },
  { id: 'talk',   text: 'Talk with {pet} {n} times',         n: [2, 3, 5] },
  { id: 'sleep',  text: 'Tuck {pet} into bed',               n: [1] },
  { id: 'dance',  text: 'Throw a dance party',               n: [1, 2] },
  { id: 'gift',   text: 'Open the gift box',                 n: [1] },
  { id: 'spend',  text: 'Spend {n} coins',                   n: [30, 60] },
];
export const QUEST_REWARD = { coins: 30, xp: 20 };
export const QUEST_BONUS = { coins: 60, xp: 30 };

// Lines Mochi says. {pet} = pet name, {you} = owner's name (or "friend").
export const LINES = {
  greet: ['Hi {you}!', 'Yay, {you} is here!', 'I saved a hug for you, {you}!', "Let's play, {you}!"],
  morning: ['Good morning, {you}! ☀', 'Did you sleep well?', 'Breakfast time?'],
  noon: ['Is it lunch time yet?', 'My tummy is humming…'],
  evening: ['The sky is turning pink!', 'Evening snack?'],
  night: ["It's getting late… *yawn*", 'Can we go to bed soon?', 'The stars are out!'],
  happy: ['I love you, {you}!', 'Best day ever!', 'Hehe, my sprout is wiggling!', "You're my favourite human!", 'I feel bouncy today!'],
  idle: [
    "Mochi are made of rice. I'm made of hugs.",
    'Can you hear me? Tap the mic and talk to me!',
    'If you water me with love, I grow a flower!',
    'Wanna play Snack Catch?',
    'I counted the clouds. There were seven.',
    'Pssst… the gift box sparkles sometimes.',
    'Tickle my tummy!',
  ],
  hungry: ["I'm sooo hungry…", 'Food? Please? 🥺', 'My tummy is growling!'],
  tired: ['So… sleepy…', "My eyes won't stay open…"],
  bored: ["I'm bored! Let's play!", 'Play with meee!'],
  dirty: ["I'm a bit stinky…", 'Bath time? I promise to sit still.'],
  full: ["I'm full!", 'No more, my tummy is round!'],
  annoyed: ['Hey! Too many pokes!', 'Hmph!', 'Gentle, please!'],
  wake: ['Huh? I was dreaming of mangoes…', "Five more minutes…"],
  missed: ['I missed you, {you}!', 'You came back! You came back!', 'I waited by the window for you!'],
  tickle: ['Hehehe! That tickles!', 'Stop, stop! Hehe!', 'My tummy is ticklish!'],
  pet: ['Mmm, that feels nice…', 'More pats please!', 'Purrr… wait, mochi don\'t purr. Or do we?'],
  bathStart: ['Scrub-a-dub! Rub me with the sponge.', 'Bubbles! Lots of bubbles please!'],
  bathClean: ["I'm already clean, but bubbles are fun!"],
  clean: ['Squeaky clean!', 'I smell like flowers now!', 'So fresh and so clean!'],
  spicy: ['HOT HOT HOT!', 'Spicyyyy! Water!', 'My face is on fire! Again!'],
  notSleepy: ["I'm not sleepy yet!", 'Bedtime? But I have so much energy!'],
  goodnight: ['Goodnight, {you}…', 'Sweet dreams…', 'Leave the stars on…'],
  rested: ["I'm fully charged!", 'Best nap ever!'],
  tooTired: ['Too tired to play… nap first?', 'My legs are sleepy…'],
  danceEnd: ['Again! Again!', 'I am the dancing queen of mochi!', 'Did you see my moves?'],
  gameEnd: ['That was so fun!', 'Let\'s play again later!', 'I\'m getting better at that!'],
  tutorial: ['Stroke me to pet me. Tap my tummy to tickle!', 'Tap the mic and talk. I\'ll copy you!'],
};

export const STREAK_LINES = ['Day {n} together! 🔥', "{n} days in a row! Don't break our streak!", "That's {n} days! You're the best!"];
