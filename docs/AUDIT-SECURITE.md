# Audit de sécurité — Diamond Casino (6 octobre 2026)

Audit fait **sur la vraie base Supabase en ligne** (projet `njnznzgcjsdomahviukl`), sur la fonction serveur `slot-round` et sur le code du site.

## Verdict

**Le site est solide.** Aucun joueur ne peut tricher sur les jetons depuis son navigateur : tout l'argent passe par le serveur.
**Il reste 1 problème à corriger avant l'ouverture**, côté staff (voir P1), et quelques points de rangement.

---

## 1. Comment tout fonctionne ensemble

```
 NAVIGATEUR (site React)            SERVEUR (Supabase)                         BASE DE DONNÉES
 ─────────────────────────          ─────────────────────────────              ──────────────────
 Connexion Discord ───────────────► Supabase Auth (jeton de session)
 Jeux Mines / Crash / Roue ───────► fonctions SQL  mines_* crash_* spin_wheel ─► profiles.chips
 Boosters / Collections ──────────► open_booster, open_collection_pack ───────► player_rewards
 Machines à sous (Dog House,  ────► Edge Function « slot-round »                collection_owned
   Wanted)                            (tirage + clé secrète service_role) ────► bets_history
 Inventaire / revente ────────────► sell_rewards, sell_collection_cards ──────► casino_transactions
 Console admin (/admin, /dev) ────► fonctions admin_* (vérifient le rôle) ────► admin_logs
                                                                               casino_settings
```

- **Le navigateur ne fait qu'animer.** Il envoie « je mise X » ; le serveur tire le résultat avec un aléa cryptographique, débite, crédite et renvoie le résultat.
- **Les tables sont verrouillées (RLS).** Un joueur ne peut *rien écrire* directement, et ne lit que ses propres données.
- **Les réglages admin (RTP, mises max, prix…)** sont stockés dans `casino_settings` et **bornés côté serveur** : même un admin ne peut pas mettre un jeu au-dessus de 99,5 % de RTP, ni rendre la roue / les boosters / les collections perdants pour le casino (le serveur refuse).
- **Les rôles** : `DÉVELOPPEUR` > `FONDATEUR` > `DIRECTEUR CASINO` > `MEMBRE`. Seule la colonne `profiles.role` compte ; cacher/afficher la console côté site n'est que visuel.

---

## 2. Ce qui a été vérifié ✅

