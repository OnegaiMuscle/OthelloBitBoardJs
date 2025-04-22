const othelloCore = (() => {
  // Constantes simplifiées
  const EMPTY = 0n, BLACK = 1n, WHITE = -1n;
  const DIRECTIONS = [-9n, -8n, -7n, 1n, 9n, 8n, 7n, -1n]; // NW, N, NE, E, SE, S, SW, W

  // Masques combinés pour les bords
  const NOT_A_COL = 0xfefefefefefefefen, NOT_H_COL = 0x7f7f7f7f7f7f7f7fn;
  const DIRECTION_MASKS = {
    "-9": NOT_H_COL, "-8": 0xFFFFFFFFFFFFFFFFn, "-7": NOT_A_COL, "1": NOT_A_COL,
    "9": NOT_A_COL, "8": 0xFFFFFFFFFFFFFFFFn, "7": NOT_H_COL, "-1": NOT_H_COL
  };

  // Matrice de poids et constantes
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

  const DIFFICULTY_DEPTH_MAP = { noob: 1, easy: 2, medium: 4, hard: 6, pro: 7, expert: 8 };
  const DE_BRUIJN_64 = 0x03f79d71b4cb0a89n;
  const INDEX_64 = [0, 1, 48, 2, 57, 49, 28, 3, 61, 58, 50, 42, 38, 29, 17, 4, 62, 55, 59, 36, 53, 51, 43, 22,
                    45, 39, 33, 30, 24, 18, 12, 5, 63, 47, 56, 27, 60, 41, 37, 16, 54, 35, 52, 21, 44, 32, 23, 11,
                    46, 26, 40, 15, 34, 20, 31, 10, 25, 14, 19, 9, 13, 8, 7, 6];

  // Debug
  const DEBUG = false;
  const log = DEBUG ? console.log.bind(console) : () => {};

  // Fonctions utilitaires simplifiées
  const shift = (b, d) => d > 0 ? b << d : b >> -d;

  const countBits = n => {
    if (!n) return 0;
    n = n - ((n >> 1n) & 0x5555555555555555n);
    n = (n & 0x3333333333333333n) + ((n >> 2n) & 0x3333333333333333n);
    return Number((n + (n >> 4n)) & 0x0F0F0F0F0F0F0F0Fn * 0x0101010101010101n >> 56n & 255n);
  };

  const getBitPosition = b => b ? INDEX_64[Number((b & -b) * DE_BRUIJN_64 >> 58n & 63n)] : -1;

  const getPlayerDiscs = (blackDiscs, whiteDiscs, player) => ({
    playerDiscs: player === BLACK ? blackDiscs : whiteDiscs,
    opponentDiscs: player === BLACK ? whiteDiscs : blackDiscs
  });

  // Fonctions de jeu simplifiées
  const createNewGame = () => ({
    blackDiscs: (1n << 28n) | (1n << 35n),
    whiteDiscs: (1n << 27n) | (1n << 36n),
    currentPlayer: BLACK
  });

  function getValidMovesInDirection(playerDiscs, opponentDiscs, direction, edgeMask) {
    let candidates = shift(playerDiscs, direction) & opponentDiscs & edgeMask;
    if (!candidates) return 0n;

    for (let temp = candidates; temp; temp = shift(temp, direction) & opponentDiscs & edgeMask)
      candidates |= temp;

    return shift(candidates, direction) & ~(playerDiscs | opponentDiscs) & edgeMask;
  }

  function calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer) {
    const { playerDiscs, opponentDiscs } = getPlayerDiscs(blackDiscs, whiteDiscs, currentPlayer);

    return DIRECTIONS.reduce((moves, dir) =>
      moves | getValidMovesInDirection(
        playerDiscs, opponentDiscs, dir, DIRECTION_MASKS[dir.toString()]
      ), 0n);
  }

  function captureInDirection(movePosition, playerDiscs, opponentDiscs, direction, edgeMask) {
    const firstStep = shift(movePosition, direction) & edgeMask;
    if ((firstStep & opponentDiscs) === 0n) return 0n;

    let capturedDiscs = 0n, frontier = firstStep;

    while (frontier && (frontier & opponentDiscs)) {
      capturedDiscs |= frontier & opponentDiscs;
      frontier = shift(frontier, direction) & edgeMask;
      if (frontier & playerDiscs) return capturedDiscs;
    }

    return 0n;
  }

  function makeMoveWithBitboard(gameState, movePosition) {
    if (!gameState) return null;
    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;

    // Validation du coup
    const validMoves = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);
    if ((movePosition & validMoves) === 0n) return gameState;

    // Captures
    const { playerDiscs, opponentDiscs } = getPlayerDiscs(blackDiscs, whiteDiscs, currentPlayer);
    const capturedTotal = DIRECTIONS.reduce((captured, dir) =>
      captured | captureInDirection(
        movePosition, playerDiscs, opponentDiscs, dir, DIRECTION_MASKS[dir.toString()]
      ), 0n);

    // Mise à jour du plateau
    const newBoard = currentPlayer === BLACK ?
      { blackDiscs: blackDiscs | movePosition | capturedTotal, whiteDiscs: whiteDiscs & ~capturedTotal } :
      { blackDiscs: blackDiscs & ~capturedTotal, whiteDiscs: whiteDiscs | movePosition | capturedTotal };

    // Déterminer joueur suivant
    const nextPlayer = -currentPlayer;
    const nextPlayerMoves = calculateValidMoves(newBoard.blackDiscs, newBoard.whiteDiscs, nextPlayer);

    if (nextPlayerMoves) return { ...newBoard, currentPlayer: nextPlayer };

    const currentPlayerMoves = calculateValidMoves(newBoard.blackDiscs, newBoard.whiteDiscs, currentPlayer);
    return { ...newBoard, currentPlayer: currentPlayerMoves ? currentPlayer : EMPTY };
  }

  // Fonctions d'IA
  function evaluateBoardOptimized(gameState, evalPlayer) {
    if (!gameState) return 0;

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const { playerDiscs, opponentDiscs } = getPlayerDiscs(blackDiscs, whiteDiscs, evalPlayer);

    // Fin de partie
    if (currentPlayer === EMPTY) {
      const blackCount = countBits(blackDiscs), whiteCount = countBits(whiteDiscs);
      const diff = evalPlayer === BLACK ? blackCount - whiteCount : whiteCount - blackCount;
      return diff > 0 ? 10000 : diff < 0 ? -10000 : 0;
    }

    // Évaluation du plateau
    let score = 0;

    // Positions joueur
    for (let board = playerDiscs; board; board ^= board & -board)
      score += WEIGHT_BOARD[getBitPosition(board & -board)];

    // Positions adversaire
    for (let board = opponentDiscs; board; board ^= board & -board)
      score -= WEIGHT_BOARD[getBitPosition(board & -board)];

    // Mobilité
    const playerMobility = countBits(calculateValidMoves(blackDiscs, whiteDiscs, evalPlayer));
    const opponentMobility = countBits(calculateValidMoves(blackDiscs, whiteDiscs, -evalPlayer));

    return score + 8 * (playerMobility - opponentMobility);
  }

  function minimaxOptimized(gameState, depth, alpha, beta, isMinimizing, evalPlayer) {
    if (!gameState || depth <= 0 || gameState.currentPlayer === EMPTY)
      return evaluateBoardOptimized(gameState, evalPlayer);

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const validMovesBitboard = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);

    // Passer tour
    if (validMovesBitboard === 0n) {
      return minimaxOptimized(
        { blackDiscs, whiteDiscs, currentPlayer: -currentPlayer },
        depth - 1, alpha, beta, !isMinimizing, evalPlayer
      );
    }

    // Initialisation
    let bestScore = isMinimizing ? Infinity : -Infinity;
    let currentAlpha = alpha;
    let currentBeta = beta;

    // Itération directe sur les bits du bitboard
    let moves = validMovesBitboard;

    while (moves && currentAlpha < currentBeta) {
      const moveBit = moves & -moves;
      moves ^= moveBit;

      const newState = makeMoveWithBitboard(gameState, moveBit);
      if (!newState) continue;

      const isNextMinimizing = newState.currentPlayer !== currentPlayer ? !isMinimizing : isMinimizing;

      const score = minimaxOptimized(
        newState, depth - 1, currentAlpha, currentBeta, isNextMinimizing, evalPlayer
      );

      if (isMinimizing) {
        bestScore = Math.min(bestScore, score);
        currentBeta = Math.min(currentBeta, bestScore);
      } else {
        bestScore = Math.max(bestScore, score);
        currentAlpha = Math.max(currentAlpha, bestScore);
      }
    }

    return bestScore;
  }

  function findBestMove(gameState, difficulty) {
    if (!gameState) return null;

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const depth = DIFFICULTY_DEPTH_MAP[difficulty] || 4;
    const validMoves = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);

    if (!validMoves) return null;

    try {
      let bestMove = -1;
      let bestScore = -Infinity;

      // Évaluer chaque coup
      let moves = validMoves;
      while (moves) {
        const moveBit = moves & -moves;
        moves ^= moveBit;

        const moveIndex = getBitPosition(moveBit);
        const newState = makeMoveWithBitboard(gameState, moveBit);

        if (!newState) continue;

        const score = minimaxOptimized(
          newState,
          depth - 1,
          -Infinity,
          Infinity,
          newState.currentPlayer !== currentPlayer,
          currentPlayer
        );

        log(`Position ${moveIndex}: score ${score}`);

        if (score > bestScore) {
          bestScore = score;
          bestMove = moveIndex;
        }
      }

      log(`Meilleur coup: ${bestMove} (score: ${bestScore})`);
      return bestMove;
    } catch (error) {
      log("Erreur:", error);
      return getBitPosition(validMoves & -validMoves); // Premier coup valide
    }
  }

  // API publique
  return {
    createNewGame,
    makeMove: (gs, pos) => makeMoveWithBitboard(gs, pos >= 0 ? 1n << BigInt(pos) : 0n),
    getAllValidMoves: (gs) => {
      if (!gs) return [];
      const moves = [];
      let board = calculateValidMoves(gs.blackDiscs, gs.whiteDiscs, gs.currentPlayer);
      while (board) {
        const bit = board & -board;
        moves.push(getBitPosition(bit));
        board ^= bit;
      }
      return moves;
    },
    findBestMove,
    countPieces: (gs) => {
      if (!gs) return { blackCount: 0, whiteCount: 0 };
      return {
        blackCount: countBits(gs.blackDiscs),
        whiteCount: countBits(gs.whiteDiscs)
      };
    },
    getGameResult: (gs) => {
      if (!gs) return { winner: EMPTY, blackCount: 0, whiteCount: 0 };
      const blackCount = countBits(gs.blackDiscs);
      const whiteCount = countBits(gs.whiteDiscs);
      const winner = blackCount > whiteCount ? BLACK : whiteCount > blackCount ? WHITE : EMPTY;
      return { winner, blackCount, whiteCount };
    }
  };
})();

export default othelloCore;
