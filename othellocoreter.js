const othelloCore = (() => {
  // Constantes pour les joueurs et directions
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

  // Masques pour éviter les dépassements de bords
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

  // Matrice de poids pour l'évaluation
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

  // Configuration de la profondeur de recherche par niveau
  const DIFFICULTY_DEPTH_MAP = {
    noob: 1,
    easy: 2,
    medium: 4,
    hard: 6,
    pro: 7,
    expert: 8
  };

  // Constante pour la multiplication de De Bruijn
  const DE_BRUIJN_64 = 0x03f79d71b4cb0a89n;
  const INDEX_64 = [
    0,   1, 48,  2, 57, 49, 28,  3,
    61, 58, 50, 42, 38, 29, 17,  4,
    62, 55, 59, 36, 53, 51, 43, 22,
    45, 39, 33, 30, 24, 18, 12,  5,
    63, 47, 56, 27, 60, 41, 37, 16,
    54, 35, 52, 21, 44, 32, 23, 11,
    46, 26, 40, 15, 34, 20, 31, 10,
    25, 14, 19,  9, 13,  8,  7,  6
  ];

  // Utilité pour déboguer
  const DEBUG = true;
  function log(...args) {
    if (DEBUG) console.log(...args);
  }

  // ====== FONCTIONS UTILITAIRES POUR BITBOARDS ======

  // Décalage sécurisé avec masque de bord
  function shift(bitboard, direction) {
    return direction > 0 ? bitboard << direction : bitboard >> -direction;
  }

  // Comptage de bits optimisé pour BigInt
  function countBits(n) {
    if (n === undefined || n === null) return 0;
    n = n - (n >> 1n & 0x5555555555555555n);
    n = (n & 0x3333333333333333n) + (n >> 2n & 0x3333333333333333n);
    n = (n + (n >> 4n)) & 0x0F0F0F0F0F0F0F0Fn;
    n = n * 0x0101010101010101n >> 56n & 255n;
    return Number(n);
  }

  // Comptage des pièces sur le plateau
  function countPieces(gameState) {
    if (!gameState) return { blackCount: 0, whiteCount: 0 };
    const { blackDiscs, whiteDiscs } = gameState;
    return {
      blackCount: countBits(blackDiscs),
      whiteCount: countBits(whiteDiscs)
    };
  }

  // Obtenir la position d'un bit unique dans un bitboard
  function getBitPosition(bitboard) {
    if (bitboard === 0n) return -1;
    const bit = bitboard & -bitboard; // Bit le moins significatif
    const shift = Number(bit * DE_BRUIJN_64 >> 58n & 63n);
    return INDEX_64[shift];
  }

  // Convertir un bitboard en tableau de positions
  function bitPositions(bitboard) {
    const positions = [];
    while (bitboard) {
      const bit = bitboard & -bitboard;
      const shift = Number(bit * DE_BRUIJN_64 >> 58n & 63n);
      positions.push(INDEX_64[shift]);
      bitboard ^= bit;
    }
    return positions;
  }

  // Déterminer les disques du joueur et de l'adversaire
  function getPlayerAndOpponentDiscs(blackDiscs, whiteDiscs, currentPlayer) {
    return {
      playerDiscs: currentPlayer === BLACK ? blackDiscs : whiteDiscs,
      opponentDiscs: currentPlayer === BLACK ? whiteDiscs : blackDiscs
    };
  }

  // ====== FONCTIONS DE GAMEPLAY ======

  // Créer une nouvelle partie
  function createNewGame() {
    let blackDiscs = (1n << 28n) | (1n << 35n);
    let whiteDiscs = (1n << 27n) | (1n << 36n);
    return {
      blackDiscs,
      whiteDiscs,
      currentPlayer: BLACK
    };
  }

  // Calculer les mouvements valides dans une direction
  function getValidMovesInDirection(playerDiscs, opponentDiscs, direction, edgeMask) {
    // Trouver les pions adverses adjacents aux pions du joueur
    let candidates = shift(playerDiscs, direction) & opponentDiscs & edgeMask;
    if (candidates === 0n) return 0n;

    // Étendre la recherche dans cette direction
    let temp = candidates;
    while (temp !== 0n) {
      temp = shift(temp, direction) & opponentDiscs & edgeMask;
      candidates |= temp;
    }

    // Trouver les cases vides adjacentes aux candidats
    return shift(candidates, direction) & ~(playerDiscs | opponentDiscs) & edgeMask;
  }

  // Calculer tous les mouvements valides pour un joueur
  function calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer) {
    const { playerDiscs, opponentDiscs } = getPlayerAndOpponentDiscs(blackDiscs, whiteDiscs, currentPlayer);

    // Calculer les mouvements valides dans toutes les directions
    return DIRECTIONS.reduce((validMovesBitboard, direction) =>
      validMovesBitboard | getValidMovesInDirection(
        playerDiscs,
        opponentDiscs,
        direction,
        DIRECTION_MASKS[direction]
      ), 0n);
  }

  // Calculer les captures dans une direction
  function captureInDirection(movePosition, playerDiscs, opponentDiscs, direction, edgeMask) {
    // Vérifier s'il y a un pion adverse adjacent
    const firstStep = shift(movePosition, direction) & edgeMask;
    if ((firstStep & opponentDiscs) === 0n) return 0n;

    // Suivre la ligne de pions adverses
    let capturedDiscs = 0n;
    let frontier = firstStep;

    while (frontier !== 0n && (frontier & opponentDiscs) !== 0n) {
      capturedDiscs |= frontier & opponentDiscs;
      frontier = shift(frontier, direction) & edgeMask;

      // Si on trouve un pion du joueur, la capture est valide
      if ((frontier & playerDiscs) !== 0n) return capturedDiscs;
    }

    // Pas de pion du joueur trouvé au bout de la ligne
    return 0n;
  }

  // Mettre à jour les plateaux après un coup
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

  // Déterminer l'état du jeu après un coup
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

  // ====== FONCTIONS D'API PUBLIQUE ======

  // Réaliser un coup à partir d'une position
  function makeMove(gameState, position) {
    if (!gameState) return null;

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;

    // Convertir la position en bitboard
    const movePosition = 1n << BigInt(position);

    // Utiliser makeMoveWithBitboard pour le traitement
    return makeMoveWithBitboard(gameState, movePosition);
  }

  // Version optimisée qui travaille directement avec les bitboards
  function makeMoveWithBitboard(gameState, movePosition) {
    if (!gameState) return null;

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;

    // Vérifier si le coup est valide
    const validMoves = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);
    if ((movePosition & validMoves) === 0n) {
      return gameState; // Coup invalide
    }

    const { playerDiscs, opponentDiscs } = getPlayerAndOpponentDiscs(blackDiscs, whiteDiscs, currentPlayer);

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

  // Obtenir tous les coups valides sous forme de positions
  function getAllValidMoves(gameState) {
    if (!gameState) return [];

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const validMovesBitboard = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);

    // Convertir le bitboard en tableau de positions
    return bitPositions(validMovesBitboard);
  }

  // Obtenir tous les coups valides sous forme de bitboard (pour optimisation interne)
  function getAllValidMovesBitboard(gameState) {
    if (!gameState) return 0n;

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    return calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);
  }

  // Déterminer le résultat de la partie
  function getGameResult(gameState) {
    if (!gameState) {
      return { winner: EMPTY, blackCount: 0, whiteCount: 0 };
    }

    const { blackCount, whiteCount } = countPieces(gameState);
    let winner = EMPTY;

    if (blackCount > whiteCount) winner = BLACK;
    else if (whiteCount > blackCount) winner = WHITE;

    return { winner, blackCount, whiteCount };
  }

  // ====== FONCTIONS D'IA ======

  // Trouver le meilleur coup avec minimax
  function findBestMove(gameState, difficulty) {
    if (!gameState) return null;

    return findBestMoveOptimized(gameState, difficulty);
  }

