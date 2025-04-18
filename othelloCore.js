const othelloCore = (() => {
  const EMPTY = 0n;
  const BLACK = 1n;
  const WHITE = -1n;
  const NORTH_WEST = -9n;
  const NORTH = -8n;
  const NORTH_EAST = -7n;
  const EAST = 1n;
  const SOUTH_EAST = 9n;
  const SOUTH = 8n;
  const SOUTH_WEST = 7n;
  const WEST = -1n;
  const DIRECTIONS = [NORTH_WEST, NORTH, NORTH_EAST, EAST, SOUTH_EAST, SOUTH, SOUTH_WEST, WEST];
  const NOT_A_COL = 0xfefefefefefefefen;
  const NOT_H_COL = 0x7f7f7f7f7f7f7f7fn;
  const DIRECTION_MASKS = {
    [NORTH_WEST]: NOT_H_COL,
    [NORTH]: 0xFFFFFFFFFFFFFFFFn,
    [NORTH_EAST]: NOT_A_COL,
    [EAST]: NOT_A_COL,
    [SOUTH_EAST]: NOT_A_COL,
    [SOUTH]: 0xFFFFFFFFFFFFFFFFn,
    [SOUTH_WEST]: NOT_H_COL,
    [WEST]: NOT_H_COL,
  };
  const WEIGHT_BOARD = [
    120, -20, 20,  5,  5, 20, -20, 120,
    -20, -40, -5, -5, -5, -5, -40, -20,
     20,  -5, 15,  3,  3, 15,  -5,  20,
      5,  -5,  3,  3,  3,  3,  -5,   5,
      5,  -5,  3,  3,  3,  3,  -5,   5,
     20,  -5, 15,  3,  3, 15,  -5,  20,
    -20, -40, -5, -5, -5, -5, -40, -20,
    120, -20, 20,  5,  5, 20, -20, 120
  ];
  const DIFFICULTY_DEPTH_MAP = {
    noob: 1,
    easy: 2,
    medium: 4,
    hard: 5,
    pro: 6,
    expert: 7
  };

  // Utilité pour déboguer
  const DEBUG = true;
  function log(...args) {
    if (DEBUG) console.log(...args);
  }

  function shift(bitboard, direction) {
    return direction > 0 ? bitboard << direction : bitboard >> -direction;
  };

  function countBits(n) {
    n = n - (n >> 1n & 0x5555555555555555n);
    n = (n & 0x3333333333333333n) + (n >> 2n & 0x3333333333333333n);
    n = (n + (n >> 4n)) & 0x0F0F0F0F0F0F0F0Fn;
    n = n * 0x0101010101010101n >> 56n & 255n;
    return Number(n);
  };

  function countPieces(gameState) {
    if (!gameState) {
      log("Erreur: gameState est undefined dans countPieces");
      return { blackCount: 0, whiteCount: 0 };
    }

    const { blackDiscs, whiteDiscs } = gameState;
    return {
      blackCount: countBits(blackDiscs),
      whiteCount: countBits(whiteDiscs)
    };
  }


  function bitPositions(bitboard) {
    const deBruijn64 = 0x03f79d71b4cb0a89n;
    const index64 = [
      0,   1, 48,  2, 57, 49, 28,  3,
      61, 58, 50, 42, 38, 29, 17,  4,
      62, 55, 59, 36, 53, 51, 43, 22,
      45, 39, 33, 30, 24, 18, 12,  5,
      63, 47, 56, 27, 60, 41, 37, 16,
      54, 35, 52, 21, 44, 32, 23, 11,
      46, 26, 40, 15, 34, 20, 31, 10,
      25, 14, 19,  9, 13,  8,  7,  6
    ];
    let positions = [];
    while (bitboard) {
        let bit = bitboard & -bitboard;
        let shift = Number(bit * deBruijn64 >> 58n & 63n);
        let index = index64[shift];
        positions.push(index);
        bitboard ^= bit;
    };
    return positions;
  };

  function getPlayerAndOpponentDiscs(blackDiscs, whiteDiscs, currentPlayer) {
    return {
      playerDiscs: currentPlayer === BLACK ? blackDiscs : whiteDiscs,
      opponentDiscs: currentPlayer === BLACK ? whiteDiscs : blackDiscs
    };
  };

  function createNewGame() {
    let blackDiscs = (1n << 28n) | (1n << 35n);
    let whiteDiscs = (1n << 27n) | (1n << 36n);
    return {
      blackDiscs,
      whiteDiscs,
      currentPlayer: BLACK
    };
  };

  function getValidMovesInDirection(playerDiscs, opponentDiscs, direction, edgeMask) {
    let candidates = shift(playerDiscs, direction) & opponentDiscs & edgeMask;
    if (candidates === 0n) return 0n;
    let temp = candidates;
    while (temp !== 0n) {
      temp = shift(temp, direction) & opponentDiscs & edgeMask;
      candidates |= temp;
    };
    return shift(candidates, direction) & ~(playerDiscs | opponentDiscs) & edgeMask;
  };

  function calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer) {
    const { playerDiscs, opponentDiscs } = getPlayerAndOpponentDiscs(blackDiscs, whiteDiscs, currentPlayer);
    return DIRECTIONS.reduce((validMovesBitboard, direction) =>
      validMovesBitboard | getValidMovesInDirection(
        playerDiscs,
        opponentDiscs,
        direction,
        DIRECTION_MASKS[direction]
      ), 0n);
  };

  // Capture de pions
  function captureInDirection(movePosition, playerDiscs, opponentDiscs, direction, edgeMask) {
    let capturedDiscs = 0n;
    let frontier = shift(movePosition, direction) & edgeMask;

    while (frontier !== 0n) {
      // Si on trouve un pion du joueur, on a terminé une ligne de capture
      if ((frontier & playerDiscs) !== 0n) return capturedDiscs;

      // Si on trouve une case vide, pas de capture dans cette direction
      if ((frontier & opponentDiscs) === 0n) return 0n;

      // Ajouter le pion adverse à ceux qui seront capturés
      capturedDiscs |= frontier;

      // Continuer dans la même direction
      frontier = shift(frontier, direction) & edgeMask;
    }

    // Si on atteint le bord sans trouver de pion du joueur, pas de capture
    return 0n;
  }

  // Mise à jour des états du plateau après un coup
  function updateBoards(blackDiscs, whiteDiscs, movePosition, capturedTotal, currentPlayer) {
    if (currentPlayer === BLACK) {
      return {
        blackDiscs: blackDiscs | movePosition | capturedTotal,
        whiteDiscs: whiteDiscs & ~capturedTotal
      };
    } else {
      return {
        blackDiscs: blackDiscs & ~capturedTotal,
        whiteDiscs: whiteDiscs | movePosition | capturedTotal
      };
    }
  }

  function determineNextGameState({ blackDiscs, whiteDiscs }, currentPlayer) {
    // Essayer de passer au joueur suivant
    const nextPlayer = -currentPlayer;

    // Vérifier si le joueur suivant a des coups valides
    const nextPlayerMoves = calculateValidMoves(blackDiscs, whiteDiscs, nextPlayer);
    if (nextPlayerMoves !== 0n) {
      return { blackDiscs, whiteDiscs, currentPlayer: nextPlayer };
    }

    // Si pas de coups pour le joueur suivant, vérifier le joueur actuel
    const currentPlayerMoves = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);
    if (currentPlayerMoves !== 0n) {
      return { blackDiscs, whiteDiscs, currentPlayer };
    }

    // Si aucun joueur ne peut jouer, la partie est terminée
    return { blackDiscs, whiteDiscs, currentPlayer: EMPTY };
  }

  // Réalisation d'un coup
  function makeMove(gameState, position) {
    if (!gameState) {
      log("Erreur: gameState est undefined dans makeMove");
      return null;
    }

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;

    // Conversion de la position en bitboard
    const movePosition = 1n << BigInt(position);

    // Vérifier si le coup est valide
    const validMoves = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);
    if ((movePosition & validMoves) === 0n) {
      log(`Mouvement invalide à la position ${position}`);
      return gameState; // Retourner l'état inchangé
    }

    const playerDiscs = currentPlayer === BLACK ? blackDiscs : whiteDiscs;
    const opponentDiscs = currentPlayer === BLACK ? whiteDiscs : blackDiscs;

    // Calculer toutes les pièces capturées
    const capturedTotal = DIRECTIONS.reduce((captured, direction) => {
      return captured | captureInDirection(
        movePosition,
        playerDiscs,
        opponentDiscs,
        direction,
        DIRECTION_MASKS[direction]
      );
    }, 0n);

    // Mettre à jour les plateaux
    const newBoardState = updateBoards(blackDiscs, whiteDiscs, movePosition, capturedTotal, currentPlayer);

    // Déterminer le joueur suivant
    return determineNextGameState(newBoardState, currentPlayer);
  }

  // Accès aux coups valides sous forme de positions
  function getAllValidMoves(gameState) {
    if (!gameState) {
      log("Erreur: gameState est undefined dans getAllValidMoves");
      return [];
    }

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const validMovesBitboard = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);
    return bitPositions(validMovesBitboard);
  }

  // Détermination du résultat de la partie
  function getGameResult(gameState) {
    if (!gameState) {
      log("Erreur: gameState est undefined dans getGameResult");
      return { winner: EMPTY, blackCount: 0, whiteCount: 0 };
    }

    const { blackCount, whiteCount } = countPieces(gameState);
    let winner = EMPTY;

    if (blackCount > whiteCount) winner = BLACK;
    else if (whiteCount > blackCount) winner = WHITE;

    return { winner, blackCount, whiteCount };
  }

  // IA avec minimax et alpha-beta
  function findBestMove(gameState, difficulty) {
    if (!gameState) {
      log("Erreur: gameState est undefined dans findBestMove");
      return null;
    }

    const { currentPlayer } = gameState;
    const depth = DIFFICULTY_DEPTH_MAP[difficulty] || 4;

    // Obtenir tous les coups valides
    const validMoves = getAllValidMoves(gameState);
    log(`Coups valides trouvés pour ${currentPlayer === BLACK ? "NOIR" : "BLANC"}: ${validMoves.length}`);

    if (validMoves.length === 0) {
      log("Aucun coup valide trouvé");
      return null;
    }

    try {
      // Toujours avoir un coup par défaut en cas d'erreur
      let bestMove = validMoves[0];
      let bestScore = -Infinity;
      let alpha = -Infinity;
      let beta = Infinity;

      // Pour chaque coup possible, évaluer le score avec minimax
      for (const move of validMoves) {
        const newGameState = makeMove(gameState, move);

        // Vérifier que le nouvel état est valide
        if (!newGameState) continue;

        // Si le joueur a changé, c'est le tour de l'adversaire
        const isNextPlayerOpponent = newGameState.currentPlayer !== currentPlayer;

        const score = minimax(
          newGameState,
          depth - 1,
          alpha,
          beta,
          isNextPlayerOpponent,
          currentPlayer
        );

        log(`Position ${move}: score ${score}`);

        // Mettre à jour le meilleur coup si nécessaire
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }

        alpha = Math.max(alpha, bestScore);
      }

      log(`Meilleur coup choisi: ${bestMove} avec score ${bestScore}`);
      return bestMove;
    } catch (error) {
      log("Erreur dans findBestMove:", error);
      // En cas d'erreur, renvoyer un coup valide plutôt que null
      return validMoves[0];
    }
  }

  function minimax(gameState, depth, alpha, beta, isMinimizing, evalPlayer) {
    if (!gameState) {
      log("Erreur: gameState est undefined dans minimax");
      return isMinimizing ? Infinity : -Infinity;
    }

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;

    // Cas de base : profondeur 0 ou jeu terminé
    if (depth === 0 || currentPlayer === EMPTY) {
      return evaluateBoard(gameState, evalPlayer);
    }

    // Obtenir tous les coups valides
    const validMoves = getAllValidMoves(gameState);

    // Si aucun coup valide, passer le tour
    if (validMoves.length === 0) {
      // Inversons le joueur et continuons
      const nextPlayerGameState = {
        blackDiscs,
        whiteDiscs,
        currentPlayer: -currentPlayer
      };

      return minimax(
        nextPlayerGameState,
        depth - 1,
        alpha,
        beta,
        !isMinimizing,
        evalPlayer
      );
    }

    let bestScore = isMinimizing ? Infinity : -Infinity;

    // Limiter le nombre de branches explorées pour les nœuds profonds
    const movesToEvaluate = depth > 3 ? validMoves.slice(0, 10) : validMoves;

    // Pour chaque coup possible
    for (const move of movesToEvaluate) {
      const newGameState = makeMove(gameState, move);

      // Vérifier que le nouvel état est valide
      if (!newGameState) continue;

      // Si le joueur n'a pas changé, c'est toujours son tour
      const isNextMinimizing = newGameState.currentPlayer !== currentPlayer ? !isMinimizing : isMinimizing;

      const score = minimax(
        newGameState,
        depth - 1,
        alpha,
        beta,
        isNextMinimizing,
        evalPlayer
      );

      if (isMinimizing) {
        bestScore = Math.min(bestScore, score);
        beta = Math.min(beta, bestScore);
      } else {
        bestScore = Math.max(bestScore, score);
        alpha = Math.max(alpha, bestScore);
      }

      // Élagage alpha-beta
      if (beta <= alpha) break;
    }

    return bestScore;
  }

  function evaluateBoard(gameState, evalPlayer) {
    if (!gameState) return 0;
    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const { playerDiscs, opponentDiscs } = getPlayerAndOpponentDiscs(blackDiscs, whiteDiscs, evalPlayer);
    if (currentPlayer === 0n) {
      const blackCount = countBits(blackDiscs);
      const whiteCount = countBits(whiteDiscs);
      const pieceDiff = evalPlayer === BLACK ? blackCount - whiteCount : whiteCount - blackCount;
      return pieceDiff === 0 ? 0 : 1000 * Math.sign(pieceDiff) + pieceDiff;
    };

    let score = 0;
    const playerPositions = bitPositions(playerDiscs);
    const opponentPositions = bitPositions(opponentDiscs);
    playerPositions.forEach((pos) => score += WEIGHT_BOARD[pos]);
    opponentPositions.forEach((pos) => score -= WEIGHT_BOARD[pos]);

    const playerMoves = getAllValidMoves({...gameState, currentPlayer: evalPlayer}).length;
    const opponentMoves = getAllValidMoves({...gameState, currentPlayer: -evalPlayer}).length;

    score += 8 * (playerMoves - opponentMoves);


    return score;
  }

  // API publique
  return {
    createNewGame,
    makeMove,
    getAllValidMoves,
    findBestMove,
    countPieces,
    getGameResult
  };
})();

export default othelloCore;
