import {
  sanitizeText,
  escapeHtml,
  isValidCitizenId,
  isValidRPName,
  isValidPhoneNumber,
  sanitizeNumber,
  safeJsonParse,
  isValidDiscordId,
} from './src/lib/security';
import { getDefaultDiscordAvatar, parseDiscordUserFromSession, hasAdminPermissions } from './src/lib/discord';
import { supabase, dbCheckHealth, apiRecentWheelWins, apiSubscribeEvents, CasinoApiError } from './src/lib/supabase';
import {
  calculateMultiplier,
  getNextStepProbability,
  generateBoard,
  getMultiplierLadder,
  STRATEGY_PRESETS,
  sha256Hex,
} from './src/components/mines/minesMath';
import {
  evaluateSlotSpin,
  simulateMachineRTP,
  DEFAULT_SLOT_MACHINES,
  PAYLINES_5X3,
  PAYLINES_3X3,
} from './src/components/slots/slotsEngine';
import {
  evaluateDogHouseSpin,
  rollFreeSpinsGrid,
  simulateDogHouse,
  MAX_WIN_X_BET,
} from './src/components/doghouse/dogHouseEngine';

type TestCase = [string, boolean | Promise<boolean>];

let failures = 0;

async function runGroup(title: string, tests: TestCase[]) {
  console.log(`\n--- ${title} ---`);
  for (const [name, result] of tests) {
    let ok = false;
    try {
      ok = await result;
    } catch (err) {
      console.error(`    ${(err as Error).message}`);
      ok = false;
    }
    if (ok) {
      console.log(`  ✓ [PASS] ${name}`);
    } else {
      console.error(`  ✗ [FAIL] ${name}`);
      failures++;
    }
  }
}

/** Resolves true when the promise rejects (or returns a Supabase error) */
async function isRefused(run: () => PromiseLike<{ error: unknown } | unknown>): Promise<boolean> {
  try {
    const res = (await run()) as { error?: unknown } | undefined;
    return !!res && typeof res === 'object' && 'error' in res && !!res.error;
  } catch {
    return true;
  }
}