function findBestMoveOptimized(gameState, difficulty) {
  if (!gameState) return null;

  const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
  const depth = DIFFICULTY_DEPTH_MAP[difficulty] || 4;

  // Récupérer le bitboard des coups valides
  const validMovesBitboard = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);

  if (validMovesBitboard === 0n) {
    return null;
  }

  try {
    // Collecter et évaluer les coups
    const moveEvaluations = [];
    let remainingMoves = validMovesBitboard;

    while (remainingMoves !== 0n) {
      const movePositionBitboard = remainingMoves & -remainingMoves;
      remainingMoves ^= movePositionBitboard;
      const moveIndex = getBitPosition(movePositionBitboard);
      const quickScore = getQuickMoveScore(gameState, moveIndex);

      moveEvaluations.push({
        moveIndex,
        movePositionBitboard,
        quickScore
      });
    }

    // Trier les coups par score décroissant
    moveEvaluations.sort((a, b) => b.quickScore - a.quickScore);

    // Utiliser reduce pour trouver le meilleur coup
    const result = moveEvaluations.reduce((best, { moveIndex, movePositionBitboard }) => {
      const newGameState = makeMoveWithBitboard(gameState, movePositionBitboard);
      if (!newGameState) return best;

      const isNextPlayerOpponent = newGameState.currentPlayer !== currentPlayer;

      const score = minimaxOptimized(
        newGameState,
        depth - 1,
        best.alpha,
        Infinity,  // Beta initial pour le premier niveau
        isNextPlayerOpponent,
        currentPlayer
      );

      log(`Position ${moveIndex}: score ${score}`);

      // Mettre à jour le meilleur coup si nécessaire
      if (score > best.score) {
        return {
          move: moveIndex,
          score: score,
          alpha: Math.max(best.alpha, score)
        };
      }
      return best;
    }, { move: -1, score: -Infinity, alpha: -Infinity });

    log(`Meilleur coup choisi: ${result.move} avec score ${result.score}`);
    return result.move;
  } catch (error) {
    log("Erreur dans findBestMove:", error);

    // En cas d'erreur, retourner la première position valide
    return getBitPosition(validMovesBitboard & -validMovesBitboard);
  }
}

  // Évaluation rapide d'un coup pour le tri dans l'alpha-beta
  function getQuickMoveScore(gameState, move) {
    // Bonus pour les coins
    //if (move === 0 || move === 7 || move === 56 || move === 63) {
    //  return 1000;
    //}

    // Malus pour les positions adjacentes aux coins
    //const badPositions = new Set([1, 8, 9, 6, 14, 15, 48, 49, 57, 54, 55, 62]);
    //if (badPositions.has(move)) {
    //  return -500;
    //}

    // Utiliser la pondération de la position
    return WEIGHT_BOARD[move];
  }

  // Version optimisée de minimax qui utilise les bitboards directement
  // Remplacer la fonction minimaxOptimized par cette version utilisant reduce
