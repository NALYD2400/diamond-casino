import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const TEMP = path.join(ROOT, 'temp_audio');
const PUBLIC = path.join(ROOT, 'public', 'sounds');
const DIST = path.join(ROOT, 'dist', 'sounds');

function run(cmd) {
  execSync(cmd, { stdio: 'pipe' });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyToDist(relPath) {
  const src = path.join(PUBLIC, relPath);
  const dest = path.join(DIST, relPath);
  if (fs.existsSync(src)) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

console.log('=== CONVERTING REAL ACOUSTIC KENNEY CASINO AUDIO ASSETS ===');

// Directories
for (const sub of ['slots', 'doghouse', 'wanted', 'wheel', 'mines']) {
  ensureDir(path.join(PUBLIC, sub));
  ensureDir(path.join(DIST, sub));
}

// 1. REEL SPIN (Acoustic reel roll: smooth card fan + felt glide, warm & non-intrusive)
console.log('1. Building reel-spin.mp3...');
const fan = path.join(TEMP, 'Audio', 'card-fan-2.ogg');
const slide = path.join(TEMP, 'Audio', 'card-slide-2.ogg');
const reelSpinPath = path.join(PUBLIC, 'slots', 'reel-spin.mp3');
run(`ffmpeg -y -i "${fan}" -i "${slide}" -filter_complex "[0:a]lowpass=f=3200,volume=0.85[a0];[1:a]lowpass=f=2600,volume=0.55,adelay=60|60[a1];[a0][a1]amix=inputs=2:duration=first[mix];[mix]afade=t=in:ss=0:d=0.05,afade=t=out:st=0.95:d=0.25[out]" -map "[out]" -t 1.25 -ac 2 -ar 44100 -b:a 192k "${reelSpinPath}"`);

for (const sub of ['doghouse', 'wanted']) {
  fs.copyFileSync(reelSpinPath, path.join(PUBLIC, sub, 'reel-spin.mp3'));
}
['slots', 'doghouse', 'wanted'].forEach(s => copyToDist(`${s}/reel-spin.mp3`));

// 2. REEL TICK (Soft organic micro-tap from real interface tick)
console.log('2. Building reel-tick.mp3...');
const tickSrc = path.join(TEMP, 'interface', 'Audio', 'tick_002.ogg');
const reelTickPath = path.join(PUBLIC, 'slots', 'reel-tick.mp3');
run(`ffmpeg -y -i "${tickSrc}" -af "volume=0.6,lowpass=f=2400" -ac 2 -ar 44100 -b:a 192k "${reelTickPath}"`);
for (const sub of ['doghouse', 'wanted']) {
  fs.copyFileSync(reelTickPath, path.join(PUBLIC, sub, 'reel-tick.mp3'));
}
['slots', 'doghouse', 'wanted'].forEach(s => copyToDist(`${s}/reel-tick.mp3`));

// 3. MECHANICAL SWITCH / BOOST TOGGLE (Real tactile physical toggle switch)
console.log('3. Building switch.mp3 (/boost)...');
const switchSrc = path.join(TEMP, 'ui', 'Audio', 'switch1.ogg');
const switchPath = path.join(PUBLIC, 'doghouse', 'switch.mp3');
run(`ffmpeg -y -i "${switchSrc}" -af "volume=1.0" -ac 2 -ar 44100 -b:a 192k "${switchPath}"`);
for (const sub of ['slots', 'wanted']) {
  fs.copyFileSync(switchPath, path.join(PUBLIC, sub, 'switch.mp3'));
}
['slots', 'doghouse', 'wanted'].forEach(s => copyToDist(`${s}/switch.mp3`));

// 4. WHEEL SPIN (Real mechanical bearing & felt wheel whirr)
console.log('4. Building wheel/spin.mp3...');
const wheelFan = path.join(TEMP, 'Audio', 'card-fan-2.ogg');
const wheelSlide = path.join(TEMP, 'Audio', 'card-slide-1.ogg');
const wheelSpinPath = path.join(PUBLIC, 'wheel', 'spin.mp3');
run(`ffmpeg -y -i "${wheelFan}" -i "${wheelSlide}" -filter_complex "[0:a]lowpass=f=2800,volume=0.9[a0];[1:a]lowpass=f=2400,volume=0.6,adelay=80|80[a1];[a0][a1]amix=inputs=2:duration=first[mix];[mix]afade=t=in:ss=0:d=0.06,afade=t=out:st=1.1:d=0.35[out]" -map "[out]" -t 1.5 -ac 2 -ar 44100 -b:a 192k "${wheelSpinPath}"`);
copyToDist('wheel/spin.mp3');

// 5. WHEEL SUSPENSE (Warm cinematic low-end tension riser)
console.log('5. Building wheel/suspense.mp3...');
const wheelSuspensePath = path.join(PUBLIC, 'wheel', 'suspense.mp3');
run(`ffmpeg -y -f lavfi -i "aevalsrc='0.22*sin(2*PI*55*t)*(1+0.12*sin(2*PI*3*t))*min(1,t/0.5) + 0.12*sin(2*PI*110*t)*(1+0.08*sin(2*PI*2.5*t))*min(1,t/0.5)':s=44100:d=2.4" -af "lowpass=f=260,afade=t=in:ss=0:d=0.35,afade=t=out:st=1.9:d=0.45" -ac 2 -ar 44100 -b:a 192k "${wheelSuspensePath}"`);
copyToDist('wheel/suspense.mp3');

// 6. WHEEL STOP (Real heavy mechanical latch impact)
console.log('6. Building wheel/stop.mp3...');
const woodImpact = path.join(TEMP, 'impact', 'Audio', 'impactWood_heavy_000.ogg');
const wheelStopPath = path.join(PUBLIC, 'wheel', 'stop.mp3');
run(`ffmpeg -y -i "${woodImpact}" -af "volume=1.05" -ac 2 -ar 44100 -b:a 192k "${wheelStopPath}"`);
copyToDist('wheel/stop.mp3');

// 7. MINES DEAL (Real casino card slide on felt + chip placement)
console.log('7. Building mines/deal.mp3...');
const cardSlide = path.join(TEMP, 'Audio', 'card-slide-1.ogg');
const chipLay1 = path.join(TEMP, 'Audio', 'chip-lay-1.ogg');
const dealPath = path.join(PUBLIC, 'mines', 'deal.mp3');
run(`ffmpeg -y -i "${cardSlide}" -i "${chipLay1}" -filter_complex "[0:a]volume=1.1[a0];[1:a]volume=0.8,adelay=110|110[a1];[a0][a1]amix=inputs=2:duration=first[out]" -map "[out]" -ac 2 -ar 44100 -b:a 192k "${dealPath}"`);
copyToDist('mines/deal.mp3');

// 8. MINES TILE CLICK (Real casino chip placement)
console.log('8. Building mines/tile-click.mp3...');
const chipLay2 = path.join(TEMP, 'Audio', 'chip-lay-2.ogg');
const tileClickPath = path.join(PUBLIC, 'mines', 'tile-click.mp3');
run(`ffmpeg -y -i "${chipLay2}" -af "volume=1.2" -ac 2 -ar 44100 -b:a 192k "${tileClickPath}"`);
copyToDist('mines/tile-click.mp3');

// 9. MINES TILE HOVER (Soft acoustic interface tick)
console.log('9. Building mines/tile-hover.mp3...');
const hoverSrc = path.join(TEMP, 'interface', 'Audio', 'tick_001.ogg');
const tileHoverPath = path.join(PUBLIC, 'mines', 'tile-hover.mp3');
run(`ffmpeg -y -i "${hoverSrc}" -af "volume=0.35" -ac 2 -ar 44100 -b:a 192k "${tileHoverPath}"`);
copyToDist('mines/tile-hover.mp3');

// 10. MINES GEM 1-6 (Real crystal glass bell rings)
console.log('10. Building mines/gem-*.mp3...');
for (let i = 1; i <= 6; i++) {
  const gSrc = path.join(TEMP, 'interface', 'Audio', `glass_00${i}.ogg`);
  const gPath = path.join(PUBLIC, 'mines', `gem-${i}.mp3`);
  run(`ffmpeg -y -i "${gSrc}" -af "volume=1.1" -ac 2 -ar 44100 -b:a 192k "${gPath}"`);
  copyToDist(`mines/gem-${i}.mp3`);
}

// 11. DOGHOUSE SLAM (Sticky wild heavy wood impact)
console.log('11. Building doghouse/slam.mp3...');
const slamSrc = path.join(TEMP, 'impact', 'Audio', 'impactWood_heavy_001.ogg');
const slamPath = path.join(PUBLIC, 'doghouse', 'slam.mp3');
run(`ffmpeg -y -i "${slamSrc}" -af "volume=1.2" -ac 2 -ar 44100 -b:a 192k "${slamPath}"`);
copyToDist('doghouse/slam.mp3');

// 12. SLOTS REEL STOPS 1-5 (Physical reel stop clacks with natural pitch progression)
console.log('12. Building slots/reel-stop-*.mp3...');
for (let r = 1; r <= 5; r++) {
  const pitch = 0.95 + r * 0.035;
  const stopPath = path.join(PUBLIC, 'slots', `reel-stop-${r}.mp3`);
  run(`ffmpeg -y -i "${woodImpact}" -af "asetrate=44100*${pitch.toFixed(3)},aresample=44100,volume=1.1" -ac 2 -ar 44100 -b:a 192k "${stopPath}"`);
  copyToDist(`slots/reel-stop-${r}.mp3`);
}
fs.copyFileSync(path.join(PUBLIC, 'slots', 'reel-stop-1.mp3'), path.join(PUBLIC, 'slots', 'reel-stop.mp3'));
copyToDist('slots/reel-stop.mp3');

console.log('=== REAL CASINO AUDIO CONVERSION COMPLETE ===');
