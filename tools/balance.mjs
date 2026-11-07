// Economy check: how long does growth take for different kinds of players?
// Usage: npm run balance      Reads the real numbers from js/data.js, so it stays honest.
//
// A "day" below is a guess at what each player type does. Edit PLAYERS to match what you
// see in real play. Rule of thumb for a daily-habit game: the first evolution should land
// on day 1–2 for a casual player (the hook), Blossom within ~2–3 weeks, Starbloom ~1–2 months.
import { STAGES, xpNeed, QUEST_REWARD, QUEST_BONUS, DAILY, DAILY_XP_CAP, GAMES, ROUND_XP_MAX, DANCE, ITEMS, FURS } from '../js/data.js';

const PLAYERS = {
  light:  { feeds: 2, quests: 1, bonus: false, pet: 8,  tickle: 4,  talk: 0,  rounds: { catch: 1, hop: 0 }, dance: 0, bath: 0, gifts: 1 },
  casual: { feeds: 4, quests: 3, bonus: true,  pet: 15, tickle: 10, talk: 6,  rounds: { catch: 2, hop: 2 }, dance: 1, bath: 1, gifts: 2 },
  heavy:  { feeds: 6, quests: 3, bonus: true,  pet: 15, tickle: 20, talk: 30, rounds: { catch: 4, hop: 4 }, dance: 3, bath: 1, gifts: 4 },
};
const AVG_SCORE = { catch: 22, hop: 9 }; // typical round scores

function dayXP(pl) {
  let xp = 10;                                                     // daily login
  xp += pl.quests * QUEST_REWARD.xp + (pl.bonus ? QUEST_BONUS.xp : 0);
  xp += pl.feeds * 4;
  xp += Math.min(pl.pet, DAILY_XP_CAP.pet) + Math.min(pl.tickle * 2, DAILY_XP_CAP.tickle) + Math.min(pl.talk * 3, DAILY_XP_CAP.talk);
  let game = 0;
  for (const [k, n] of Object.entries(pl.rounds)) game += n * Math.min(ROUND_XP_MAX, AVG_SCORE[k] * GAMES[k].xpPer);
  xp += Math.min(game, DAILY_XP_CAP.game);
  xp += Math.min(pl.dance * DANCE.xp, DAILY_XP_CAP.dance) + pl.bath * 8;
  return xp;
}
function dayCoins(pl, day) {
  let c = DAILY[(day - 1) % 7].coins + pl.quests * QUEST_REWARD.coins + (pl.bonus ? QUEST_BONUS.coins : 0);
  for (const [k, n] of Object.entries(pl.rounds)) c += n * AVG_SCORE[k] * GAMES[k].coinsPer;
  c += pl.gifts * 27;                  // gift box average (15–40 coins, 10% jackpot of 75)
  c -= Math.max(0, pl.feeds - 2) * 10; // snacks bought once the free basket runs out
  return c;
}

const xpToLevel = lvl => { let t = 0; for (let l = 1; l < lvl; l++) t += xpNeed(l); return t; };
console.log('\nDays to reach each growth stage\n');
console.log('stage'.padEnd(12) + 'level'.padEnd(7) + 'total XP'.padEnd(10) + Object.keys(PLAYERS).map(k => k.padEnd(9)).join(''));
for (const st of STAGES) {
  const need = xpToLevel(st.min);
  const cells = Object.values(PLAYERS).map(pl => (need === 0 ? 'start' : `day ${Math.ceil(need / dayXP(pl))}`).padEnd(9));
  console.log(st.name.padEnd(12) + String(st.min).padEnd(7) + String(need).padEnd(10) + cells.join(''));
}
console.log('\nXP per day: ' + Object.entries(PLAYERS).map(([k, pl]) => `${k} ${dayXP(pl)}`).join(', '));
const week = pl => Array.from({ length: 7 }, (_, i) => dayCoins(pl, i + 1)).reduce((a, b) => a + b, 0);
console.log('Coins per week: ' + Object.entries(PLAYERS).map(([k, pl]) => `${k} ${week(pl)}`).join(', '));
const shop = ITEMS.filter(i => !i.exclusive).reduce((a, i) => a + i.price, 0) + Object.values(FURS).reduce((a, f) => a + (f.exclusive ? 0 : f.price), 0);
console.log(`Whole shop costs ${shop} coins → casual player buys everything in ~${Math.ceil(shop / week(PLAYERS.casual))} weeks.\n`);
