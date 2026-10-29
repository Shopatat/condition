# Avancement

## Objectif
Version 3 de l'écran : l'écran d'état de Resident Evil Zero (HD), d'après les trois enregistrements envoyés par Fabien le 29/10/2026 (OK, Attention jaune, Attention orange, Danger).

## Plan
1. Relevés image par image : balayage, extinction du trait, forme du battement par état, couleurs, texte. **Fait.**
2. Version 3 dans `js/app.js` (objet `zero`), réglage « 3 · Écran d'état (Zero) », habillage CSS `.theme-zero`. **Fait.**
3. Vérification en capture (quatre états, séquence animée, téléphone portrait, paysage, vue épurée), commit et push. **Fait (sw v13).**

## Relevés (unité s = hauteur de la vitre)
- Vitre 2,39 × 1 ; lignes vertes à 0,173 et 0,905 ; ligne de base à 0,558.
- Un passage par seconde, un seul battement, toujours au même endroit (pic principal à 0,368 de la largeur).
- Tête : 1,26 largeur/s jusqu'à 0,47, ralentit à 0,88 vers 0,55, arrive au bord à 0,96 s, attend, repart.
- Extinction : environ 0,9·(1 − âge/0,6)^1,1, chaque point à son rythme, même quand la tête est repartie (le bout droit s'éteint en 0,4 à 0,5 s après le retour à gauche), puis reflet très pâle (≈ 5 %).
- Formes : relevées colonne par colonne (milieu du trait) sur chaque passage, puis moyennées ; OK pris sur le passage le plus net. Stockées en millièmes de 0,17 à 0,70 tous les 0,005 (v15). Pic principal vers 0,36, creux vers 0,415.
- Épaisseur du trait dans le jeu : environ 0,04 de la hauteur de la vitre à mi-intensité.
- Les lignes vertes et « État » restent vertes dans tous les états.
- Couleurs (trait / mot) : OK sarcelle (22,135,102) / (80,148,100), jaune (172,182,58) / (178,186,78), orange (165,135,60) / (168,136,72), Danger (163,33,60) / (175,52,77).

## Décisions
- 60 bpm fixes comme dans le jeu, la forme et la couleur suivent l'avancement (mélange OKLab entre les quatre états relevés).
- Un seul écran (pas de portraits des personnages).
- Mot d'état dessiné dans le canevas (police Avenir Next de l'iPhone), `#status` gardé pour les lecteurs d'écran.

## Prochaine action
Retours de Fabien sur iPhone (police Avenir Next, taille de l'écran en portrait, grain de la peinture). Possible ensuite : reporter les vraies teintes jaune et orange de RE0 sur la version REmake si Fabien le souhaite.
