// Calibrage de The Dog House : coefficient des tours gratuits et tables de coefficients par plafond de mise.
// Simule une fois des manches « brutes » (gains de lignes à l'échelle 1), puis résout chaque coefficient
// pour que le retour joueur soit de TARGET % (avant le réglage spinRtp de la console).
// Usage : npx tsx scripts/calibrate-doghouse.ts [manches, défaut 2 000 000]
import {
  FREE_SPIN_PAY_SCALE,
  SCATTER_PAY_X_BET,
  evaluateDogHouseSpin,
  payoutScale,
  rollFreeSpinsGrid,
  type StickyWild,
} from '../src/components/doghouse/dogHouseEngine';

const N = Number(process.argv[2]) || 2_000_000;
const TARGET = 0.9;
/** Coefficient des tours normaux sans plafond (×1 000) : on garde celui du moteur actuel */
const BASE_SCALE_UNCAPPED = 0.955;

type Mode = 'spin' | 'boost' | 'buy';
interface Sample {
  L: Float64Array; // gains de lignes du tour de base (échelle 1)
  F: Float64Array; // gains des tours gratuits (échelle 1, sans FREE_SPIN_PAY_SCALE)
  S: Float64Array; // paiement des pattes
  bonuses: number;
}

function sample(mode: Mode, n: number): Sample {
  const L = new Float64Array(n);
  const F = new Float64Array(n);
  const S = new Float64Array(n);
  const k = 1 / payoutScale(1);
  let bonuses = 0;
  for (let i = 0; i < n; i++) {
    const base = evaluateDogHouseSpin({ bet: 1, isBoost: mode === 'boost', forceScatters: mode === 'buy', extraScale: k });
    const s = base.triggersBonus ? SCATTER_PAY_X_BET : 0;
    L[i] = base.totalWin - s;
    S[i] = s;
    if (base.triggersBonus) {
      bonuses++;
      let left = rollFreeSpinsGrid().reduce((a, b) => a + b, 0);
      let sticky: StickyWild[] = [];
      let f = 0;
      while (left-- > 0) {
        const fs = evaluateDogHouseSpin({ bet: 1, isFreeSpin: true, stickyWilds: sticky, extraScale: k });
        sticky = fs.stickyWilds;
        f += fs.totalWin;
      }
      F[i] = f / FREE_SPIN_PAY_SCALE;
    }
  }
  return { L, F, S, bonuses };
}

/** Retour moyen (en × le coût) avec coefficient s, coefficient tours gratuits f, plafond x */
function rtp(d: Sample, x: number, s: number, f: number, cost: number): number {
  let sum = 0;
  for (let i = 0; i < d.L.length; i++) sum += Math.min(s * (d.L[i] + f * d.F[i]) + d.S[i], x);
  return sum / d.L.length / cost;
}

function solve(fn: (v: number) => number, target: number, lo = 0.05, hi = 4): number {
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Même interpolation que le moteur (sur le logarithme du multiplicateur max) */
function interp(t: [number, number][], x: number): number {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const r = (Math.log(x) - Math.log(t[i - 1][0])) / (Math.log(t[i][0]) - Math.log(t[i - 1][0]));
      return t[i - 1][1] + r * (t[i][1] - t[i - 1][1]);
    }
  }
  return t[t.length - 1][1];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

console.time('simulation');
const spin = sample('spin', N);
const boost = sample('boost', N);
const buy = sample('buy', Math.round(N / 10));
console.timeEnd('simulation');
console.log(`Bonus : 1 tour sur ${Math.round(N / spin.bonuses)} (Boost : 1 sur ${Math.round(N / boost.bonuses)})`);

const f = solve((v) => rtp(spin, 1000, BASE_SCALE_UNCAPPED, v, 1), TARGET);
console.log(`FREE_SPIN_PAY_SCALE = ${r3(f)}`);

const scaleTable: [number, number][] = [20, 30, 50, 100, 200, 300, 500, 1000].map((x) => [x, r3(solve((v) => rtp(spin, x, v, f, 1), TARGET))]);
console.log(`SCALE_TABLE = ${JSON.stringify(scaleTable)}`);

const boostTable: [number, number][] = [20, 29, 65, 110, 200, 500, 1000].map((x) => {
  const total = solve((v) => rtp(boost, x, v, f, 1.25), TARGET);
  return [x, r3(total / interp(scaleTable, x))];
});
console.log(`BOOST_SCALE_TABLE = ${JSON.stringify(boostTable)}`);

for (const [bet, x] of [[100, 1000], [200, 500], [400, 250], [500, 200]] as const) {
  const value = rtp(buy, x, interp(scaleTable, x), f, 1);
  console.log(`Achat · mise ${bet} (plafond ×${x}) : bonus ≈ ${value.toFixed(1)}× la mise → prix pour 75 % ≈ ×${Math.round(value / 0.75)}`);
}
