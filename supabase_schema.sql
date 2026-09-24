-- ====================================================================
-- THE DIAMOND CASINO & RESORT - SUPABASE DATABASE OVERHAUL SCHEMA
-- ====================================================================
-- Run this script in the Supabase SQL Editor (Dashboard > SQL Editor)
-- to set up clean, robust tables, RLS policies, and admin permissions.

-- 1. PROFILES TABLE (Official Discord & RP Identity)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text UNIQUE NOT NULL,
  rp_first_name text NOT NULL,
  rp_last_name text NOT NULL,
  citizen_id text NOT NULL,
  full_name text,
  role text DEFAULT 'MEMBRE',
  vip_level text DEFAULT 'MEMBRE',
  chips bigint DEFAULT 10000,
  chips_balance bigint DEFAULT 10000,
  cash bigint DEFAULT 30000,
  cash_balance bigint DEFAULT 30000,
  avatar_url text,
  phone_number text,
  email text,
  inventory text[] DEFAULT ARRAY[]::text[],
  vehicles text[] DEFAULT ARRAY[]::text[],
  last_wheel_spin timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indices for instant lookups
CREATE INDEX IF NOT EXISTS idx_profiles_discord_id ON public.profiles(discord_id);
CREATE INDEX IF NOT EXISTS idx_profiles_citizen_id ON public.profiles(citizen_id);

-- 2. CASINO TRANSACTIONS & BETS
CREATE TABLE IF NOT EXISTS public.bets_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL,
  bet_amount bigint DEFAULT 0,
  win_amount bigint DEFAULT 0,
  multiplier numeric DEFAULT 1.0,
  result_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  category text NOT NULL,
  detail text,
  author text DEFAULT 'Console Admin',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.casino_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- 3. PERMISSIONS & PRIVILEGES (Allow anon and authenticated clients)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casino_settings ENABLE ROW LEVEL SECURITY;

-- Profiles: Public read, insert & update for valid sessions
DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
CREATE POLICY "Public profiles read" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public profiles insert" ON public.profiles;
CREATE POLICY "Public profiles insert" ON public.profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public profiles update" ON public.profiles;
CREATE POLICY "Public profiles update" ON public.profiles FOR UPDATE USING (true) WITH CHECK (true);

-- History & Logs: Allow insert & read
DROP POLICY IF EXISTS "Bets history access" ON public.bets_history;
CREATE POLICY "Bets history access" ON public.bets_history FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin logs access" ON public.admin_logs;
CREATE POLICY "Admin logs access" ON public.admin_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Settings access" ON public.casino_settings;
CREATE POLICY "Settings access" ON public.casino_settings FOR ALL USING (true) WITH CHECK (true);

-- 5. FOUNDER & OWNER PERMISSIONS ATTRIBUTION
-- Dylan's Discord account gets all permissions (role: 'PROPRIÉTAIRE FONDATEUR', 500k jetons, $1M cash)
INSERT INTO public.profiles (
  discord_id,
  rp_first_name,
  rp_last_name,
  citizen_id,
  full_name,
  role,
  vip_level,
  chips,
  chips_balance,
  cash,
  cash_balance,
  avatar_url,
  email,
  inventory,
  updated_at
) VALUES (
  '1537172004187414600',
  'Dylan',
  'Fondateur',
  '1',
  'Dylan Fondateur | #1',
  'PROPRIÉTAIRE FONDATEUR',
  'PROPRIÉTAIRE FONDATEUR',
  500000,
  500000,
  1000000,
  1000000,
  'https://cdn.discordapp.com/embed/avatars/0.png',
  'd.robert.2400@gmail.com',
  ARRAY['Pass Propriétaire Diamond', 'Carte VIP Black Diamond Elite', 'Clé Maître Casino'],
  now()
)
ON CONFLICT (discord_id) DO UPDATE SET
  role = 'PROPRIÉTAIRE FONDATEUR',
  vip_level = 'PROPRIÉTAIRE FONDATEUR',
  chips = 500000,
  chips_balance = 500000,
  cash = 1000000,
  cash_balance = 1000000,
  updated_at = now();

INSERT INTO public.profiles (
  discord_id,
  rp_first_name,
  rp_last_name,
  citizen_id,
  full_name,
  role,
  vip_level,
  chips,
  chips_balance,
  cash,
  cash_balance,
  avatar_url,
  email,
  inventory,
  updated_at
) VALUES (
  '1346953328432779341',
  'Dylan',
  'Fondateur',
  '1',
  'Dylan Fondateur | #1',
  'PROPRIÉTAIRE FONDATEUR',
  'PROPRIÉTAIRE FONDATEUR',
  500000,
  500000,
  1000000,
  1000000,
  'https://cdn.discordapp.com/embed/avatars/0.png',
  'd.robert.2400@gmail.com',
  ARRAY['Pass Propriétaire Diamond', 'Carte VIP Black Diamond Elite', 'Clé Maître Casino'],
  now()
)
ON CONFLICT (discord_id) DO UPDATE SET
  role = 'PROPRIÉTAIRE FONDATEUR',
  vip_level = 'PROPRIÉTAIRE FONDATEUR',
  chips = 500000,
  chips_balance = 500000,
  cash = 1000000,
  cash_balance = 1000000,
  updated_at = now();
