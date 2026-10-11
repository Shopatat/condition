# Condition

Pomodoro sans chiffres : un électrocardiogramme façon Resident Evil passe de **Ok** (vert) à **Attention** (orange) puis à **Danger** (rouge) à mesure que la session avance.
Appli web sans installation : du HTML, du CSS et du JavaScript, rien à compiler.

## Mettre l'appli en ligne avec GitHub Pages

1. Crée un nouveau dépôt sur GitHub (par exemple `condition`).
2. Envoie tous les fichiers de ce dossier à la racine du dépôt (`index.html` doit être à la racine).
3. Dans le dépôt : **Settings → Pages**, source **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
4. Au bout d'une minute ou deux, l'appli est dispo sur `https://<ton-pseudo>.github.io/condition/`.

## L'installer sur l'iPhone

Ouvre l'adresse dans **Safari**, touche **Partager**, puis **Sur l'écran d'accueil**.
L'appli s'ouvre alors en plein écran avec son icône, et marche hors ligne après la première ouverture.

Bon à savoir : quand l'appli passe en arrière-plan, l'iPhone la met en veille. Le temps continue de compter
(au retour, la courbe est à jour, même si l'iPhone a fermé l'appli), mais les sons ne retentissent
que si l'appli est ouverte. L'écran reste allumé pendant une session tant que l'appli est au premier plan.

## Comment ça marche

- Pendant une session, il ne reste que la courbe et l'état en bas à droite. Touche l'écran pour retrouver les commandes quelques secondes.
- À la fin de la concentration, Danger reste affiché et clignote jusqu'à ce que tu prennes ta pause.
- Une pause prise en avance est raccourcie d'autant : arrêter à la moitié de la session donne la moitié de la pause.
- Deux versions de l'écran, au choix dans les réglages :
  1. **Moniteur** : un point lumineux balaie un écran noir, l'état est écrit en bas à droite.
  2. **Enregistreur (REmake)** : l'écran de statut de Resident Evil REmake, appareil et interface compris. Fiole verte, cadran perforé, stylet qui trace sur du papier qui défile, état gravé sur la plaque.
- Le mode démo (dans les réglages) fait passer une minute en une seconde, pratique pour tout voir d'un coup.

## Organisation des fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page et la structure de l'interface |
| `css/style.css` | Tout le style (moniteur, vue épurée, alerte Danger) |
| `js/app.js` | Toute la logique : minuteur invisible, tracé de l'ECG, sons, réglages |
| `sw.js` | Service worker : met l'appli en cache pour le hors ligne |
| `manifest.webmanifest` | Nom, couleurs et icônes pour l'écran d'accueil |
| `fonts/` | Les polices, embarquées pour marcher hors ligne : Libre Caslon Text et Share Tech Mono (version 1), Sorts Mill Goudy et Gelasio (version 2) |
| `icons/` | Les icônes, générées par `node outils/icones.js` |

## Après une modification

Change la valeur de `VERSION` en haut de `sw.js` (par exemple `condition-v2`).
Sans ça, les téléphones qui ont déjà l'appli continuent d'afficher l'ancienne version.

## Tester sur l'ordinateur

Le mode hors ligne ne marche pas en ouvrant `index.html` directement (adresse en `file://`).
Pour tout tester, lance un petit serveur dans le dossier : `npx serve`, puis ouvre l'adresse affichée.
