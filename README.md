# Nihongo N4

Site statique de révision des mots N5 et N4. Les associations de kanji se consultent dans une fiche qui s’ouvre au-dessus de la page, sans perdre sa position. Le suivi fonctionne sans compte sur l’appareil utilisé. Une connexion facultative par code e-mail synchronise la progression entre appareils avec Supabase.

Le site est aussi une PWA : une fois chargé sur HTTPS, il peut être installé sur le téléphone. Les fichiers essentiels et le vocabulaire sont mis en cache pour la révision hors ligne. La progression d’un compte connecté reste utilisable hors ligne sur cet appareil et se synchronise au retour du réseau. L’icône reprend le petit `日` du logo, dans une palette violette sobre.

## Comptes et synchronisation

- Le compte est facultatif. Sans compte, les mots acquis restent dans `localStorage` sous `nihongo-n4-progress-v1`.
- Après connexion, les mots sont enregistrés localement par identifiant de compte. Les modifications en attente sont conservées dans une file locale et envoyées à Supabase dès que la connexion revient.
- À la première connexion d’un compte sur un appareil, les mots marqués en mode invité sont ajoutés à la progression du compte. Les changements ultérieurs d’un compte sont séparés de ceux du mode invité.
- Une session est mémorisée localement avec son jeton de renouvellement. Effacer les données du site supprime la session et les changements hors ligne non synchronisés ; la progression déjà synchronisée reste dans Supabase.
- Les changements concurrents sur un même mot sont résolus par la dernière synchronisation qui arrive au serveur. L’application n’affiche « Progression synchronisée » qu’après réception des données et envoi des changements en attente.

Le code utilise uniquement l’URL du projet et la clé **publishable** de Supabase. La clé Resend et toute clé Supabase `service_role` ou `secret` restent hors du dépôt. La table `public.word_progress` doit avoir ses politiques RLS limitées à `auth.uid() = user_id` pour `select`, `insert` et `update`. La configuration SMTP Resend et les modèles d’e-mail avec `{{ .Token }}` se font dans le tableau de bord Supabase.

## Lancer en local

Node.js 20 ou plus récent suffit :

```sh
npm start
```

Ouvrir `http://127.0.0.1:4173`. L’ouverture directe de `index.html` en `file://` ne charge pas le JSON à cause des règles du navigateur.

## Vérifier

```sh
npm test
```

## Déployer sur Vercel

1. Importer le dépôt GitHub dans Vercel.
2. Choisir **Other** comme framework. Aucun build n’est nécessaire ; laisser la commande de build et le répertoire de sortie vides.
3. Ajouter `nihongo.charlamasy.site` dans les domaines du projet Vercel.
4. Créer l’enregistrement DNS indiqué par Vercel chez le fournisseur DNS du domaine, puis vérifier le statut du domaine dans Vercel.

Le fichier `vercel.json` ajoute une politique CSP et des en-têtes de sécurité. Le site ne contient aucun secret ni code côté serveur ; le navigateur communique directement avec Supabase, et les politiques RLS protègent les lignes de progression. Les entrées du JSON et les données de compte sont insérées dans la page avec `textContent`, sans interprétation HTML.

## Installer sur mobile

- **Android / Chrome** : ouvrir `https://nihongo.charlamasy.site`, attendre que la page charge, puis utiliser le bouton « Installer l’application » si disponible. Sinon, ouvrir le menu ⋮ et choisir « Installer l’application » ou « Installer et créer un raccourci ».
- **iPhone / Safari** : ouvrir le site dans Safari, toucher Partager, puis « Sur l’écran d’accueil ».

Le bouton d’installation apparaît uniquement lorsque le navigateur propose l’installation native. Après un déploiement, une ancienne version déjà en cache peut nécessiter une fermeture puis une réouverture de l’application.

## Sources et licence

Les 1 304 entrées (674 N5 et 630 N4) proviennent de [OpenJLPT](https://github.com/evanclan/OpenJLPT), sous licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Les niveaux sont indicatifs : le JLPT ne publie pas de listes officielles exhaustives. Les traductions françaises prioritaires et l’interface sont adaptées pour ce projet sous CC BY-SA 4.0. Aucun exemple Tatoeba n’est repris.
