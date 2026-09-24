# Sodobat — Base de prix d'ouvrages

Application interne de consultation des prix d'ouvrages, construite à partir
des devis et factures réels de Sodobat. Next.js 15 (App Router, TypeScript
strict), Postgres (Supabase en production), Tailwind 4, TanStack Table,
Recharts, extraction OpenAI, assistant Anthropic à outils typés.

« Combien a-t-on facturé ça la dernière fois ? Et ce chiffre est-il fiable ? »

Guide utilisateur (métreurs et direction) : [docs/GUIDE.md](docs/GUIDE.md).

## Écrans

| Route | Contenu | Accès |
|---|---|---|
| `/` | Tableau des prix : recherche floue, filtres, rail des lots, réglettes de dispersion, export CSV. Clic sur une ligne → fiche ouvrage (prix vedette, normaux/TS, zones, évolution, effet quantité, co-occurrences, lignes sources avec lien vers la pièce d'origine). Les ouvrages sans ligne validée sont masqués par défaut. | tous |
| `/historique` | Tous les documents et lignes, verbatim, sans moyenne. Par pièce ou par ligne. Recherche client tolérante aux fautes. | tous |
| `/chat` | Assistant. Outils typés uniquement, jamais de SQL généré. Chaque prix cité avec son `n` et sa période, sources affichées. | tous |
| `/calage` | Six onglets : **Par ouvrage** (validation en masse), **Ligne à ligne** (V / M / N / →), **Documents à revoir** (accepter, rejeter, TS), **Doublons** (fusions proposées), **Sans ouvrage** (rattacher ou créer), **Référentiel** (éditer, fusionner). **Z** annule le dernier geste. | admin |
| `/import` | Dépôt de pièces (PDF, XLS, XLSX, ODS), flux d'import, reprise des échecs et des imports bloqués. | admin |
| `/connexion` | Un champ code d'accès. | — |

## Principe

1. **Import** : chaque pièce est archivée dans Supabase Storage, lue par
   `gpt-5-mini`, contrôlée (quantité × PU = total ligne ; somme des lignes =
   total imprimé) puis insérée. Une pièce dont le total ne tombe pas juste
   passe « à revoir ».
2. **Rattachement** : chaque ligne reçoit une proposition d'ouvrage (règle
   de similarité, sinon regroupement par l'IA qui peut créer l'ouvrage).
3. **Calage** : un humain valide (ou l'auto-validation quand l'IA est sûre).
4. **Prix** : une ligne compte dès qu'elle est validée, que sa pièce n'est
   pas rejetée et que son arithmétique est juste (`controle_ligne <> 'ecart'`).
   Statistiques calculées à la volée sur `v_lignes_agregables`
   (`db/02_agregats.sql`, règle mise à jour dans `db/05_calage.sql`) : médiane,
   quartiles, n, fiabilité.

## Rôles et codes d'accès

Pas de comptes : un code d'accès par personne, haché en base (table `acces`).
`--admin` ouvre `/calage` et `/import`. Ne jamais écrire un code dans le
dépôt ni dans un document partagé.

```bash
npm run db:acces -- "Métreur référent" <code>
npm run db:acces -- --admin "Direction" <code>
```

Révocation : `update acces set actif = false where libelle = '…'`.

## Démarrage local

Prérequis : Node 20+. La base locale tourne via `embedded-postgres`
(aucun Docker, aucun Postgres système).

```bash
npm install
cp .env.example .env.local     # remplir (voir ci-dessous)

npm run db:local               # 1. base locale (laisser tourner)
npm run db:migrate             # 2. schéma + vues (db/*.sql, dans l'ordre)
npm run db:seed                # 3. jeu de démonstration (LOCAL UNIQUEMENT)
npm run db:acces -- --admin "Direction" <code>
npm run dev                    # 4. application
```

`.env.local` (voir `.env.example` pour le détail) : `DATABASE_URL`,
`SESSION_SECRET`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`,
`EXTRACTION_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

⚠️ `db:seed` et `db:reset-donnees` **détruisent les données**. Ils ne
s'utilisent que sur la base locale. Si `.env.local` pointe sur Supabase,
préfixer explicitement :
`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5502/sodobat npm run db:seed`.

## Vérifications

```bash
# tests de requêtes et de calage : base LOCALE seedée uniquement (écritures)
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5502/sodobat npm test

npx tsc --noEmit                      # typage
npm run build                         # build de production
npx tsx scripts/verif-pages.ts 3000   # parcourt toutes les pages protégées
```