| Point | Résultat |
|---|---|
| RLS activé sur **toutes** les tables | ✅ 47/47 |
| Écriture directe dans une table (visiteur ou joueur) | ✅ impossible (aucune règle d'écriture) |
| 33 fonctions `admin_*` | ✅ toutes appellent `assert_staff()` en premier |
| Fonctions sensibles `settle_slot_round` / `settle_voucher_round` | ✅ appelables **uniquement** par le serveur (clé secrète) |
| Toutes les fonctions SQL ont `search_path` verrouillé | ✅ |
| Mines : grille cachée au joueur, preuve (hash) publiée avant | ✅ |
| Crash : point de crash caché tant que la manche tourne, temps mesuré par le serveur | ✅ |
| Double-clic / requêtes en parallèle (dépenser 2× les mêmes jetons, utiliser 2× un bon) | ✅ bloqué (verrou `FOR UPDATE` sur le profil / le bon) |
| Mise négative, mise hors limites, gain > plafond | ✅ refusé par le serveur |
| Un lot revendu ne peut pas revenir en inventaire | ✅ (trigger `player_rewards_sold_lock`) |
| Un DIRECTEUR ne peut pas se créditer lui-même / changer son rôle / toucher un FONDATEUR | ✅ (sauf P1) |
| Faille XSS dans le site (`innerHTML`, `eval`…) | ✅ aucune |
| Clé secrète dans le code du site | ✅ non (seule la clé publique, normale) |
| `.env` dans git | ✅ ignoré |
| Moteurs des machines identiques site ↔ serveur | ✅ |
| `tsc`, `npm test` (95 tests, dont les tests de sécurité en direct) | ✅ tout passe |

> **Les ~68 avertissements Supabase « SECURITY DEFINER executable »** sont **normaux** : c'est l'architecture voulue (les joueurs passent par des fonctions qui vérifient tout). Chacune a été relue. Tu peux les ignorer.
> **« Leaked password protection »** : sans objet, la connexion se fait uniquement par Discord.

---

## 3. À corriger ⚠️ (par priorité)

### P1 — MOYEN — ✅ CORRIGÉ le 6/10 — Un DIRECTEUR CASINO pouvait se fabriquer des jetons
`admin_update_reward` (bouton « remettre en inventaire » d'un lot) n'a **pas** les protections des autres fonctions admin :
- il peut remettre un **bon de bonus** ou un **booster de collection** déjà **utilisé** en inventaire → le rejouer à l'infini = jetons gratuits ;
- il peut le faire **sur son propre compte** (la règle « pas d'auto-crédit » est contournée) ;
- il peut retirer / modifier les lots d'un FONDATEUR ou DÉVELOPPEUR.

Aujourd'hui il n'y a aucun DIRECTEUR (seulement toi et un dev), donc pas d'abus possible pour l'instant — **mais à corriger avant de nommer un directeur.**
Correctif : interdire `USED → IN_INVENTORY` pour les bons/boosters, ajouter `assert_can_manage` + `assert_not_self_credit`.

### P2 — FAIBLE — ✅ CORRIGÉ (déplacées dans le schéma privé `backups`) — 25 tables de sauvegarde avec données perso dans le schéma public
`bak_20261001_*`, `bak_20261005_*`, `wipe_backup_*` contiennent profils, historique, transactions. Elles sont protégées (RLS sans règle = personne ne lit), mais une erreur de manip future les exposerait. → Les supprimer quand tu es sûr de ne plus en avoir besoin.

### P3 — FAIBLE — ✅ CORRIGÉ (30 inscriptions/heure max) — Inscription e-mail aux événements sans limite
`subscribe_events` est ouverte aux visiteurs sans compte : quelqu'un peut remplir la table avec des millions d'adresses. → Limiter (compte requis, ou plafond).

### P4 — FAIBLE — ✅ CORRIGÉ (conservation passée à 90 jours) — Historique effacé après 30 jours
Tâche automatique `purge-old-history` chaque nuit. En cas de litige avec un joueur après 30 jours, plus de preuve (le journal admin, lui, est conservé). → Choisir la durée en connaissance de cause, ou exporter avant (bouton export de la console).

### P5 — INFO — ✅ CORRIGÉ (CSP ajoutée dans vercel.json, testée) — En-tête Content-Security-Policy
`vercel.json` a déjà les bons en-têtes de base. Une CSP ajouterait une couche contre l'injection de scripts.

### P6 — INFO — ✅ CORRIGÉ (npm audit : 0 vulnérabilité) — Dépendance de build
`npm audit` : 1 alerte dans `source-map-js` (outil de compilation, pas envoyé aux joueurs). → `npm audit fix`.

### P7 — INFO — Noms de migrations différents entre le dépôt et la base
Plusieurs migrations ont été appliquées en ligne sous d'autres noms (ex. `reward_sold_lock`, `collection_hard_mode_7m`) puis regroupées dans les fichiers du dépôt. Le contenu est bien présent, mais `supabase db push` ne s'y retrouverait pas. Ne pose problème que si tu recrées la base de zéro.

### Rappel (par conception, pas un bug)
Un membre du staff peut créditer **les autres** joueurs (un ami par exemple). Tout est tracé dans le **Journal** de la console. Ne donne les rôles qu'à des gens de confiance et relis le journal.

---

## 4. Comment savoir si c'est « fini » ?

Un site comme celui-ci n'est jamais fini à 100 %, mais il est **prêt à ouvrir** quand toutes les cases sont cochées :

**Sécurité**
- [x] P1 corrigé (`admin_update_reward`)
- [x] Tables `bak_*` / `wipe_backup_*` sorties du schéma public (P2)
- [ ] Supabase > Authentication > Providers : **seul Discord activé** (Email désactivé, sinon multi-comptes)
- [ ] Supabase > Advisors > Security : **aucune ligne « ERROR »** (les WARN SECURITY DEFINER sont normaux)

**Ça marche**
- [x] `npm test` → `ALL TESTS PASSED` ✅ (OK aujourd'hui)
- [x] `npx tsc --noEmit` sans erreur ✅ (OK aujourd'hui)
- [ ] `npm run check:rtp` → RTP des machines dans les limites
- [ ] Fonction `slot-round` redéployée après chaque modif des moteurs (`npm run sync:edge` puis deploy)
- [ ] Test à la main avec un **compte MEMBRE** (pas staff) : chaque jeu, revente, collection, roue, VIP
- [ ] Test avec un **compte DIRECTEUR** : vérifier qu'il ne peut pas se créditer ni toucher un FONDATEUR

**Exploitation**
- [ ] Remise à zéro faite (`supabase/manual/wipe_to_zero.sql`) juste avant l'ouverture
- [x] Durée de conservation de l'historique : 90 jours (P4)
- [ ] Console admin > Tableau de bord : le casino est gagnant sur chaque jeu après quelques jours

Quand toutes les cases sont cochées → **c'est prêt.** Ensuite, refaire ce check (surtout `npm test` et Advisors) après chaque grosse modification.
