# Notes pour Claude Code

- Appli web perso, en français, pour Fabien. Interface et commentaires en français, tutoiement dans les textes.
- Pomodoro sans chiffres : le temps n'est jamais affiché, seul un ECG façon Resident Evil (Ok → Attention → Danger, couleurs continues vert → orange → rouge) indique où on en est. Né comme artifact claude.ai (« Condition Pomodoro », 10/10/2026), devenu appli iPhone.
- Pas de framework ni d'étape de build : HTML + CSS + JS classiques, servis tels quels par GitHub Pages, installés sur l'iPhone via Safari > Sur l'écran d'accueil.
- Choix déjà tranchés avec Fabien : état écrit en bas à droite de l'écran (pas dans le tracé, pas de clignotement au changement d'état) ; phase centrée en haut (Concentration / Pause / Longue pause) ; vue épurée pendant une session (courbe + état seulement, un toucher fait réapparaître le reste) ; à la fin, Danger reste et clignote sans pause forcée ; pause anticipée raccourcie au prorata ; pas d'herbes vertes ni d'arrêt cardiaque.
- Le minuteur utilise `Date.now()` et la session est sauvegardée dans `localStorage` : elle doit survivre à la mise en veille ou à la fermeture par iOS.
- À chaque changement de fichier, incrémenter `VERSION` dans `sw.js` et garder la liste `FILES` à jour.
- Icônes générées par `node outils/icones.js` (pas de module à installer).
- Tester sur mobile en portrait et en paysage (iPhone d'abord) : zones sûres (`env(safe-area-inset-*)`) et appli lancée depuis l'écran d'accueil.
- `references/` (captures du jeu, version artifact) reste en local, hors du dépôt.
