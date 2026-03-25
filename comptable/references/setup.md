# Setup guidé (première utilisation)

Ce setup se lance uniquement si `company.json` n'existe pas à la racine du projet. Il crée le fichier étape par étape.

**Principe : inférer un maximum, demander un minimum.** L'API SIRENE donne presque tout. Ne poser que les questions dont la réponse n'est pas déductible.

## Étape 1 : Identifier la société

Demander :

> Quel est le **nom de votre société** ?

Lancer la recherche :

```bash
python scripts/fetch_company.py "<nom ou SIREN>" --json
```

**Si plusieurs résultats** : afficher la liste (nom, SIREN, ville, date de création) et demander laquelle est la bonne.

**Si un seul résultat** : afficher les informations et demander confirmation.

**Si aucun résultat** : demander manuellement (raison sociale, SIREN, forme juridique, adresse, code NAF).

### Données pré-remplies automatiquement depuis l'API

Après confirmation, les champs suivants sont remplis sans rien demander :

- **Raison sociale, SIREN, SIRET, adresse, code NAF** : directement depuis l'API
- **Dirigeant** : l'API renvoie les dirigeants, utiliser le premier. Titre déduit de la forme juridique (Président pour SAS/SASU, Gérant pour SARL/EURL)
- **Régime d'imposition** : IS par défaut pour SAS, SASU, SARL, SA. IR par défaut pour EI, EIRL, auto-entrepreneur. Mentionner le défaut choisi, l'utilisateur corrigera si besoin.
- **Premier exercice** : si `date_creation` < 2 ans, c'est probablement le premier exercice. Le mentionner.
- **Dates d'exercice** : premier exercice = date de création → 31/12 de l'année suivante (ou de l'année en cours si créé en janvier). Exercices suivants = 01/01 → 31/12. Proposer ces dates par défaut, l'utilisateur ajuste si besoin.

## Étape 2 : Régime TVA

C'est la seule information fiscale qu'on ne peut pas déduire. Demander :

> Quel est votre **régime TVA** ?

Proposer les options :
- Franchise en base (pas de TVA facturée)
- Réel simplifié (déclaration annuelle CA12)
- Réel normal (déclaration mensuelle CA3)

## Étape 3 : Banque

> Utilisez-vous **Qonto** comme banque professionnelle ?

**Si oui** :
- Mettre `qonto.enabled` à `true` dans `company.json`
- Expliquer : "Pour connecter Qonto, définissez deux variables d'environnement (dashboard Qonto > **Settings > Integrations > API**) :"
  ```
  export QONTO_ID="votre-slug-organisation"
  export QONTO_API_SECRET="votre-cle-secrete"
  ```

**Si non** : demander le nom de la banque principale (pour le libellé du compte 512).

## Étape 4 : Paiements en ligne

> Utilisez-vous **Stripe** pour encaisser des paiements ?

**Si oui** :

> Combien de **comptes Stripe** avez-vous ? (un seul / plusieurs comptes séparés / Stripe Connect)
> Pour chaque compte, quel **nom** voulez-vous lui donner ? (ex: "Mon SaaS", "Ma Boutique")

Configurer une entrée par compte dans `stripe_accounts` avec `id`, `name`, `env_key`. Expliquer :
- "Définissez la variable d'environnement avec votre clé secrète (dashboard Stripe > **Developers > API keys**) :"
  ```
  export STRIPE_SECRET="sk_live_..."
  ```
- Pour Stripe Connect, demander aussi le `stripe_account_id` (`acct_xxx`) de chaque sous-compte.

**Si non** : laisser `stripe_accounts` vide (`[]`).

## Étape 5 : Récapitulatif et génération

Afficher un récapitulatif complet de tout ce qui a été collecté et inféré. Marquer clairement ce qui a été déduit pour que l'utilisateur puisse corriger :

```
Société configurée :
  Raison sociale : [nom]
  Forme juridique : [forme]
  SIREN : [siren]
  Dirigeant : [nom] ([titre déduit])
  Régime TVA : [regime]
  Régime imposition : [IS/IR] (déduit de la forme juridique)
  Exercice : [debut] > [fin] (déduit de la date de création)
  Premier exercice : [oui/non]
  Banque : [Qonto / autre]
  Stripe : [X compte(s) configuré(s) / non]
```

> **Quelque chose à corriger ?** Sinon je génère le fichier `company.json`.

Générer `company.json`, puis passer au workflow normal (vérification des échéances).
