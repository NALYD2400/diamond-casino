// Contrôle que le RTP affiché (SLOT_RTP) correspond aux moteurs de tirage.
// Ces machines sont très volatiles (gros gains rares) : une simulation isolée
// varie de ±2 points. On simule donc par lots et on juge avec la marge d'erreur.
// À relancer après toute modification d'un moteur.
// Usage : npm run check:rtp [nombre de lots de 200 000 tours, défaut 15]
import { simulateDogHouse } from '../src/components/doghouse/dogHouseEngine';
import { simulateWanted } from '../src/components/wanted/wantedEngine';
import { SLOT_RTP } from '../src/lib/gamesConfig';

const BATCH = 200_000;
const batches = Number(process.argv[2]) || 15;

function measure(run: (spins: number) => number) {
  const values = Array.from({ length: batches }, () => run(BATCH));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return { mean, se: Math.sqrt(variance / values.length) };
}

const rows = [
  { name: 'The Dog House', shown: SLOT_RTP.doghouse, ...measure((n) => simulateDogHouse(n).rtp) },
  { name: 'Wanted Dead or a Wild', shown: SLOT_RTP.wanted, ...measure((n) => simulateWanted(n).rtp) },
];

let failed = false;
for (const r of rows) {
  // Hors de 3 erreurs-types : ce n'est plus le hasard
  const ok = Math.abs(r.mean - r.shown) <= 3 * r.se;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'OK   ' : 'ECART'} ${r.name}: affiché ${r.shown} %, mesuré ${r.mean.toFixed(2)} % ± ${(3 * r.se).toFixed(2)} (${batches * BATCH} tours)`,
  );
}
if (failed) {
  console.error('\nMettre à jour SLOT_RTP dans src/lib/gamesConfig.ts avec la valeur mesurée.');
  process.exit(1);
}
