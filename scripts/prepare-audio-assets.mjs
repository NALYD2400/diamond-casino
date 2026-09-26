import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const TEMP = path.join(ROOT, 'temp_audio');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function prepare() {
  console.log('=== PREPARING REAL CASINO AUDIO ASSETS ===');

  const wheelDir = path.join(ROOT, 'public', 'sounds', 'wheel');
  const minesDir = path.join(ROOT, 'public', 'sounds', 'mines');
  const slotsDir = path.join(ROOT, 'public', 'sounds', 'slots');
  const wantedDir = path.join(ROOT, 'public', 'sounds', 'wanted');
  const doghouseDir = path.join(ROOT, 'public', 'sounds', 'doghouse');

  [wheelDir, minesDir, slotsDir, wantedDir, doghouseDir].forEach(ensureDir);

  // 1. WHEEL OF FORTUNE ASSETS
  console.log('\n--- 1. Wheel of Fortune Assets ---');
  // Mechanical spin whoosh (1.2s spinning whirr with fade out)
  run(`ffmpeg -i "${path.join(TEMP, 'scifi', 'Audio', 'engineCircular_001.ogg')}" -t 1.2 -af "afade=t=out:st=0.8:d=0.4,volume=0.9" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wheelDir, 'spin.mp3')}"`);
  
  // Real ratchet / peg ticks
  run(`ffmpeg -i "${path.join(TEMP, 'interface', 'Audio', 'tick_001.ogg')}" -af "volume=1.4" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wheelDir, 'tick-1.mp3')}"`);
  run(`ffmpeg -i "${path.join(TEMP, 'interface', 'Audio', 'tick_002.ogg')}" -af "volume=1.4" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wheelDir, 'tick-2.mp3')}"`);
  run(`ffmpeg -i "${path.join(TEMP, 'interface', 'Audio', 'tick_004.ogg')}" -af "volume=1.2" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wheelDir, 'tick-3.mp3')}"`);

  // Mechanical flapper stop / latch
  run(`ffmpeg -i "${path.join(TEMP, 'impact', 'Audio', 'impactWood_heavy_000.ogg')}" -i "${path.join(TEMP, 'rpg', 'Audio', 'metalLatch.ogg')}" -filter_complex "[0:a]volume=1.2[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=first[out]" -map "[out]" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wheelDir, 'stop.mp3')}"`);

  // Suspense crawl drone
  run(`ffmpeg -i "${path.join(TEMP, 'scifi', 'Audio', 'forceField_000.ogg')}" -t 3.5 -af "lowpass=f=450,afade=t=in:st=0:d=0.3,afade=t=out:st=2.8:d=0.7,volume=0.7" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wheelDir, 'suspense.mp3')}"`);

  // Jackpot Bell
  run(`ffmpeg -i "${path.join(TEMP, 'impact', 'Audio', 'impactBell_heavy_001.ogg')}" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wheelDir, 'bell.mp3')}"`);

  // Copy shared coins & win fanfares
  ['coin-1.mp3', 'coin-2.mp3', 'coin-3.mp3', 'coins-shower.mp3', 'win-small.mp3', 'win-medium.mp3', 'win-big.mp3'].forEach(f => {
    fs.copyFileSync(path.join(wantedDir, f), path.join(wheelDir, f));
  });

  // 2. MINES ASSETS
  console.log('\n--- 2. Mines Game Assets ---');
  // Card deal on felt (game start)
  run(`ffmpeg -i "${path.join(TEMP, 'casino', 'Audio', 'card-slide-1.ogg')}" -af "volume=1.4" -codec:a libmp3lame -qscale:a 2 -y "${path.join(minesDir, 'deal.mp3')}"`);
  
  // Chip click / tap (tile click)
  run(`ffmpeg -i "${path.join(TEMP, 'casino', 'Audio', 'chip-lay-1.ogg')}" -af "volume=1.5" -codec:a libmp3lame -qscale:a 2 -y "${path.join(minesDir, 'tile-click.mp3')}"`);
  
  // Tile hover tick
  run(`ffmpeg -i "${path.join(TEMP, 'interface', 'Audio', 'tick_001.ogg')}" -af "volume=0.35" -codec:a libmp3lame -qscale:a 2 -y "${path.join(minesDir, 'tile-hover.mp3')}"`);

  // Gem crystal chimes (6 real ascending musical crystal rings)
  for (let i = 1; i <= 6; i++) {
    const src = path.join(TEMP, 'interface', 'Audio', `glass_00${i}.ogg`);
    run(`ffmpeg -i "${src}" -af "volume=1.3" -codec:a libmp3lame -qscale:a 2 -y "${path.join(minesDir, `gem-${i}.mp3`)}"`);
  }

  // Realistic bomb explosion (deep sub-bass thump + visceral fiery crunch)
  run(`ffmpeg -i "${path.join(TEMP, 'scifi', 'Audio', 'explosionCrunch_000.ogg')}" -i "${path.join(TEMP, 'scifi', 'Audio', 'lowFrequency_explosion_000.ogg')}" -filter_complex "[0:a]volume=1.3[a0];[1:a]volume=1.2[a1];[a0][a1]amix=inputs=2:duration=first[out]" -map "[out]" -codec:a libmp3lame -qscale:a 2 -y "${path.join(minesDir, 'explosion.mp3')}"`);

  // Cashout (cascading coins + win fanfare)
  run(`ffmpeg -i "${path.join(TEMP, 'rpg', 'Audio', 'handleCoins.ogg')}" -i "${path.join(TEMP, 'jingles', 'Audio', 'Hit jingles', 'jingles_HIT07.ogg')}" -filter_complex "[0:a]volume=1.2,adelay=100|100[a0];[1:a]volume=0.9[a1];[a0][a1]amix=inputs=2:duration=first[out]" -map "[out]" -codec:a libmp3lame -qscale:a 2 -y "${path.join(minesDir, 'cashout.mp3')}"`);

  // Copy shared coins & wins
  ['coin-1.mp3', 'coin-2.mp3', 'coin-3.mp3', 'coins-shower.mp3', 'win-small.mp3', 'win-medium.mp3', 'win-big.mp3'].forEach(f => {
    fs.copyFileSync(path.join(wantedDir, f), path.join(minesDir, f));
  });

  // 3. SLOTS ENGINE ASSETS
  console.log('\n--- 3. Slots Common Assets ---');
  // Arcade / slot button mechanical click
  run(`ffmpeg -i "${path.join(TEMP, 'rpg', 'Audio', 'metalClick.ogg')}" -af "volume=1.1" -codec:a libmp3lame -qscale:a 2 -y "${path.join(slotsDir, 'button-click.mp3')}"`);
  
  // Real slot reel spinning hum
  run(`ffmpeg -i "${path.join(TEMP, 'scifi', 'Audio', 'engineCircular_000.ogg')}" -t 1.0 -af "volume=0.8,afade=t=in:st=0:d=0.1,afade=t=out:st=0.8:d=0.2" -codec:a libmp3lame -qscale:a 2 -y "${path.join(slotsDir, 'reel-spin.mp3')}"`);

  // Heavy mechanical reel stops (reels 1-5 with slight natural pitch progression)
  for (let r = 1; r <= 5; r++) {
    const pitch = 0.95 + r * 0.04;
    run(`ffmpeg -i "${path.join(TEMP, 'impact', 'Audio', 'impactWood_heavy_000.ogg')}" -af "asetrate=44100*${pitch.toFixed(3)},aresample=44100,volume=1.3" -codec:a libmp3lame -qscale:a 2 -y "${path.join(slotsDir, `reel-stop-${r}.mp3`)}"`);
  }
  // Generic reel stop fallback
  fs.copyFileSync(path.join(slotsDir, 'reel-stop-1.mp3'), path.join(slotsDir, 'reel-stop.mp3'));

  // Scatter landing golden bell
  run(`ffmpeg -i "${path.join(TEMP, 'impact', 'Audio', 'impactBell_heavy_000.ogg')}" -af "volume=1.2" -codec:a libmp3lame -qscale:a 2 -y "${path.join(slotsDir, 'scatter-bell.mp3')}"`);

  // Anticipation rising roll
  run(`ffmpeg -i "${path.join(TEMP, 'scifi', 'Audio', 'forceField_001.ogg')}" -t 1.5 -af "lowpass=f=800,afade=t=out:st=1.1:d=0.4,volume=0.8" -codec:a libmp3lame -qscale:a 2 -y "${path.join(slotsDir, 'anticipation.mp3')}"`);

  // Copy shared coins & wins
  ['coin-1.mp3', 'coin-2.mp3', 'coin-3.mp3', 'coins-shower.mp3', 'win-small.mp3', 'win-medium.mp3', 'win-big.mp3', 'bonus-trigger.mp3', 'bonus-end.mp3'].forEach(f => {
    fs.copyFileSync(path.join(wantedDir, f), path.join(slotsDir, f));
  });

  // 4. WANTED DEAD OR A WILD EXTRA REAL ASSETS
  console.log('\n--- 4. Wanted Western Assets ---');
  // Real western revolver gunshot (sharp crack + punch + blast tail)
  run(`ffmpeg -i "${path.join(TEMP, 'scifi', 'Audio', 'explosionCrunch_004.ogg')}" -i "${path.join(TEMP, 'impact', 'Audio', 'impactPunch_heavy_000.ogg')}" -filter_complex "[0:a]volume=1.2,atrim=0:0.5[a0];[1:a]volume=1.4[a1];[a0][a1]amix=inputs=2:duration=first[out]" -map "[out]" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wantedDir, 'gunshot.mp3')}"`);
  
  // Real metallic ricochet
  run(`ffmpeg -i "${path.join(TEMP, 'impact', 'Audio', 'impactMetal_light_002.ogg')}" -af "asetrate=44100*1.4,aresample=44100,volume=1.3" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wantedDir, 'ricochet.mp3')}"`);

  // Real duel sword/metal clash
  run(`ffmpeg -i "${path.join(TEMP, 'impact', 'Audio', 'impactMetal_heavy_001.ogg')}" -af "volume=1.3" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wantedDir, 'duel.mp3')}"`);

  // Real western church tolling bell
  run(`ffmpeg -i "${path.join(TEMP, 'impact', 'Audio', 'impactBell_heavy_000.ogg')}" -af "asetrate=44100*0.75,aresample=44100,volume=1.4" -codec:a libmp3lame -qscale:a 2 -y "${path.join(wantedDir, 'church-bell.mp3')}"`);

  // 5. DOG HOUSE EXTRA REAL ASSETS
  console.log('\n--- 5. Dog House Extra Assets ---');
  // Ante Bet toggle switch
  run(`ffmpeg -i "${path.join(TEMP, 'ui', 'Audio', 'switch12.ogg')}" -af "volume=1.3" -codec:a libmp3lame -qscale:a 2 -y "${path.join(doghouseDir, 'switch.mp3')}"`);
  
  // Sticky Wild heavy wooden slam
  run(`ffmpeg -i "${path.join(TEMP, 'impact', 'Audio', 'impactWood_heavy_002.ogg')}" -af "volume=1.4" -codec:a libmp3lame -qscale:a 2 -y "${path.join(doghouseDir, 'slam.mp3')}"`);

  // WRITE CREDITS.txt for wheel, mines, slots
  fs.writeFileSync(path.join(wheelDir, 'CREDITS.txt'), `Sons de la Roue de la Fortune (The Diamond Casino) — CC0 (domaine public).

- Rotation & Tics mécaniques : "Interface Sounds" & "Sci-Fi Sounds" par Kenney — https://kenney.nl
- Cloche & Verrou : "Impact Sounds" & "RPG Audio" par Kenney
- Jingles & Pièces : "Music Jingles" & "Casino Audio" par Kenney
Convertis en MP3 avec ffmpeg.
`);

  fs.writeFileSync(path.join(minesDir, 'CREDITS.txt'), `Sons du jeu Mines (The Diamond Casino) — CC0 (domaine public).

- Distribution (deal) & Jetons : "Casino Audio" par Kenney — https://kenney.nl/assets/casino-audio
- Cristaux / Diamants : "Interface Sounds" (glass_*) par Kenney — https://kenney.nl/assets/interface-sounds
- Explosion de Mine : "Sci-Fi Sounds" (explosionCrunch & lowFrequency) par Kenney — https://kenney.nl/assets/sci-fi-sounds
- Encaissement & Pièces : "RPG Audio" & "Music Jingles" par Kenney
Convertis en MP3 avec ffmpeg.
`);

  fs.writeFileSync(path.join(slotsDir, 'CREDITS.txt'), `Sons communs des machines à sous (The Diamond Casino) — CC0 (domaine public).

- Arrêt de rouleaux mécaniques : "Impact Sounds" (impactWood_heavy) par Kenney
- Rotation moteur : "Sci-Fi Sounds" (engineCircular) par Kenney
- Bouton / Microswitch : "RPG Audio" (metalClick) par Kenney
- Cloche Scatter : "Impact Sounds" (impactBell_heavy) par Kenney
- Jingles & Pièces : "Music Jingles" & "Casino Audio" par Kenney
Convertis en MP3 avec ffmpeg.
`);

  console.log('\n=== ALL ASSETS GENERATED SUCCESSFULLY! ===');
}

prepare().catch(err => {
  console.error('Failed to prepare assets:', err);
  process.exit(1);
});
