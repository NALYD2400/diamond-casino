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
      ['cannot call staff functions', isRefused(() => supabase.rpc('admin_reset_cooldown', { p_profile_id: null }))],
      ['cannot adjust balances via RPC', isRefused(() =>
        supabase.rpc('admin_adjust_balance', { p_profile_id: '00000000-0000-0000-0000-000000000000', p_chips_delta: 1000, p_cash_delta: 0, p_reason: 'x' }),
      )],
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
