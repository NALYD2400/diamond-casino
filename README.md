# 💎 THE DIAMOND — Casino & Resort

Portail web du **Diamond Casino & Resort** (serveur FiveM RP) : vitrine, catalogue des jeux, Roue de la Fortune quotidienne, cartes VIP, espace membre Discord et console de gérance.

---

## ⚡ Stack

- **React 19** + **TypeScript**, bundlé par **Vite**
- **Tailwind CSS v4**, **Framer Motion**, **Lucide React**, **HLS.js**
- **TanStack Router** pour la navigation
- **Supabase** : authentification Discord (OAuth), base Postgres, RLS et fonctions SQL

---

## 📁 Structure

```
casino gta/
├── public/                      # Logo, visuels des lots, photos du casino
├── src/
│   ├── components/
│   │   ├── Hero, Discovery, Mission, Architecture, Gallery, CtaStream, Footer, Navbar
│   │   ├── WheelOfFortune.tsx   # Page /roue-de-la-fortune
│   │   ├── wheel/Wheel.tsx      # Roue SVG
│   │   ├── GamesCatalog.tsx     # Page /jeux
│   │   ├── VipSubscriptions.tsx # Page /abonnements
│   │   ├── MemberPortal.tsx     # Page /espace-membre
│   │   ├── AdminConsole.tsx     # Pages /admin et /dev (gérance)
│   │   └── CitizenProfileSheet.tsx
│   ├── context/
│   │   ├── CasinoUserContext.tsx   # Session Discord + profil joueur (source : Supabase)
│   │   └── CasinoAdminContext.tsx  # Réglages roue/économie + outils de gérance
│   ├── lib/
│   │   ├── supabase.ts          # Client + appels RPC typés
│   │   ├── discord.ts           # OAuth Discord, avatars
│   │   └── security.ts          # Validation / nettoyage des saisies
│   └── router.tsx
├── supabase/migrations/         # Migrations appliquées au projet Supabase
├── supabase_schema.sql          # Schéma complet pour un projet Supabase neuf
└── verify_suite.ts              # Tests (npm test)
```

---

## 🔐 Modèle de sécurité

Le navigateur n'est **jamais** source de vérité pour l'argent ou les droits :

- Chaque profil est lié à un compte **Supabase Auth (Discord)**. Il n'existe aucune connexion « par numéro citoyen » ni de compte de secours.
- Les tables sont protégées par **RLS** : un joueur ne lit que ses propres données, un visiteur anonyme ne lit que les réglages publics de la roue.
- Aucune écriture directe dans `profiles` : tout passe par des fonctions SQL `SECURITY DEFINER` qui vérifient l'identité et le rôle :
  - joueur : `get_my_profile`, `register_profile`, `update_my_profile`, `spin_wheel`, `request_vip`
  - public : `recent_wheel_wins`, `subscribe_events`
  - gérance : `admin_update_profile`, `admin_adjust_balance`, `admin_reset_cooldown`, `admin_set_vip`, `admin_reject_vip_request`, `admin_delete_profile`
- Le **tirage de la roue est calculé par le serveur** (probabilités, cooldown, avantage VIP) puis animé côté client.
- Les **cartes VIP** sont des demandes : la gérance les valide dans la console après paiement.
- Les droits de gérance viennent uniquement de la colonne `profiles.role` (`FONDATEUR`, `DÉVELOPPEUR`, `DIRECTEUR CASINO`).

Donner les droits de gérance à un compte (SQL Editor Supabase) :

```sql
update public.profiles set role = 'FONDATEUR' where discord_id = '<ID_DISCORD>';
```

---

## 🚀 Démarrage

```bash
npm install
```

Copier `.env.example` en `.env` (URL et clé publishable du projet Supabase), puis :

```bash
npm run dev
```

Autres commandes :

```bash
npm run build
```

```bash
npm test
```

Les tests vérifient la validation des saisies et, en direct contre Supabase, qu'un visiteur anonyme ne peut ni lire ni modifier les données protégées.

### Nouveau projet Supabase

1. Exécuter `supabase_schema.sql` dans le SQL Editor.
2. Activer le provider **Discord** (Authentication > Providers) et ajouter `https://<votre-domaine>/espace-membre` aux URL de redirection.

---

## 🛡️ Droits

© 2026 The Diamond Casino & Resort. Tous droits réservés.
