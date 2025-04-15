const othelloCore = (() => {
  const EMPTY = 0n;
  const BLACK = 1n;
  const WHITE = 2n;
  const NORTH = -8n;
  const NORTH_EAST = -7n;
  const EAST = 1n;
  const SOUTH_EAST = 9n;
  const SOUTH = 8n;
  const SOUTH_WEST = 7n;
  const WEST = -1n;
  const NORTH_WEST = -9n;
  const DIRECTIONS = [NORTH, NORTH_EAST, EAST, SOUTH_EAST, SOUTH, SOUTH_WEST, WEST, NORTH_WEST];
  const NOT_A_COL = 0xfefefefefefefefen;
  const NOT_H_COL = 0x7f7f7f7f7f7f7f7fn;
  const DIRECTION_MASKS = {
    [NORTH]: 0xFFFFFFFFFFFFFFFFn,
    [NORTH_EAST]: NOT_A_COL,
    [EAST]: NOT_A_COL,
    [SOUTH_EAST]: NOT_A_COL,
    [SOUTH]: 0xFFFFFFFFFFFFFFFFn,
    [SOUTH_WEST]: NOT_H_COL,
    [WEST]: NOT_H_COL,
    [NORTH_WEST]: NOT_H_COL
  };

  // Board weights for evaluation (flattened 8x8 to 1D array)
  const WEIGHT_BOARD = [
    100, -20, 10,  5,  5, 10, -20, 100,
    -20, -50, -2, -2, -2, -2, -50, -20,
     10,  -2,  1,  1,  1,  1,  -2,  10,
      5,  -2,  1,  0,  0,  1,  -2,   5,
      5,  -2,  1,  0,  0,  1,  -2,   5,
     10,  -2,  1,  1,  1,  1,  -2,  10,
    -20, -50, -2, -2, -2, -2, -50, -20,
    100, -20, 10,  5,  5, 10, -20, 100
  ];

  const DIFFICULTY_DEPTH_MAP = {
    noob: 2,
    easy: 4,
    medium: 6,
    hard: 8,
    master: 8
  };



  function createNewGame() {
    let blackDiscs = 0n;
    let whiteDiscs = 0n;
    blackDiscs |= (1n << 28n) | (1n << 35n);
    whiteDiscs |= (1n << 27n) | (1n << 36n);
    return {
      blackDiscs,
      whiteDiscs,
      currentPlayer: BLACK
    };
  };

  function shift(bitboard, direction) {
    if (direction > 0) {
        return bitboard << direction;
    } else {
        return bitboard >> -direction;
    }
}

function getValidMovesInDirection(playerDiscs, opponentDiscs, direction, edgeMask) {
  let candidates = shift(playerDiscs, direction) & opponentDiscs & edgeMask;
  if (candidates === 0n) return 0n;
  let temp = candidates;
  while (temp !== 0n) {
    temp = shift(temp, direction) & opponentDiscs & edgeMask;
    candidates |= temp;
  }
  return shift(candidates, direction) & ~(playerDiscs | opponentDiscs) & edgeMask;
}

function calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer) {
  const playerDiscs = currentPlayer === BLACK ? blackDiscs : whiteDiscs;
  const opponentDiscs = currentPlayer === BLACK ? whiteDiscs : blackDiscs;
  return DIRECTIONS.reduce((validMovesBitboard, direction) =>
    validMovesBitboard | getValidMovesInDirection(
      playerDiscs,
      opponentDiscs,
      direction,
      DIRECTION_MASKS[direction]
    ), 0n);

}
  // Capture pieces in one direction
  function captureInDirection(movePosition, playerDiscs, opponentDiscs, direction, edgeMask) {
    let capturedDiscs = 0n;
    let frontier = shift(movePosition, direction) & edgeMask;
    while (frontier !== 0n) {
      if ((frontier & playerDiscs) !== 0n) return capturedDiscs;
      if ((frontier & opponentDiscs) === 0n) return 0n;
      capturedDiscs |= frontier;
      frontier = shift(frontier, direction) & edgeMask;
    }
    return 0n;
  }


  function countBits(n) {
    n = n - (n >> 1n & 0x5555555555555555n);
    n = (n & 0x3333333333333333n) + (n >> 2n & 0x3333333333333333n);
    n = (n + (n >> 4n)) & 0x0F0F0F0F0F0F0F0Fn;
    n = n * 0x0101010101010101n >> 56n & 255n;
    return Number(n);
  }; // Count bits in a bitboard with SWAR algorithm and magic number


  function makeMove(gameState, position) {
    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const movePosition = 1n << BigInt(position);
    const validMoves = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);
    if ((movePosition & validMoves) === 0n) return gameState; // Invalid move
    const playerDiscs = currentPlayer === BLACK ? blackDiscs : whiteDiscs;
    const opponentDiscs = currentPlayer === BLACK ? whiteDiscs : blackDiscs;

    const capturedTotal = DIRECTIONS.reduce((captured, direction) => {
      return captured | captureInDirection(
        movePosition,
        playerDiscs,
        opponentDiscs,
        direction,
        DIRECTION_MASKS[direction]
      );
    }, 0n);

    const newBoardState = updateBoards(blackDiscs, whiteDiscs, movePosition, capturedTotal, currentPlayer);
    return determineNextGameState(newBoardState, currentPlayer);
  }

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
    const nextPlayer = currentPlayer === BLACK ? WHITE : BLACK;

    const nextPlayerMoves = calculateValidMoves(blackDiscs, whiteDiscs, nextPlayer);
    if (nextPlayerMoves !== 0n) {
      return { blackDiscs, whiteDiscs, currentPlayer: nextPlayer };
    }

    const currentPlayerMoves = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);
    if (currentPlayerMoves !== 0n) {
      return { blackDiscs, whiteDiscs, currentPlayer };
    }

    return { blackDiscs, whiteDiscs, currentPlayer: EMPTY };
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
    }
    return positions;
  }

  // Get all valid moves as position indices
  function getAllValidMoves(gameState) {
    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const validMovesBitboard = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);
    return bitPositions(validMovesBitboard);
  }

  // Count pieces for both players
  function countPieces(gameState) {
    const { blackDiscs, whiteDiscs } = gameState;
    return {
      blackCount: countBits(blackDiscs),
      whiteCount: countBits(whiteDiscs)
    };
  }



  // Get the game result
  function getGameResult(gameState) {
    const { blackCount, whiteCount } = countPieces(gameState);
    let winner = EMPTY;
    if (blackCount > whiteCount) winner = BLACK;
    else if (whiteCount > blackCount) winner = WHITE;

    return { winner, blackCount, whiteCount };
  }

  function findBestMove(gameState, difficulty) {
    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const depth = DIFFICULTY_DEPTH_MAP[difficulty] || 4;

    // Obtenir tous les coups valides
    const validMoves = getAllValidMoves(gameState);
    if (validMoves.length === 0) return null;

    let bestMove = validMoves[0]; // Toujours avoir un coup par défaut
    let bestScore = -Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    // Pour chaque coup possible, évaluer le score avec minimax
    for (const move of validMoves) {
      const newGameState = makeMove(gameState, move);

      // Vérifier si le nouvel état est valide
      if (!newGameState) continue;

      // Si le joueur a changé, c'est le tour de l'adversaire
      const isNextPlayerOpponent = newGameState.currentPlayer !== currentPlayer;

      // Appeler minimax avec le nouvel état du jeu
      const score = minimax(
        newGameState,
        depth - 1,
        alpha,
        beta,
        isNextPlayerOpponent, // true pour minimiser, false pour maximiser
        currentPlayer // Joueur pour lequel on évalue les scores
      );

      // Mettre à jour le meilleur coup si nécessaire
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }

      alpha = Math.max(alpha, bestScore);
    }

    return bestMove;
  }

  function minimax(gameState, depth, alpha, beta, isMinimizing, evalPlayer) {
    if (!gameState) return isMinimizing ? Infinity : -Infinity;

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
        currentPlayer: currentPlayer === BLACK ? WHITE : BLACK
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

    // Pour chaque coup possible
    for (const move of validMoves) {
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

    const { blackDiscs, whiteDiscs } = gameState;
    const playerDiscs = evalPlayer === BLACK ? blackDiscs : whiteDiscs;
    const opponentDiscs = evalPlayer === BLACK ? whiteDiscs : blackDiscs;

    // Compter les pièces avec pondération de la position
    let score = 0;

    // Parcourir le plateau et ajouter/soustraire les poids des positions
    for (let pos = 0; pos < 64; pos++) {
      const bitPos = 1n << BigInt(pos);

      if ((playerDiscs & bitPos) !== 0n) {
        score += WEIGHT_BOARD[pos];
      } else if ((opponentDiscs & bitPos) !== 0n) {
        score -= WEIGHT_BOARD[pos];
      }
    }


    // Fin de partie: donner un grand score pour une victoire
    if (gameState.currentPlayer === EMPTY) {
      const { blackCount, whiteCount } = countPieces(gameState);

      if (evalPlayer === BLACK) {
        if (blackCount > whiteCount) return 10000;
        if (blackCount < whiteCount) return -10000;
      } else {
        if (whiteCount > blackCount) return 10000;
        if (whiteCount < blackCount) return -10000;
      }
      return 0; // Match nul
    }

    return score;
  }

  function getCurrentPlayerDiscs(gameState) {
    const { currentPlayer, blackDiscs, whiteDiscs } = gameState;
    return currentPlayer === BLACK ? blackDiscs : whiteDiscs;
  }

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