## Import et calage des pièces réelles

```bash
# Import d'un dossier (Batch API OpenAI, reprenable, doublons ignorés par hash)
npm run import -- chemin/vers/dossier

# Rattachement des lignes encore sans proposition (idempotent)
npm run rattacher -- --avec-prix

# Propositions de fusion des quasi-doublons du référentiel (revue dans /calage → Doublons)
npm run proposer-fusions -- --dry-run
npm run proposer-fusions

# Auto-validation des propositions sûres (annulable depuis /calage)
npm run auto-valider -- --dry-run
npm run auto-valider
npm run auto-valider -- --llm --dry-run   # vérification par ouvrage via le modèle
npm run auto-valider -- --llm
```

Les fichiers de plus de 4 Mo ne passent pas par l'écran `/import` sur Vercel
(limite de corps des fonctions) : les importer avec `npm run import`.

Après tout import ou calage en ligne de commande, les agrégats sont
rafraîchis par le script lui-même (`rafraichir_agregats()`).

## Mise en production (Vercel + Supabase)

### 1. Supabase

Projet en région européenne. Extensions `pgcrypto`, `pg_trgm`, `unaccent`,
`vector` (activées par `db/00_prelude.sql`). Bucket Storage privé `documents`.

Schéma : depuis un poste ayant la chaîne de connexion **directe**
(Dashboard → Connect → Direct connection, port 5432) :

```bash
DATABASE_URL="postgresql://postgres:<mdp>@db.<ref>.supabase.co:5432/postgres" npm run db:migrate
```

Le script applique `db/00…05_*.sql` dans l'ordre et mémorise ceux déjà
passés (`_migrations`).

### 2. Vercel

1. Pousser le dépôt sur GitHub, Vercel → **Add New Project** → importer.
   Framework détecté : Next.js, aucun réglage de build à changer. Région
   des fonctions : Paris ou Francfort (proche de Supabase).
2. **Environment Variables** (Production) :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | URL **pooler** Supabase, mode *Transaction*, port 6543 (`prepare: false` déjà configuré côté client). |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé `service_role` (jamais côté navigateur) |
   | `SESSION_SECRET` | `openssl rand -base64 32` — différent de celui du dev |
   | `ANTHROPIC_API_KEY` | clé de production |
   | `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
   | `OPENAI_API_KEY` | clé de production |
   | `EXTRACTION_MODEL` | `gpt-5-mini` |

3. `app/import/page.tsx` déclare `maxDuration = 300` : plan Pro requis pour
   les grosses extractions (Hobby plafonne à 60 s ; importer en local sinon).
4. Deploy, puis vérifier :
   - `/` redirige vers `/connexion` sans session ;
   - connexion avec un code créé via `db:acces` ;
   - un code métreur n'accède pas à `/calage` ;
   - fiche ouvrage → « Pièce » ouvre le fichier (redirection signée) ;
   - onglet réseau : aucun appel direct à `supabase.co` depuis le navigateur ;
   - le chat répond et cite ses sources ; l'export CSV télécharge.

### Notes d'architecture

- **Un seul chemin vers la donnée** : `lib/queries/` (server-only), consommé
  par les Server Components, les Server Actions et les outils du chat.
- **Aucune statistique stockée en colonne** : vues de `db/02_agregats.sql`.
  Après chaque écriture (calage, exclusion, fusion), `rafraichir_agregats()`.
- **Journal de calage** (`calage_journal`) : chaque geste est enregistré
  avec l'état précédent ; `annulerDerniereAction()` le défait (touche Z).
- **Sessions** : cookie `httpOnly` signé (HS256, 30 jours), middleware sur
  toutes les routes sauf `/connexion` ; les actions serveur revérifient
  `exigerAdmin()` (`lib/session-serveur.ts`).
- **Pièces d'origine** : servies par `/api/documents/:id/fichier` (lien
  signé Storage, 1 h). Rien dans `public/`.
- **Index BT01** : `index_prix` est à 1,0 (neutre) tant que l'index réel
  n'est pas chargé ; « prix actualisés » = « prix bruts » jusque-là.
- **Base locale** : `embedded-postgres` dans `.pgdata/` (ignoré par git),
  sans pgvector (`scripts/migrate.ts` adapte `vector(1536)` → `text`).
