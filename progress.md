Original prompt: vérifie qu'au poker chaque joueurs à bien ses propres cartes et que c'est bien synchronisé en multi avec le backend, et au black jack rajoute les technique de black jack (split double etc)

- Inspection initiale: le front poker masquait complètement `aiSeats` avant rendu, donc les cartes/adversaires renvoyés par le backend n'étaient jamais affichés sur la table.
- Constat blackjack: le front ne connaissait que `hit` / `stand` et une seule main joueur. L'UI doit devenir compatible avec `double` / `split` et plusieurs mains, sans casser le payload legacy.
- Contraintes: le repo est déjà modifié sur plusieurs fichiers. Éviter d'écraser les changements existants hors zones poker/blackjack ciblées.
- Implémenté: le front poker réutilise maintenant `aiSeats` au rendu, masque les cartes adverses hors showdown, et garde les infos de mise/action visibles.
- Implémenté: le front blackjack accepte désormais des `legalActions` backend (`double`, `split`) et des `playerHands` multiples, avec rendu multi-main rétrocompatible.
- Vérification build: `npm run build` OK.
- Vérification navigateur live:
  `Poker`: deux comptes de test distincts ont bien reçu deux mains héro différentes, mais le backend renvoie encore des sièges `poker-ai-*` séparés par session et `/api/casino/poker/state?roomId=...` répond `404`. Donc le backend testé n'expose pas encore un vrai état partagé de room.
  `Blackjack`: le backend live testé ne renvoie pas encore `legalActions` ni `playerHands`; l'UI affiche bien `Doubler` / `Split` mais les garde désactivés tant que le serveur ne les autorise pas.
- Roulette:
  - Corrigé le "snap" visuel de fin de spin: la roue reste maintenant sur sa rotation continue au lieu de revenir à un angle court normalisé.
  - Le déclenchement du spin utilise désormais `resolvedAt` quand Railway le fournit, avec rattrapage temporel côté front si le polling reçoit le résultat en retard.
  - Fallback corrigé: si `resolvedAt` est absent, le spin démarre immédiatement au lieu d'attendre artificiellement 2 minutes.
  - Agrandissement de la mini roulette mobile dans la colonne droite.
  - Vérification build: `npm run build` OK.
  - Vérification preview locale: capture mobile roulette réussie dans `playtest-out-codex/roulette-mobile-after-fix-2.png`.
  - Limite restante: je n'ai pas pu forcer un vrai tour Railway jusqu'au changement de numéro pendant ce passage, donc l'atterrissage exact du spin sur un résultat live backend reste à confirmer en condition réelle.