async function main() {
  console.log('=== DIAMOND CASINO — TEST SUITE ===');

  await runGroup('INPUT SANITIZATION', [
    ['sanitizeText strips tags', sanitizeText('<script>alert(1)</script>') === 'alert(1)'],
    ['sanitizeText strips nested tags', sanitizeText('<<script>script>alert(1)</script>') === 'alert(1)'],
    ['sanitizeText strips javascript protocol', sanitizeText('javascript: alert(1)') === 'alert(1)'],
    ['sanitizeText strips event handlers', sanitizeText('<img src=x onerror=alert(1)>') === ''],
    ['sanitizeText handles non-strings', sanitizeText(null) === '' && sanitizeText(12345 as unknown) === ''],
    ['sanitizeText truncates at maxLength', sanitizeText('A'.repeat(500), 25).length === 25],
    ['escapeHtml escapes special characters', escapeHtml('<div class="vip">&\'</div>') === '&lt;div class=&quot;vip&quot;&gt;&amp;&#039;&lt;/div&gt;'],
    ['isValidCitizenId accepts valid IDs', isValidCitizenId('1042') && isValidCitizenId('CITIZEN-99') && isValidCitizenId('A_1')],
    ['isValidCitizenId rejects injection & XSS', !isValidCitizenId("1042' OR '1'='1") && !isValidCitizenId('<script>')],
    ['isValidCitizenId rejects empty / too long', !isValidCitizenId('   ') && !isValidCitizenId('1234567890123456')],
    ['isValidRPName accepts French names', isValidRPName('Jean-Luc') && isValidRPName("D'Amboise") && isValidRPName('Éléonore')],
    ['isValidRPName rejects digits / tags / 1 char', !isValidRPName('Marcus 123') && !isValidRPName('<b>') && !isValidRPName('A')],
    ['isValidPhoneNumber', isValidPhoneNumber('555-0142') && isValidPhoneNumber('+33 6 12 34 56 78') && !isValidPhoneNumber('call-me')],
    ['sanitizeNumber clamps and falls back', sanitizeNumber(-5, 0, 100) === 0 && sanitizeNumber(500, 0, 100) === 100 && sanitizeNumber('x', 0, 100, 42) === 42],
    ['safeJsonParse handles errors', safeJsonParse('{bad', 'fb') === 'fb' && safeJsonParse(null, 'd') === 'd'],
    ['safeJsonParse blocks prototype pollution', (safeJsonParse('{"__proto__": {"isAdmin": true}}', {}) as Record<string, unknown>).isAdmin === undefined],
    ['isValidDiscordId', isValidDiscordId('155149108183695360') && !isValidDiscordId('12345') && !isValidDiscordId("1551491081836' OR 1")],
  ]);

  await runGroup('DISCORD HELPERS', [
    ['getDefaultDiscordAvatar returns a Discord CDN URL', getDefaultDiscordAvatar('155149108183695360').startsWith('https://cdn.discordapp.com/embed/avatars/')],
    ['parseDiscordUserFromSession reads Discord metadata', (() => {
      const parsed = parseDiscordUserFromSession({
        id: 'sb_uuid_123',
        email: 'citoyen@example.com',
        app_metadata: {},
        aud: 'authenticated',
        created_at: '',
        user_metadata: {
          provider_id: '155149108183695360',
          custom_claims: { global_name: 'Antonio Depresto' },
          avatar_url: 'https://cdn.discordapp.com/avatars/155149108183695360/abc.png',
        },
      });
      return parsed.id === '155149108183695360' && parsed.globalName === 'Antonio Depresto' && parsed.avatarUrl.endsWith('/abc.png');
    })()],
    ['hasAdminPermissions is role-based only (no name/e-mail backdoor)', (() => {
      const staff = hasAdminPermissions({ role: 'DIRECTEUR CASINO' }) && hasAdminPermissions({ role: 'FONDATEUR' });
      const member = hasAdminPermissions({ role: 'MEMBRE' });
      const nameTrick = hasAdminPermissions({ role: 'MEMBRE', discordTag: '@dylan_owner' } as { role: string });
      return staff && !member && !nameTrick && !hasAdminPermissions(null);
    })()],
  ]);

  await runGroup('MINES GAME LOGIC & MATHEMATICS', [
    ['calculateMultiplier returns 1 for 0 gems', calculateMultiplier(3, 0) === 1],
    ['calculateMultiplier increases strictly monotonically with gems', (() => {
      const m1 = calculateMultiplier(3, 1);
      const m2 = calculateMultiplier(3, 2);
      const m3 = calculateMultiplier(3, 3);
      const m4 = calculateMultiplier(3, 4);
      return m1 < m2 && m2 < m3 && m3 < m4;
    })()],
    ['calculateMultiplier calculates accurate 3-mines 4-gems multiplier (~1.71x)', (() => {
      const m = calculateMultiplier(3, 4);
      return m >= 1.69 && m <= 1.73;
    })()],
    ['getNextStepProbability reflects true surviving gem percentage', (() => {
      const p0 = getNextStepProbability(3, 0); // 22 / 25 = 88%
      const p1 = getNextStepProbability(3, 1); // 21 / 24 = 87.5%
      return p0 === 88 && p1 === 87.5;
    })()],
    ['generateBoard produces exactly the requested number of mines in a 25-tile grid', (async () => {
      const b = await generateBoard(5);
      const minesCount = b.board.filter(Boolean).length;
      return b.board.length === 25 && minesCount === 5 && typeof b.serverSeed === 'string' && typeof b.hash === 'string';
    })()],
    ['calculateMultiplier boundary 24 mines 1 gem yields ~24.62x', (() => {
      const m = calculateMultiplier(24, 1);
      return m >= 24.6 && m <= 24.7;
    })()],
    ['calculateMultiplier boundary 1 mine 24 gems yields ~24.62x', (() => {
      const m = calculateMultiplier(1, 24);
      return m >= 24.6 && m <= 24.7;
    })()],
    ['getMultiplierLadder produces exact number of steps (25 - mines)', (() => {
      const l3 = getMultiplierLadder(3);
      const l10 = getMultiplierLadder(10);
      const l24 = getMultiplierLadder(24);
      return l3.length === 22 && l10.length === 15 && l24.length === 1;
    })()],
    ['getNextStepProbability boundary at last diamond is 0% when no safe tiles left', (() => {
      const pZero = getNextStepProbability(3, 22);
      return pZero === 0;
    })()],
    ['all strategy presets have valid mines and recommended diamonds', (() => {
      return STRATEGY_PRESETS.every(
        (p) => p.mines >= 1 && p.mines <= 24 && p.recommendedGems <= 25 - p.mines && p.expectedMultiplier > 1,
      );
    })()],
    ['generateBoard provably fair commitment hash verifies with sha256Hex', (async () => {
      const b = await generateBoard(4);
      const boardStr = b.board.map((m) => (m ? 'M' : 'D')).join('');
      const computed = await sha256Hex(`${b.serverSeed}:${boardStr}`);
      return computed === b.hash;
    })()],
    ['sha256Hex produces consistent hash string', (async () => {
      const h1 = await sha256Hex('test_diamond_casino');
      const h2 = await sha256Hex('test_diamond_casino');
      return h1 === h2 && h1.length >= 8;
    })()],
    ['grid tile coordinates map accurately across 5x5 board', (() => {
      const toCoord = (idx: number) => `${String.fromCharCode(65 + (idx % 5))}${Math.floor(idx / 5) + 1}`;
      return (
        toCoord(0) === 'A1' &&
        toCoord(4) === 'E1' &&
        toCoord(12) === 'C3' &&
        toCoord(20) === 'A5' &&
        toCoord(24) === 'E5'
      );
    })()],
    ['provably fair verifies correctly and detects tampering', (async () => {
      const b = await generateBoard(5);
      const boardStr = b.board.map((m) => (m ? 'M' : 'D')).join('');
      const validHash = await sha256Hex(`${b.serverSeed}:${boardStr}`);
      const tamperedHash = await sha256Hex(`tampered_${b.serverSeed}:${boardStr}`);
      return validHash === b.hash && tamperedHash !== b.hash;
    })()],
  ]);

  await runGroup('SLOTS ENGINE & MATHEMATICS', [
    ['DEFAULT_SLOT_MACHINES has at least 3 configured machines', DEFAULT_SLOT_MACHINES.length >= 3],
    ['PAYLINES_5X3 has exactly 20 distinct lines and PAYLINES_3X3 has 5 lines', PAYLINES_5X3.length === 20 && PAYLINES_3X3.length === 5],
    ['evaluateSlotSpin produces exact grid dimensions (5x3 for 5-reel)', (() => {
      const res = evaluateSlotSpin({ machine: DEFAULT_SLOT_MACHINES[0], bet: 100 });
      return res.grid.length === 5 && res.grid.every((col) => col.length === 3);
    })()],
    ['evaluateSlotSpin produces exact grid dimensions (3x3 for 3-reel)', (() => {
      const classic = DEFAULT_SLOT_MACHINES.find((m) => m.reelsCount === 3) || DEFAULT_SLOT_MACHINES[2];
      const res = evaluateSlotSpin({ machine: classic, bet: 100 });
      return res.grid.length === 3 && res.grid.every((col) => col.length === 3);
    })()],
    ['evaluateSlotSpin calculates non-negative win and multiplier', (() => {
      const res = evaluateSlotSpin({ machine: DEFAULT_SLOT_MACHINES[0], bet: 200 });
      return res.totalWin >= 0 && res.totalMultiplier >= 0 && typeof res.hash === 'string';
    })()],
    ['simulateMachineRTP runs 2,000 spins and outputs reasonable RTP and hit rate', (() => {
      const report = simulateMachineRTP(DEFAULT_SLOT_MACHINES[0], 2000);
      return (
        report.iterations === 2000 &&
        report.simulatedRtp >= 50 &&
        report.simulatedRtp <= 200 &&
        report.hitRatePct >= 10 &&
        report.durationMs < 500
      );
    })()],
  ]);

  const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const dogSpins = Array.from({ length: 3000 }, (_, i) => evaluateDogHouseSpin({ bet: 200, rng: seeded(i + 1) }));
  const dogFree = Array.from({ length: 1500 }, (_, i) =>
    evaluateDogHouseSpin({ bet: 200, isFreeSpin: true, rng: seeded(i + 99999) }),
  );

  await runGroup('THE DOG HOUSE ENGINE', [
    ['wilds only land on reels 2-4, scatters only on reels 1, 3 and 5', dogSpins.every((r) =>
      r.grid.every((col, reel) =>
        col.every((s) => (s !== 'wild' || [1, 2, 3].includes(reel)) && (s !== 'scatter' || [0, 2, 4].includes(reel))),
      ),
    )],
    ['wild multipliers are 2x or 3x and line multipliers are their sum', dogSpins.every((r) =>
      r.grid.every((col, reel) => col.every((s, row) => s !== 'wild' || [2, 3].includes(r.multipliers[reel][row]))) &&
      r.wins.filter((w) => w.lineIndex >= 0).every((w) => {
        const sum = w.positions.reduce((a, [reel, row]) => a + (r.grid[reel][row] === 'wild' ? r.multipliers[reel][row] : 0), 0);
        return w.wildMultiplier === (sum || 1);
      }),
    )],
    ['3 scatters pay 5x the bet and trigger the bonus', dogSpins.filter((r) => r.triggersBonus).every((r) =>
      r.scatterCount === 3 && r.wins.some((w) => w.lineIndex === -1 && w.win === 1000),
    )],
    ['no scatter and no retrigger during free spins', dogFree.every((r) => !r.triggersBonus && r.scatterCount === 0)],
    ['sticky wilds keep their position and multiplier', (() => {
      const sticky = [{ reel: 2, row: 1, multiplier: 3 }];
      const r = evaluateDogHouseSpin({ bet: 200, isFreeSpin: true, stickyWilds: sticky, rng: seeded(7) });
      return r.grid[2][1] === 'wild' && r.multipliers[2][1] === 3 && r.stickyWilds.some((w) => w.reel === 2 && w.row === 1);
    })()],
    ['bonus buy always triggers the free spins', Array.from({ length: 200 }, (_, i) =>
      evaluateDogHouseSpin({ bet: 200, forceScatters: true, rng: seeded(i + 555) }),
    ).every((r) => r.triggersBonus)],
    ['free spins grid awards 9 to 27 spins', Array.from({ length: 500 }, (_, i) => rollFreeSpinsGrid(seeded(i + 3))).every(
      (g) => g.length === 9 && g.every((v) => v >= 1 && v <= 3),
    )],
    ['a single spin never exceeds the 6 750x max win', dogSpins.every((r) => r.totalWin <= 200 * MAX_WIN_X_BET)],
    ['simulated RTP over 300k spins stays close to 96.5%', (() => {
      const sim = simulateDogHouse(300000, seeded(2026));
      return sim.rtp > 90 && sim.rtp < 103 && sim.hitRate > 20 && sim.bonusFrequency > 200 && sim.bonusFrequency < 500;
    })()],
  ]);

  const health = await dbCheckHealth();
  console.log(`\nSupabase: ${health.online ? 'ONLINE' : 'OFFLINE'} (${health.latencyMs}ms, ${health.version || health.error})`);
  if (!health.online) {
    console.warn('  ! [SKIP] Backend security tests skipped: Supabase unreachable');
  } else {
    // Every test below runs as an anonymous visitor (publishable key, no session)
    await runGroup('BACKEND SECURITY (ANONYMOUS VISITOR)', [
      ['cannot read player profiles', (async () => {
        const { data, error } = await supabase.from('profiles').select('id, chips, email');
        return !error && Array.isArray(data) && data.length === 0;
      })()],
      ['cannot modify balances', (async () => {
        const { data } = await supabase.from('profiles').update({ chips: 999999999 }).neq('id', '00000000-0000-0000-0000-000000000000').select('id');
        return !data || data.length === 0;
      })()],
      ['cannot create profiles', isRefused(() =>
        supabase.from('profiles').insert({ discord_id: `test_${Date.now()}`, rp_first_name: 'Test', rp_last_name: 'Test', citizen_id: 'T1', role: 'FONDATEUR' }),
      )],
      ['cannot delete profiles', (async () => {
        const { data } = await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id');
        return !data || data.length === 0;
      })()],
      ['cannot write casino settings', isRefused(() => supabase.from('casino_settings').upsert({ key: 'wheel_cooldown', value: 1 }))],
      ['cannot read admin logs', (async () => {
        const { data } = await supabase.from('admin_logs').select('id');
        return !data || data.length === 0;
      })()],
      ['cannot write admin logs', isRefused(() => supabase.from('admin_logs').insert({ action: 'x', category: 'SYSTEM' }))],
      ['cannot spin the wheel', isRefused(() => supabase.rpc('spin_wheel'))],
      ['cannot play mines without auth', isRefused(() => supabase.rpc('play_mines_game', { p_bet: 100, p_win: 200, p_multiplier: 2, p_mines: 3, p_gems: 1 }))],
      ['cannot call staff functions', isRefused(() => supabase.rpc('admin_reset_cooldown', { p_profile_id: null }))],
      ['cannot adjust balances via RPC', isRefused(() =>
        supabase.rpc('admin_adjust_balance', { p_profile_id: '00000000-0000-0000-0000-000000000000', p_chips_delta: 1000, p_cash_delta: 0, p_reason: 'x' }),
      )],
      ['cannot claim a prize', isRefused(() => supabase.rpc('claim_reward', { p_reward_id: '00000000-0000-0000-0000-000000000000' }))],
      ['cannot deliver / revoke prizes', isRefused(() =>
        supabase.rpc('admin_update_reward', { p_reward_id: '00000000-0000-0000-0000-000000000000', p_status: 'DELIVERED', p_note: null }),
      )],
      ['cannot grant vehicles', isRefused(() =>
        supabase.rpc('admin_grant_reward', { p_profile_id: '00000000-0000-0000-0000-000000000000', p_vehicle_model: 'adder', p_label: null, p_note: null }),
      )],
      ['cannot import the vehicle catalogue', isRefused(() => supabase.rpc('admin_import_vehicles', { p_rows: [] }))],
      ['cannot read player prizes', (async () => {
        const { data } = await supabase.from('player_rewards').select('id');
        return !data || data.length === 0;
      })()],
      ['can browse the vehicle catalogue', (async () => {
        const { data, error } = await supabase.from('vehicle_catalog').select('model, photo_url').limit(5);
        return !error && Array.isArray(data) && data.length > 0;
      })()],
      ['can read public wheel settings', (async () => {
        const { data, error } = await supabase.from('casino_settings').select('key').eq('key', 'wheel_segments');
        return !error && Array.isArray(data) && data.length === 1;
      })()],
      ['can list recent wheel wins (names abbreviated)', (async () => {
        const wins = await apiRecentWheelWins(5);
        return Array.isArray(wins) && wins.every((w) => /^.+ .?\.$/.test(w.winner) && typeof w.prize === 'string');
      })()],
      ['event subscription rejects invalid e-mails', (async () => {
        try {
          await apiSubscribeEvents('not-an-email');
          return false;
        } catch (err) {
          return err instanceof CasinoApiError && err.code === 'INVALID_EMAIL';
        }
      })()],
    ]);
  }

  console.log('\n=============================================');
  if (failures === 0) {
    console.log('RESULT: ALL TESTS PASSED.');
    process.exit(0);
  } else {
    console.error(`RESULT: ${failures} TEST(S) FAILED.`);
    process.exit(1);
  }
}

main();
