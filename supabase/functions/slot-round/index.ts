/**
 * slot-round — tirage des machines à sous CÔTÉ SERVEUR.
 *
 * Le navigateur envoie seulement { game, bet, mode } ; le serveur :
 *   1. identifie le joueur via son jeton Supabase,
 *   2. lit les réglages des jeux (games_config),
 *   3. joue la manche complète avec un aléa cryptographique,
 *   4. débite la mise et crédite le gain en une seule transaction SQL
 *      (settle_slot_round, exécutable uniquement avec la clé service_role),
 *   5. renvoie le résultat pour que le navigateur l'anime.
 *
 * Les moteurs (dogHouseEngine.ts / wantedEngine.ts) sont des copies exactes de
 * src/components/** — lancer `npm run sync:edge` après toute modification.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { playDogHouseRound, type DogRoundMode } from './dogHouseEngine.ts';
import { playWantedRound, type WantedBonus } from './wantedEngine.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Réel uniforme dans [0, 1[ sur 53 bits, tiré par crypto.getRandomValues */
function secureRandom(): number {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53;
}

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    return keys.default ?? Object.values(keys)[0] ?? '';
  } catch {
    return '';
  }
}

const KNOWN_ERRORS = [
  'MAINTENANCE',
  'GAME_DISABLED',
  'INVALID_BET',
  'INVALID_WIN',
  'INSUFFICIENT_FUNDS',
  'PROFILE_REQUIRED',
  'BUY_DISABLED',
  'BOOST_DISABLED',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth?.user) return json({ error: 'AUTH_REQUIRED' }, 401);

  let body: { game?: string; bet?: number; mode?: string; buy?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_BET' }, 400);
  }

  const game = body.game;
  const bet = Number(body.bet);
  if ((game !== 'doghouse' && game !== 'wanted') || !Number.isInteger(bet) || bet <= 0) {
    return json({ error: 'INVALID_BET' }, 400);
  }

  const { data: config, error: cfgError } = await admin.rpc('games_config');
  if (cfgError || !config?.[game]) return json({ error: 'GAME_DISABLED' }, 503);
  const cfg = config[game];
  if (!cfg.enabled) return json({ error: 'GAME_DISABLED' }, 403);
  if (bet < cfg.minBet || bet > cfg.maxBet) return json({ error: 'INVALID_BET' }, 400);

  let round;
  let detail: Record<string, unknown>;
  if (game === 'doghouse') {
    const mode = (['spin', 'boost', 'buy'].includes(body.mode ?? '') ? body.mode : 'spin') as DogRoundMode;
    if (mode === 'buy' && !cfg.buyEnabled) return json({ error: 'BUY_DISABLED' }, 403);
    if (mode === 'boost' && !cfg.boostEnabled) return json({ error: 'BOOST_DISABLED' }, 403);
    round = playDogHouseRound({ bet, mode, buyPriceX: cfg.buyPrice, maxPayout: cfg.maxPayout, rng: secureRandom });
    detail = { mode, bonus: round.freeSpins ? 'free_spins' : null };
  } else {
    const buy = (['gtr', 'duel', 'dmh'].includes(body.buy ?? '') ? body.buy : null) as WantedBonus | null;
    if (buy && !cfg.buyEnabled) return json({ error: 'BUY_DISABLED' }, 403);
    round = playWantedRound({ bet, buy, buyPrices: cfg.buyPrices, maxPayout: cfg.maxPayout, rng: secureRandom });
    detail = { mode: buy ? 'buy' : 'spin', bonus: round.bonus?.bonus ?? null };
  }

  const cost = Math.ceil(round.cost);
  const paid = Math.floor(round.totalWin);

  const { data: profile, error } = await admin.rpc('settle_slot_round', {
    p_user_id: auth.user.id,
    p_game: game,
    p_bet: bet,
    p_cost: cost,
    p_win: paid,
    p_detail: detail,
  });
  if (error) {
    const code = KNOWN_ERRORS.find((c) => (error.message ?? '').includes(c)) ?? 'SERVER_ERROR';
    return json({ error: code }, code === 'SERVER_ERROR' ? 500 : 400);
  }

  return json({ round, cost, paid, profile });
});
