// Audit de rentabilité : ce que rend réellement chaque mode des machines à sous,
// avec les réglages passés en argument (mêmes moteurs que le serveur).
import { boostPayoutScale, maxBuyBet as dogMaxBuyBet, playDogHouseRound } from '../src/components/doghouse/dogHouseEngine';
import { capPayoutScale, maxBuyBet as wantedMaxBuyBet, playWantedRound, type WantedBonus } from '../src/components/wanted/wantedEngine';
import { spinScale } from '../src/lib/gamesConfig';

// Usage : npx tsx scripts/audit-house-edge.ts [tours] [RTP tours normaux] [prix achat Dog House] [prix GTR] [prix Duel] [prix DMH]
const N = Number(process.argv[2]) || 40000;
const SPIN_RTP = Number(process.argv[3]) || 90;
const DOG = { buyPrice: Number(process.argv[4]) || 150, maxPayout: 10_000_000, spinRtp: SPIN_RTP };
const WANTED = {
  buyPrices: { gtr: Number(process.argv[5]) || 80, duel: Number(process.argv[6]) || 134, dmh: Number(process.argv[7]) || 219 } as Record<WantedBonus, number>,
  maxPayout: 1_000_000,
  spinRtp: SPIN_RTP,
};

function run(label: string, play: () => { cost: number; win: number }, n = N) {
  let cost = 0;
  let win = 0;
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const r = play();
    cost += r.cost;
    win += r.win;
    if (r.win > r.cost) wins++;
  }
  console.log(`${label.padEnd(44)} retour ${((win / cost) * 100).toFixed(1).padStart(6)} %   gagnant ${((wins / n) * 100).toFixed(1).padStart(5)} % des fois`);
}

console.log(`RTP tours normaux réglé : ${SPIN_RTP} %
`);
console.log(`The Dog House (achat ×${DOG.buyPrice}, mise max achat ${dogMaxBuyBet(DOG.buyPrice, DOG.maxPayout)})`);
for (const bet of [20, 100, 200, 1000, 5000]) {
  run(`  tour normal · mise ${bet}`, () => {
    const r = playDogHouseRound({ bet, mode: 'spin', buyPriceX: DOG.buyPrice, maxPayout: DOG.maxPayout, extraScale: spinScale('doghouse', DOG) });
    return { cost: r.cost, win: r.totalWin };
  });
  run(`  boost · mise ${bet}`, () => {
    const r = playDogHouseRound({ bet, mode: 'boost', buyPriceX: DOG.buyPrice, maxPayout: DOG.maxPayout, extraScale: boostPayoutScale(bet) * spinScale('doghouse', DOG) });
    return { cost: r.cost, win: r.totalWin };
  });
}
for (const bet of [20, 100, 200, 400]) {
  if (bet > dogMaxBuyBet(DOG.buyPrice, DOG.maxPayout)) continue;
  run(`  achat bonus · mise ${bet} (coût ${bet * DOG.buyPrice})`, () => {
    const r = playDogHouseRound({ bet, mode: 'buy', buyPriceX: DOG.buyPrice, maxPayout: DOG.maxPayout });
    return { cost: r.cost, win: r.totalWin };
  }, Math.min(N, 8000));
}

console.log(`\nWanted (achats ×${WANTED.buyPrices.gtr} / ×${WANTED.buyPrices.duel} / ×${WANTED.buyPrices.dmh})`);
for (const bet of [10, 100, 500, 2500]) {
  run(`  tour normal · mise ${bet}`, () => {
    const r = playWantedRound({ bet, maxPayout: WANTED.maxPayout, extraScale: capPayoutScale(bet) * spinScale('wanted', WANTED) });
    return { cost: r.cost, win: r.totalWin };
  });
}
for (const buy of ['gtr', 'duel', 'dmh'] as WantedBonus[]) {
  const maxBet = wantedMaxBuyBet(WANTED.buyPrices[buy], WANTED.maxPayout, buy);
  for (const bet of [10, 100, Math.min(500, maxBet)]) {
    run(`  achat ${buy} · mise ${bet} (coût ${bet * WANTED.buyPrices[buy]})`, () => {
      const r = playWantedRound({ bet, buy, buyPrices: WANTED.buyPrices, maxPayout: WANTED.maxPayout });
      return { cost: r.cost, win: r.totalWin };
    }, Math.min(N, 6000));
  }
}
