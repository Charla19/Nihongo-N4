# Nihongo N4

Site statique de révision des mots N5 et N4. Les associations de kanji se consultent dans une fiche qui s’ouvre au-dessus de la page, sans perdre sa position. Le suivi des mots acquis est enregistré dans `localStorage` sur l’appareil utilisé.

Le site est aussi une PWA : une fois chargé sur HTTPS, il peut être installé sur le téléphone. Les fichiers essentiels et le vocabulaire sont mis en cache pour la révision hors ligne. L’icône reprend le petit `日` du logo, dans une palette violette sobre.

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

Le fichier `vercel.json` ajoute une politique CSP et des en-têtes de sécurité. Le site ne contient aucun secret, formulaire, compte utilisateur ou code côté serveur. Les entrées du JSON sont insérées dans la page avec `textContent`, sans interprétation HTML. Le suivi est local à chaque navigateur et ne se synchronise pas entre appareils.

## Installer sur mobile

- **Android / Chrome** : ouvrir `https://nihongo.charlamasy.site`, attendre que la page charge, puis utiliser le bouton « Installer l’application » si disponible. Sinon, ouvrir le menu ⋮ et choisir « Installer l’application » ou « Installer et créer un raccourci ».
- **iPhone / Safari** : ouvrir le site dans Safari, toucher Partager, puis « Sur l’écran d’accueil ».

Le bouton d’installation apparaît uniquement lorsque le navigateur propose l’installation native. Après un déploiement, une ancienne version déjà en cache peut nécessiter une fermeture puis une réouverture de l’application.

## Sources et licence

Les 1 304 entrées (674 N5 et 630 N4) proviennent de [OpenJLPT](https://github.com/evanclan/OpenJLPT), sous licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Les niveaux sont indicatifs : le JLPT ne publie pas de listes officielles exhaustives. Les traductions françaises prioritaires et l’interface sont adaptées pour ce projet sous CC BY-SA 4.0. Aucun exemple Tatoeba n’est repris.
