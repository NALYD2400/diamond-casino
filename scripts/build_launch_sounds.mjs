import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public', 'sounds');
const DIST = path.join(ROOT, 'dist', 'sounds');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

console.log('=== CRAFTING AUTHENTIC LAUNCH SOUNDS ===');

// 1. THE DOG HOUSE REEL SPIN (Acoustic reel roll: gentle tactile push + smooth felt glide + cheerful subtle marimba)
console.log('1. Building doghouse/reel-spin.mp3...');
const dogSpinPath = path.join(PUBLIC, 'doghouse', 'reel-spin.mp3');

// We use lavfi sources directly in filter_complex for maximum precision and compatibility
const dogFilter = [
  // 1. Soft felt reel glide whoosh (pink noise, lowpass 600Hz, bandpass 350Hz)
  "anoisesrc=d=0.36:c=pink:r=44100,lowpass=f=600,bandpass=f=350:width_type=h:w=240,volume=0.22,afade=t=in:ss=0:d=0.035,afade=t=out:st=0.18:d=0.18[whoosh]",
  // 2. Playful cartoon marimba notes (C5: 523Hz, E5: 659Hz, G5: 784Hz) with warm wooden decay
  "aevalsrc='0.12*sin(2*PI*523.25*t)*exp(-24*t) + 0.05*sin(2*PI*1046.5*t)*exp(-30*t)':s=44100:d=0.22,adelay=25|25[note1]",
  "aevalsrc='0.11*sin(2*PI*659.25*t)*exp(-24*t) + 0.04*sin(2*PI*1318.5*t)*exp(-30*t)':s=44100:d=0.22,adelay=65|65[note2]",
  "aevalsrc='0.10*sin(2*PI*783.99*t)*exp(-22*t) + 0.04*sin(2*PI*1567.98*t)*exp(-28*t)':s=44100:d=0.26,adelay=105|105[note3]",
  // 3. Gentle tactile micro-switch impulse with 12ms smooth rise (no loud pop/slam)
  "aevalsrc='0.12*sin(2*PI*240*t)*exp(-48*t) + 0.06*sin(2*PI*480*t)*exp(-58*t)':s=44100:d=0.08,afade=t=in:ss=0:d=0.012,volume=0.22[click]",
  // Mix and master: smooth attack, gentle fade-out, peak clamped so it is warm and non-fatiguing
  "[whoosh][note1][note2][note3][click]amix=inputs=5:duration=first:normalize=0[mix]",
  "[mix]afade=t=in:ss=0:d=0.015,afade=t=out:st=0.22:d=0.14,volume=0.48,alimiter=limit=0.18:attack=5:release=50[out]"
].join(';');

run(`ffmpeg -y -filter_complex "${dogFilter}" -map "[out]" -t 0.36 -ac 2 -ar 44100 -b:a 192k "${dogSpinPath}"`);
console.log('Created:', dogSpinPath);

// 2. WHEEL OF FORTUNE SPIN (Mechanical rotary impetus: warm wooden impulse + soft lowpass aerodynamic whirr)
console.log('2. Building wheel/spin.mp3...');
const wheelSpinPath = path.join(PUBLIC, 'wheel', 'spin.mp3');

// Realistic fortune wheel spin actuation:
// - Physical wooden rim impulse (warm 200Hz resonance with 15ms smooth rise, no harsh snap)
// - Heavy bearing rotary whoosh (smooth brownian noise lowpass filtered at 300Hz, decaying over 0.5s)
// - Gentle bearing hum
// - Zero card flutter, zero sci-fi engine hum, smooth fade-out before peg ticks take over
const wheelFilter = [
  "anoisesrc=d=0.55:c=brown:r=44100,lowpass=f=320,bandpass=f=210:width_type=h:w=180,volume=0.40,afade=t=in:ss=0:d=0.05,afade=t=out:st=0.22:d=0.32[whoosh]",
  "aevalsrc='0.18*sin(2*PI*180*t)*exp(-18*t) + 0.08*sin(2*PI*360*t)*exp(-24*t)':s=44100:d=0.25,lowpass=f=400,afade=t=in:ss=0:d=0.018,volume=0.45[impulse]",
  "anoisesrc=d=0.45:c=pink:r=44100,lowpass=f=240,volume=0.20,afade=t=in:ss=0:d=0.06,afade=t=out:st=0.18:d=0.26[bearing]",
  "[whoosh][impulse][bearing]amix=inputs=3:duration=first:normalize=0[mix]",
  "[mix]afade=t=in:ss=0:d=0.020,afade=t=out:st=0.30:d=0.24,volume=0.75,alimiter=limit=0.25:attack=7:release=60[out]"
].join(';');

run(`ffmpeg -y -filter_complex "${wheelFilter}" -map "[out]" -t 0.55 -ac 2 -ar 44100 -b:a 192k "${wheelSpinPath}"`);
console.log('Created:', wheelSpinPath);

// Copy to dist if dist exists
ensureDir(path.join(DIST, 'doghouse'));
ensureDir(path.join(DIST, 'wheel'));
fs.copyFileSync(dogSpinPath, path.join(DIST, 'doghouse', 'reel-spin.mp3'));
fs.copyFileSync(wheelSpinPath, path.join(DIST, 'wheel', 'spin.mp3'));

console.log('=== AUDIO GENERATION COMPLETE ===');