function minimaxOptimized(gameState, depth, alpha, beta, isMinimizing, evalPlayer) {
  if (!gameState) {
    return isMinimizing ? Infinity : -Infinity;
  }

  const { blackDiscs, whiteDiscs, currentPlayer } = gameState;

  // Cas de base : profondeur 0 ou jeu terminé
  if (depth === 0 || currentPlayer === EMPTY) {
    return evaluateBoardOptimized(gameState, evalPlayer);
  }

  // Récupérer le bitboard des coups valides
  const validMovesBitboard = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);

  // Si aucun coup valide, passer le tour
  if (validMovesBitboard === 0n) {
    const nextPlayerGameState = {
      blackDiscs,
      whiteDiscs,
      currentPlayer: -currentPlayer
    };

    return minimaxOptimized(
      nextPlayerGameState,
      depth - 1,
      alpha,
      beta,
      !isMinimizing,
      evalPlayer
    );
  }

  // Collecter et préordonner les coups
  const moveEvaluations = [];
  let remainingMoves = validMovesBitboard;

  while (remainingMoves !== 0n) {
    const movePositionBitboard = remainingMoves & -remainingMoves;
    remainingMoves ^= movePositionBitboard;

    const moveIndex = getBitPosition(movePositionBitboard);
    const quickScore = getQuickMoveScore(gameState, moveIndex);

    moveEvaluations.push({
      movePositionBitboard,
      quickScore
    });
  }

  // Trier les coups par score
  //moveEvaluations.sort((a, b) => isMinimizing ?
  //  a.quickScore - b.quickScore :
  //  b.quickScore - a.quickScore
  //);

  // Limiter le nombre de coups à explorer
  //let maxMovesToExplore = depth > 5 ? 8 : (depth > 3 ? 12 : 64);
  const movesToEvaluate = moveEvaluations;

  // Utiliser reduce pour trouver le meilleur coup
  const initialState = {
    bestScore: isMinimizing ? Infinity : -Infinity,
    alpha: alpha,
    beta: beta,
    pruned: false
  };

  const result = movesToEvaluate.reduce((state, { movePositionBitboard }) => {
    // Si déjà élagué, sauter l'évaluation
    if (state.pruned) return state;

    // Faire le coup
    const newGameState = makeMoveWithBitboard(gameState, movePositionBitboard);
    if (!newGameState) return state;

    // Déterminer le prochain joueur
    const isNextMinimizing = newGameState.currentPlayer !== currentPlayer ? !isMinimizing : isMinimizing;

    // Évaluer récursivement
    const score = minimaxOptimized(
      newGameState,
      depth - 1,
      state.alpha,
      state.beta,
      isNextMinimizing,
      evalPlayer
    );

    // Mettre à jour le meilleur score et alpha/beta
    let newState = { ...state };

    if (isMinimizing) {
      newState.bestScore = Math.min(state.bestScore, score);
      newState.beta = Math.min(state.beta, newState.bestScore);
    } else {
      newState.bestScore = Math.max(state.bestScore, score);
      newState.alpha = Math.max(state.alpha, newState.bestScore);
    }

    // Vérifier si on peut élaguer
    newState.pruned = newState.beta <= newState.alpha;

    return newState;
  }, initialState);

  return result.bestScore;
}

  // Version optimisée de l'évaluation du plateau
  function evaluateBoardOptimized(gameState, evalPlayer) {
    if (!gameState) return 0;

    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const { playerDiscs, opponentDiscs } = getPlayerAndOpponentDiscs(blackDiscs, whiteDiscs, evalPlayer);

    // Cas de fin de partie
    if (currentPlayer === EMPTY) {
      const { blackCount, whiteCount } = countPieces(gameState);
      const playerCount = evalPlayer === BLACK ? blackCount : whiteCount;
      const opponentCount = evalPlayer === BLACK ? whiteCount : blackCount;

      if (playerCount > opponentCount) return 10000;
      if (playerCount < opponentCount) return -10000;
      return 0; // Match nul
    }

    // Calculer le score à partir des positions occupées
    let score = 0;

    // Évaluation optimisée des disques sur le plateau
    let playerBoard = playerDiscs;
    let opponentBoard = opponentDiscs;

    // Évaluer les positions du joueur
    while (playerBoard) {
      const bit = playerBoard & -playerBoard;
      const pos = getBitPosition(bit);
      score += WEIGHT_BOARD[pos];
      playerBoard ^= bit;
    }

    // Évaluer les positions de l'adversaire
    while (opponentBoard) {
      const bit = opponentBoard & -opponentBoard;
      const pos = getBitPosition(bit);
      score -= WEIGHT_BOARD[pos];
      opponentBoard ^= bit;
    }

    // Calculer la mobilité pour chaque joueur
    const playerMovesBitboard = calculateValidMoves(blackDiscs, whiteDiscs, evalPlayer);
    const opponentMovesBitboard = calculateValidMoves(blackDiscs, whiteDiscs, -evalPlayer);

    const playerMobility = countBits(playerMovesBitboard);
    const opponentMobility = countBits(opponentMovesBitboard);

    score += 8 * (playerMobility - opponentMobility);

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
