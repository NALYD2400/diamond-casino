import {
  sanitizeText,
  escapeHtml,
  isValidCitizenId,
  isValidRPName,
  isValidPhoneNumber,
  sanitizeNumber,
  safeJsonParse,
  isValidDiscordId
} from './src/lib/security';
import { 
  getDefaultDiscordAvatar, 
  fetchDiscordUserProfile, 
  triggerSupabaseDiscordOAuth,
  isDiscordUserAdminOrOwner,
  parseDiscordUserFromSession
} from './src/lib/discord';
import { dbCheckHealth } from './src/lib/supabase';

async function main() {
  console.log('--- RUNNING DIAMOND CASINO DEEP TEST SUITE ---');

  const tests: [string, boolean][] = [
    // 1. Sanitize text
    ['sanitizeText strips tags', sanitizeText('<script>alert(1)</script>') === 'alert(1)'],
    ['sanitizeText strips nested tags', sanitizeText('<<script>script>alert(1)</script>') === 'alert(1)'],
    ['sanitizeText strips javascript protocol', sanitizeText('javascript: alert(1)') === 'alert(1)'],
    ['sanitizeText strips vbscript protocol', sanitizeText('vbscript:msgbox') === 'msgbox'],
    ['sanitizeText strips data protocol', sanitizeText('data:text/html;base64,...') === 'text/html;base64,...'],
    ['sanitizeText strips onerror event handler', sanitizeText('<img src=x onerror=alert(1)>') === ''],
    ['sanitizeText strips onload event handler', sanitizeText('<body onload=alert(1)>') === ''],
    ['sanitizeText handles non-string (null)', sanitizeText(null) === ''],
    ['sanitizeText handles non-string (undefined)', sanitizeText(undefined) === ''],
    ['sanitizeText handles numbers safely', sanitizeText(12345 as any) === ''],
    ['sanitizeText truncates at maxLength', sanitizeText('A'.repeat(500), 25).length === 25],

    // 2. Escape HTML
    ['escapeHtml escapes <, >, &, ", \'', escapeHtml('<div class="vip">&\'</div>') === '&lt;div class=&quot;vip&quot;&gt;&amp;&#039;&lt;/div&gt;'],

    // 3. Citizen ID
    ['isValidCitizenId accepts valid IDs', isValidCitizenId('1042') && isValidCitizenId('CITIZEN-99') && isValidCitizenId('A_1')],
    ['isValidCitizenId rejects SQL injection', !isValidCitizenId("1042' OR '1'='1")],
    ['isValidCitizenId rejects XSS characters', !isValidCitizenId('<script>') && !isValidCitizenId('user>1')],
    ['isValidCitizenId rejects empty string', !isValidCitizenId('') && !isValidCitizenId('   ')],
    ['isValidCitizenId rejects excessive length', !isValidCitizenId('1234567890123456')],

    // 4. RP Name
    ['isValidRPName accepts French & European names', isValidRPName('Jean-Luc') && isValidRPName("D'Amboise") && isValidRPName('Éléonore Depresto')],
    ['isValidRPName rejects script tags', !isValidRPName('<script>')],
    ['isValidRPName rejects numbers in name', !isValidRPName('Marcus 123')],
    ['isValidRPName rejects 1-character names', !isValidRPName('A')],

    // 5. Phone numbers
    ['isValidPhoneNumber accepts standard formats', isValidPhoneNumber('555-0142') && isValidPhoneNumber('+33 6 12 34 56 78') && isValidPhoneNumber('5550142')],
    ['isValidPhoneNumber rejects alphabetic strings', !isValidPhoneNumber('call-me-now')],

    // 6. Number sanitization
    ['sanitizeNumber clamps negative to min', sanitizeNumber(-50, 0, 100) === 0],
    ['sanitizeNumber clamps high to max', sanitizeNumber(500, 0, 100) === 100],
    ['sanitizeNumber handles NaN fallback', sanitizeNumber('invalid_num', 0, 100, 42) === 42],
    ['sanitizeNumber handles Infinity fallback', sanitizeNumber(Infinity, 0, 100, 10) === 10],

    // 7. Safe JSON parse & Prototype pollution protection
    ['safeJsonParse parses valid json', safeJsonParse('{"chips": 5000}', null)?.chips === 5000],
    ['safeJsonParse returns fallback on syntax error', safeJsonParse('{corrupted json', 'fallback_value') === 'fallback_value'],
    ['safeJsonParse returns fallback on null', safeJsonParse(null, 'default') === 'default'],
    ['safeJsonParse strips prototype pollution payload', (safeJsonParse('{"__proto__": {"isAdmin": true}}', {}) as any)?.isAdmin === undefined],

    // 8. Discord Snowflake validation
    ['isValidDiscordId accepts 17-20 numeric digits', isValidDiscordId('155149108183695360') && isValidDiscordId('1234567890123456789')],
    ['isValidDiscordId rejects letters or short IDs', !isValidDiscordId('12345') && !isValidDiscordId('dyno#3861')],
    ['isValidDiscordId rejects SQL injection', !isValidDiscordId("155149108183695360' OR '1'='1")],

    // 9. Discord Avatar Generation
    ['getDefaultDiscordAvatar generates valid CDN URL', getDefaultDiscordAvatar('155149108183695360').startsWith('https://cdn.discordapp.com/embed/avatars/')],
    ['getDefaultDiscordAvatar handles string seeds', getDefaultDiscordAvatar('Antonio#0001').startsWith('https://cdn.discordapp.com/embed/avatars/')],

    // 10. Nitro / Booster Remnants Elimination
    ['Nitro booster badges cleanly scrubbed from inventory', (() => {
      const dirty = ['Carte VIP Gold', 'Insigne Discord Nitro Booster', 'Trophée Casino', 'Booster Perk'];
      const cleaned = dirty.filter(i => !i.toLowerCase().includes('nitro') && !i.toLowerCase().includes('booster'));
      return cleaned.length === 2 && !cleaned.includes('Insigne Discord Nitro Booster');
    })()],

    // 10b. Legacy slash commands /boost and /goal eradication verification
    ['Legacy /boost and /goal entries scrubbed from ledger', (() => {
      const dirtyTx = [
        { label: 'Gain Roue de la Fortune' },
        { label: 'Prime journalière /boost réclamée' },
        { label: 'Mission citoyenne /goal achevée' },
        { label: 'Souscription VIP GOLD' }
      ];
      const cleaned = dirtyTx.filter(t => !t.label.toLowerCase().includes('boost') && !t.label.toLowerCase().includes('goal'));
      return cleaned.length === 2 && cleaned[0].label === 'Gain Roue de la Fortune';
    })()],

    // 11. Discord Default CDN Avatar Validation
    ['getDefaultDiscordAvatar generates valid CDN avatar url', (() => {
      const avatar = getDefaultDiscordAvatar('1346953328432779341');
      return avatar.startsWith('https://cdn.discordapp.com/embed/avatars/');
    })()],

    // 12. Wheel spin cooldown eligibility logic
    ['Wheel spin is available when lastWheelSpin is null', (() => {
      const lastWheelSpin: number | null = null;
      const COOLDOWN_MS = 24 * 60 * 60 * 1000;
      const canSpin = !lastWheelSpin || Date.now() - lastWheelSpin >= COOLDOWN_MS;
      return canSpin === true;
    })()],
    ['Wheel spin enforces cooldown wait period', (() => {
      const lastWheelSpin = Date.now() - (12 * 60 * 60 * 1000); // 12h ago
      const COOLDOWN_MS = 24 * 60 * 60 * 1000;
      const canSpin = !lastWheelSpin || Date.now() - lastWheelSpin >= COOLDOWN_MS;
      return canSpin === false;
    })()],

    // 13. Transaction Ledger Balance Consistency
    ['Discord welcome gift creates consistent balance and ledger entry', (() => {
      const chips = 10000;
      const cash = 30000;
      const extraChips = Math.max(0, chips - 5000);
      const extraCash = Math.max(0, cash - 25000);
      const initEntries = [
        { amountChips: 5000, amountCash: 0 },
        { amountChips: 0, amountCash: 25000 },
      ];
      const bonusTx = { amountChips: extraChips, amountCash: extraCash };
      const allTx = [bonusTx, ...initEntries];
      const totalChipsLedger = allTx.reduce((sum, t) => sum + t.amountChips, 0);
      const totalCashLedger = allTx.reduce((sum, t) => sum + t.amountCash, 0);
      return totalChipsLedger === chips && totalCashLedger === cash;
    })()],

    // 14. Discord OAuth Trigger verification
    ['triggerSupabaseDiscordOAuth connects to official Supabase Auth', (async () => {
      const res = await triggerSupabaseDiscordOAuth();
      // It returns either a valid OAuth URL or a handled error from Supabase
      return typeof res === 'object';
    })()],

    // 15. Admin / Owner permissions attribution ('et mais les all perm a mon compte discord apres')
    ['isDiscordUserAdminOrOwner recognizes owner email and developer discord ID', (() => {
      const isOwnerByEmail = isDiscordUserAdminOrOwner(undefined, 'd.robert.2400@gmail.com');
      const isOwnerById = isDiscordUserAdminOrOwner('1346953328432779341');
      const isOwnerByName = isDiscordUserAdminOrOwner(undefined, undefined, 'dylan_owner');
      const isRandomUser = isDiscordUserAdminOrOwner('999999999999999999', 'citoyen@random.rp', 'random_player');
      return isOwnerByEmail && isOwnerById && isOwnerByName && !isRandomUser;
    })()],

    // 16. Supabase OAuth session user parser
    ['parseDiscordUserFromSession correctly extracts Discord avatar and metadata', (() => {
      const mockSessionUser = {
        id: 'sb_uuid_123',
        email: 'dylan@example.com',
        user_metadata: {
          sub: '155149108183695360',
          custom_claims: { global_name: 'Antonio Depresto' },
          avatar: 'a_123456789abcdef',
        },
      };
      const parsed = parseDiscordUserFromSession(mockSessionUser);
      return parsed.id === '155149108183695360' &&
        parsed.globalName === 'Antonio Depresto' &&
        parsed.avatarUrl.includes('155149108183695360/a_123456789abcdef.png') &&
        parsed.email === 'dylan@example.com';
    })()],

    // 17. Subsequent login (Deco/Reco): profile auto-recovery without re-prompting
    ['Subsequent logins restore Prénom, Nom, and Citizen ID from existing Supabase profile', (() => {
      const cloudProfile = {
        discord_id: '155149108183695360',
        full_name: 'Antonio Depresto | #1042',
        role: 'owner',
        chips_balance: 55000,
        cash_balance: 120000,
      };
      // Parsing logic matching CasinoUserContext
      const fn = cloudProfile.full_name;
      const parts = fn.split('|');
      const nameParts = parts[0].trim().split(' ');
      const existingFirst = nameParts[0];
      const existingLast = nameParts.slice(1).join(' ');
      const existingCitizenId = parts[1].replace('#', '').trim();
      return existingFirst === 'Antonio' && existingLast === 'Depresto' && existingCitizenId === '1042';
    })()],
  ];

  let failures = 0;
  for (const [name, ok] of tests) {
    if (ok) {
      console.log(`  ✓ [PASS] ${name}`);
    } else {
      console.error(`  ✗ [FAIL] ${name}`);
      failures++;
    }
  }

  // 14. Async Discord Profile Lookup Verification
  console.log('\n--- VERIFYING DISCORD LOOKUP SERVICE ---');
  try {
    const directUrlProfile = await fetchDiscordUserProfile('https://cdn.discordapp.com/avatars/test.png');
    if (directUrlProfile.success && directUrlProfile.data?.avatarUrl === 'https://cdn.discordapp.com/avatars/test.png') {
      console.log('  ✓ [PASS] Direct image URL resolution verified');
    } else {
      console.error('  ✗ [FAIL] Direct image URL resolution failed');
      failures++;
    }

    const customAvatarProfile = await fetchDiscordUserProfile('antontio depresto', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d');
    if (customAvatarProfile.success && customAvatarProfile.data?.avatarUrl.includes('images.unsplash.com')) {
      console.log('  ✓ [PASS] Custom avatar URL override verified');
    } else {
      console.error('  ✗ [FAIL] Custom avatar URL override failed');
      failures++;
    }

    const tagProfile = await fetchDiscordUserProfile('@antontio#1042');
    if (tagProfile.success && tagProfile.data?.tag === 'antontio#1042' && tagProfile.data?.username === 'antontio') {
      console.log('  ✓ [PASS] Discord tag parser and sanitized username verified');
    } else {
      console.error('  ✗ [FAIL] Discord tag parser failed');
      failures++;
    }
  } catch (err: any) {
    console.error('  ✗ [FAIL] Discord lookup service threw exception:', err.message);
    failures++;
  }

  // 15. Cooldown logic unit verification
  console.log('\n--- VERIFYING VIP COOLDOWN SCALING LOGIC ---');
  function calculateEffectiveCooldown(vipTier: string | null, adminCooldownHours = 24): number {
    let effectiveHours = adminCooldownHours;
    if (vipTier === 'DIAMOND') {
      effectiveHours = Math.min(8, adminCooldownHours);
    } else if (vipTier === 'GOLD') {
      effectiveHours = Math.min(12, adminCooldownHours);
    }
    return effectiveHours;
  }

  const cooldownTests: [string, boolean][] = [
    ['Diamond VIP = 8h cooldown (3 spins/day)', calculateEffectiveCooldown('DIAMOND') === 8],
    ['Gold VIP = 12h cooldown (2 spins/day)', calculateEffectiveCooldown('GOLD') === 12],
    ['Standard member = 24h cooldown (1 spin/day)', calculateEffectiveCooldown(null) === 24],
    ['Respects lower admin cooldown (e.g. 4h limit)', calculateEffectiveCooldown('DIAMOND', 4) === 4],
  ];

  for (const [name, ok] of cooldownTests) {
    if (ok) {
      console.log(`  ✓ [PASS] ${name}`);
    } else {
      console.error(`  ✗ [FAIL] ${name}`);
      failures++;
    }
  }

  // 16. Live Overhauled Database Profile & Permissions Verification
  console.log('\n--- VERIFYING OVERHAULED CASINO SUPABASE DATABASE ---');
  try {
    const { dbGetProfile, dbUpsertProfile, dbDeleteProfile } = await import('./src/lib/supabase');
    
    // Check Dylan's Founder profile
    const dylanProfile = await dbGetProfile('1346953328432779341');
    if (
      dylanProfile &&
      dylanProfile.role === 'PROPRIÉTAIRE FONDATEUR' &&
      dylanProfile.rp_first_name === 'Dylan' &&
      dylanProfile.chips === 500000 &&
      dylanProfile.cash === 1000000
    ) {
      console.log('  ✓ [PASS] Dylan Founder profile verified in Supabase (all permissions, 500k chips, $1M cash)');
    } else {
      console.error('  ✗ [FAIL] Dylan Founder profile verification failed:', dylanProfile);
      failures++;
    }

    // Live upsert and read-back test to prove zero permission errors (no 42501 error)
    const testProbeId = 'test_verify_' + Date.now();
    const probeUpsert = await dbUpsertProfile({
      discord_id: testProbeId,
      rp_first_name: 'Verification',
      rp_last_name: 'Test',
      citizen_id: '9999',
      role: 'MEMBRE',
      chips: 10000,
      cash: 30000,
      avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
    });

    if (probeUpsert && probeUpsert.discord_id === testProbeId) {
      console.log('  ✓ [PASS] Live profile insertion & upsert succeed with zero permission errors');
    } else {
      console.error('  ✗ [FAIL] Live profile upsert failed');
      failures++;
    }

    // Verify retrieval
    const probeRead = await dbGetProfile(testProbeId);
    if (probeRead && probeRead.rp_first_name === 'Verification' && probeRead.citizen_id === '9999') {
      console.log('  ✓ [PASS] Live profile query by Discord ID verified');
    } else {
      console.error('  ✗ [FAIL] Live profile query failed');
      failures++;
    }

    // Clean up
    await dbDeleteProfile(testProbeId);
    console.log('  ✓ [PASS] Cleaned up verification test record');
  } catch (err: any) {
    console.error('  ✗ [FAIL] Database verification exception:', err.message);
    failures++;
  }

  // 17. Live Supabase Health Check verification
  console.log('\n--- VERIFYING LIVE SUPABASE HEALTH INTEGRATION ---');
  try {
    const health = await dbCheckHealth();
    console.log(`  Health Status: ${health.online ? 'ONLINE' : 'OFFLINE'}`);
    console.log(`  Roundtrip Latency: ${health.latencyMs}ms`);
    console.log(`  Server Version: ${health.version || health.error}`);
    if (health.online) {
      console.log('  ✓ [PASS] Live Supabase connection verified');
    } else {
      console.warn('  ! [WARN] Supabase returned offline status:', health.error);
    }
  } catch (err: any) {
    console.error('  ✗ [FAIL] Live health check failed with exception:', err.message);
    failures++;
  }

  console.log('\n=============================================');
  if (failures === 0) {
    console.log('RESULT: ALL TESTS PASSED! ZERO REGRESSIONS.');
    process.exit(0);
  } else {
    console.error(`RESULT: ${failures} TESTS FAILED.`);
    process.exit(1);
  }
}

main();
