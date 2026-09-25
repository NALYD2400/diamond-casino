// Copie les moteurs de jeu (source unique : src/components/**) dans la
// fonction Edge « slot-round », qui fait les tirages côté serveur.
// Usage : npm run sync:edge
import { copyFileSync } from 'node:fs';

const files = [
  ['src/components/doghouse/dogHouseEngine.ts', 'supabase/functions/slot-round/dogHouseEngine.ts'],
  ['src/components/wanted/wantedEngine.ts', 'supabase/functions/slot-round/wantedEngine.ts'],
];

for (const [from, to] of files) {
  copyFileSync(from, to);
  console.log(`${from} -> ${to}`);
}
