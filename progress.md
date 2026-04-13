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
- 2026-04-13: reproduction mobile du bug blackjack via navigateur permissif local + API distante.
- Constat blackjack 2026-04-13: `joinBlackjackRoom()` annonçait un salon solo (`playerCount: 1`), mais `fetchBlackjackRoomState()` renvoyait quand même la manche active d'un autre joueur (`selfSeatId: null`, `playerCards: []`, `activeSeatId: "1"`).
- Cause front 2026-04-13: la room sync appliquait cet état partagé même hors mode live, puis le rendu "déduisait" à tort une main héro depuis le siège actif adverse.
- Correctif 2026-04-13: le front ne consomme plus l'état partagé blackjack tant qu'aucune vraie partie live n'est requise, n'infère plus la main héro depuis un siège tiers, et masque les placeholders vides bleutés sur mobile.
- Garde-fou 2026-04-13: `start` / `action` n'appliquent plus au front une manche étrangère renvoyée par le backend; une erreur explicite est affichée à la place.
- Ajustement 2026-04-13: suppression de toute copie "Observation" dans le blackjack.
- Ajustement 2026-04-13: si une seule vraie place joueur est occupée face au croupier, cette main est maintenant recentrée au siège principal au lieu d'etre dessinée en latéral.
- Roulette:
  - Corrigé le "snap" visuel de fin de spin: la roue reste maintenant sur sa rotation continue au lieu de revenir à un angle court normalisé.
  - Le déclenchement du spin utilise désormais `resolvedAt` quand Railway le fournit, avec rattrapage temporel côté front si le polling reçoit le résultat en retard.
  - Fallback corrigé: si `resolvedAt` est absent, le spin démarre immédiatement au lieu d'attendre artificiellement 2 minutes.
  - Agrandissement de la mini roulette mobile dans la colonne droite.
  - Vérification build: `npm run build` OK.
  - Vérification preview locale: capture mobile roulette réussie dans `playtest-out-codex/roulette-mobile-after-fix-2.png`.
  - Limite restante: je n'ai pas pu forcer un vrai tour Railway jusqu'au changement de numéro pendant ce passage, donc l'atterrissage exact du spin sur un résultat live backend reste à confirmer en condition réelle.
- 2026-04-13: le lancement blackjack ne s'arrete plus au premier salon vide; il essaie maintenant les autres salons libres jusqu'a trouver une vraie manche hero, car at-parlor pouvait encore renvoyer une manche etrangere alors que scream-lounge etait jouable.
- 2026-04-13: le polling blackjack n'ecrase plus une vraie main hero par un state partage vide; on ignore maintenant les syncs backend sans cartes si le front tient deja une main locale valide.
- 2026-04-13: verification finale mobile OK sur le flux blackjack. Depuis un salon bloque par une manche etrangere, Defier rebascule sur un salon jouable, affiche bien les cartes hero, et le placeholder lateral bleu ne reparaît plus.
- 2026-04-13: split blackjack compacté sur mobile. Les deux mains passent en colonnes jumelles avec cartes, bannières et badges de résultat plus compacts, et le badge global hero est masqué en split pour ne plus remonter dans la zone du croupier.
- 2026-04-13: correctif poker mobile. Les sièges adverses utilisent maintenant un mapping robuste `participants <-> seats` avec fallback sur les sièges backend orphelins, donc les noms/états (`jj`, `jeff`, `Tour actif`, etc.) réapparaissent sur la table au lieu de cartes flottantes anonymes.
- 2026-04-13: garde-fou poker. Les actions front (`fold`, `check`, `call`, `bet`, `raise`) ne partent plus quand ce n'est pas le tour du hero; la sidebar verrouille aussi les boutons et le curseur hors décision pour éviter les erreurs `not_your_turn`.
- 2026-04-13: verification poker OK en preview locale mobile apres rebuild. Capture validee dans `output/playwright/poker-repair-mobile-fullpage.png`; les headers de sièges poker sont bien rendus (`display: flex`) et le salon externe n'affiche plus que `Rejoindre ailleurs`.
- 2026-04-13: nettoyage poker supplementaire. Les participants "en attente" ne sont plus rendus comme faux sièges au milieu du feutre pendant une main en cours; seuls les sièges vraiment engages dans le coup restent sur la table.
- 2026-04-13: nettoyage poker supplementaire. En mode spectateur, le siège hero n'est plus rendu en fantome sur la table; si le backend expose mal le self seat, on garde quand meme un fallback via le siège self detecte.
- 2026-04-13: verification poker mobile finale OK en preview locale (`output/playwright/poker-repair-mobile-v4-fullpage.png`). La table spectateur affiche seulement `jj` et `jeff`, plus aucun bloc "Attend la prochaine donne", et le siège actif est libellé `Tour actif`.
