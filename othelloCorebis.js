const othelloCore = (() => {
  // Constants
  const EMPTY = 0n;
  const BLACK = 1n;
  const WHITE = 2n;

  // Directions for finding lines
  const NORTH = -8n;
  const NORTH_EAST = -7n;
  const EAST = 1n;
  const SOUTH_EAST = 9n;
  const SOUTH = 8n;
  const SOUTH_WEST = 7n;
  const WEST = -1n;
  const NORTH_WEST = -9n;

  const DIRECTIONS = [NORTH, NORTH_EAST, EAST, SOUTH_EAST, SOUTH, SOUTH_WEST, WEST, NORTH_WEST];

  // Edge masks to prevent wrapping
  const NOT_A_FILE = 0xfefefefefefefefen; // Not column A
  const NOT_H_FILE = 0x7f7f7f7f7f7f7f7fn; // Not column H

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
    noob: 1,
    easy: 2,
    medium: 4,
    hard: 6,
    master: 8
  };

  // Transposition table for caching board evaluations
  const transpositionTable = new Map();

  function createNewGame() {
    // Initialize with standard Othello starting position
    let blackDiscs = 0n;
    let whiteDiscs = 0n;

    // Set initial 4 pieces in the center
    blackDiscs |= (1n << 28n) | (1n << 35n);
    whiteDiscs |= (1n << 27n) | (1n << 36n);

    return {
      blackDiscs,
      whiteDiscs,
      currentPlayer: BLACK
    };
  }

  // Optimized bit shifting with direction and edge masking
  function shift(bitboard, direction) {
    if (direction === EAST) return (bitboard & NOT_A_FILE) << 1n;
    if (direction === WEST) return (bitboard & NOT_H_FILE) >> 1n;
    if (direction === NORTH_EAST) return (bitboard & NOT_A_FILE) >> 7n;
    if (direction === NORTH_WEST) return (bitboard & NOT_H_FILE) >> 9n;
    if (direction === SOUTH_EAST) return (bitboard & NOT_A_FILE) << 9n;
    if (direction === SOUTH_WEST) return (bitboard & NOT_H_FILE) << 7n;
    if (direction > 0) return bitboard << direction;
    return bitboard >> (direction * -1n); // Convert to positive BigInt for right shift
  }

  // Calculate valid moves in one direction
  function getValidMovesInDirection(playerDiscs, opponentDiscs, direction) {
    const edgeMask =
      (direction === EAST || direction === NORTH_EAST || direction === SOUTH_EAST) ? NOT_A_FILE :
      (direction === WEST || direction === NORTH_WEST || direction === SOUTH_WEST) ? NOT_H_FILE :
      0xFFFFFFFFFFFFFFFFn;

    // Find opponent pieces adjacent to our pieces
    let candidates = shift(playerDiscs, direction) & opponentDiscs & edgeMask;
    let validPositions = 0n;

    // Find empty cells after opponent pieces
    while (candidates) {
      let temp = shift(candidates, direction) & opponentDiscs & edgeMask;
      if (temp === 0n) break;
      candidates = temp;
    }

    // Empty cells after opponent sequences are valid moves
    if (candidates !== 0n) {
      validPositions = shift(candidates, direction) & ~(playerDiscs | opponentDiscs) & edgeMask;
    }

    return validPositions;
  }

  // Calculate all valid moves for a player
  function calculateValidMoves(blackDiscs, whiteDiscs, player) {
    const playerDiscs = player === BLACK ? blackDiscs : whiteDiscs;
    const opponentDiscs = player === BLACK ? whiteDiscs : blackDiscs;
    let validMoves = 0n;

    // Check all eight directions
    for (const direction of DIRECTIONS) {
      validMoves |= getValidMovesInDirection(playerDiscs, opponentDiscs, direction);
    }

    return validMoves;
  }

  // Count the number of set bits in a bitboard (population count)
  function countBits(bitboard) {
    let count = 0;
    while (bitboard) {
      bitboard &= (bitboard - 1n); // Clear the least significant set bit
      count++;
    }
    return count;
  }

  // Capture pieces in one direction
  function captureInDirection(movePosition, playerDiscs, opponentDiscs, direction) {
    const edgeMask =
      (direction === EAST || direction === NORTH_EAST || direction === SOUTH_EAST) ? NOT_A_FILE :
      (direction === WEST || direction === NORTH_WEST || direction === SOUTH_WEST) ? NOT_H_FILE :
      0xFFFFFFFFFFFFFFFFn;

    let frontier = movePosition;
    frontier = shift(frontier, direction) & edgeMask;

    if ((frontier & opponentDiscs) === 0n) return 0n; // No opponent piece in this direction

    let potentialCaptures = 0n;
    while ((frontier & opponentDiscs) !== 0n) {
      potentialCaptures |= frontier;
      frontier = shift(frontier, direction) & edgeMask;

      if ((frontier & playerDiscs) !== 0n) {
        return potentialCaptures; // Found our piece - captures are valid
      }

      if (frontier === 0n || (frontier & (playerDiscs | opponentDiscs)) === 0n) {
        break; // Reached edge or empty cell without finding our piece
      }
    }

    return 0n; // No valid captures in this direction
  }

  // Make a move and return the new game state
  function makeMove(gameState, position) {
    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const movePosition = 1n << BigInt(position);

    // Check if move is valid
    const validMoves = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);
    if ((movePosition & validMoves) === 0n) return gameState; // Invalid move

    const playerDiscs = currentPlayer === BLACK ? blackDiscs : whiteDiscs;
    const opponentDiscs = currentPlayer === BLACK ? whiteDiscs : blackDiscs;
    let capturedTotal = 0n;

    // Capture in all directions
    for (const direction of DIRECTIONS) {
      capturedTotal |= captureInDirection(movePosition, playerDiscs, opponentDiscs, direction);
    }

    // Update the boards with the move and captures
    let newBlackDiscs, newWhiteDiscs;
    if (currentPlayer === BLACK) {
      newBlackDiscs = blackDiscs | movePosition | capturedTotal;
      newWhiteDiscs = whiteDiscs & ~capturedTotal;
    } else {
      newWhiteDiscs = whiteDiscs | movePosition | capturedTotal;
      newBlackDiscs = blackDiscs & ~capturedTotal;
    }

    // Switch player
    const nextPlayer = currentPlayer === BLACK ? WHITE : BLACK;

    // Check if next player has any valid moves
    const nextPlayerMoves = calculateValidMoves(newBlackDiscs, newWhiteDiscs, nextPlayer);

    if (nextPlayerMoves !== 0n) {
      return {
        blackDiscs: newBlackDiscs,
        whiteDiscs: newWhiteDiscs,
        currentPlayer: nextPlayer
      };
    }

    // If next player has no moves, check if current player can move again
    const currentPlayerMoves = calculateValidMoves(newBlackDiscs, newWhiteDiscs, currentPlayer);

    if (currentPlayerMoves !== 0n) {
      return {
        blackDiscs: newBlackDiscs,
        whiteDiscs: newWhiteDiscs,
        currentPlayer // Same player goes again
      };
    }

    // Game over if no one can move
    return {
      blackDiscs: newBlackDiscs,
      whiteDiscs: newWhiteDiscs,
      currentPlayer: EMPTY // Game over
    };
  }

  // Get all valid moves as position indices
  function getAllValidMoves(gameState) {
    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    const validMovesBitboard = calculateValidMoves(blackDiscs, whiteDiscs, currentPlayer);

    const moves = [];
    let bitboard = validMovesBitboard;
    while (bitboard) {
      const bitPosition = countBits((bitboard & -bitboard) - 1n); // Get index of least significant bit
      moves.push(bitPosition);
      bitboard &= (bitboard - 1n); // Clear the least significant bit
    }

    return moves;
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

  // Board evaluation function
  function evaluateBoard(gameState, evalPlayer) {
    const { blackDiscs, whiteDiscs } = gameState;
    const playerDiscs = evalPlayer === BLACK ? blackDiscs : whiteDiscs;
    const opponentDiscs = evalPlayer === BLACK ? whiteDiscs : blackDiscs;

    let score = 0;

    // Position-based evaluation
    for (let i = 0; i < 64; i++) {
      const bit = 1n << BigInt(i);
      if ((playerDiscs & bit) !== 0n) {
        score += WEIGHT_BOARD[i];
      } else if ((opponentDiscs & bit) !== 0n) {
        score -= WEIGHT_BOARD[i];
      }
    }

    // Mobility (number of available moves)
    const playerMoves = countBits(calculateValidMoves(blackDiscs, whiteDiscs, evalPlayer));
    const opponentMoves = countBits(calculateValidMoves(blackDiscs, whiteDiscs, evalPlayer === BLACK ? WHITE : BLACK));
    score += 5 * (playerMoves - opponentMoves);

    return score;
  }

  // Generate a unique key for the current board state
  function generateBoardKey(gameState, depth, isMaximizing) {
    const { blackDiscs, whiteDiscs, currentPlayer } = gameState;
    return `${blackDiscs.toString(16)}-${whiteDiscs.toString(16)}-${currentPlayer}-${depth}-${isMaximizing}`;
  }

  // Minimax with Alpha-Beta pruning and transposition table
  function minimax(gameState, depth, alpha, beta, isMaximizing, evalPlayer) {
    const boardKey = generateBoardKey(gameState, depth, isMaximizing);

    // Check transposition table
    if (transpositionTable.has(boardKey)) {
      return transpositionTable.get(boardKey);
    }

    if (depth === 0 || gameState.currentPlayer === EMPTY) {
      const evaluation = evaluateBoard(gameState, evalPlayer);
      transpositionTable.set(boardKey, evaluation);
      return evaluation;
    }

    const moves = getAllValidMoves(gameState);
    if (moves.length === 0) {
      // Skip turn and let the other player move
      const newGameState = {...gameState, currentPlayer: gameState.currentPlayer === BLACK ? WHITE : BLACK};
      return minimax(newGameState, depth - 1, alpha, beta, !isMaximizing, evalPlayer);
    }

    // Sort moves by position weight for better pruning
    moves.sort((a, b) => WEIGHT_BOARD[b] - WEIGHT_BOARD[a]);

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const position of moves) {
        const newGameState = makeMove(gameState, position);
        const evall = minimax(newGameState, depth - 1, alpha, beta, false, evalPlayer);
        maxEval = Math.max(maxEval, evall);
        alpha = Math.max(alpha, evall);
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      transpositionTable.set(boardKey, maxEval);
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const position of moves) {
        const newGameState = makeMove(gameState, position);
        const evall = minimax(newGameState, depth - 1, alpha, beta, true, evalPlayer);
        minEval = Math.min(minEval, evall);
        beta = Math.min(beta, evall);
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      transpositionTable.set(boardKey, minEval);
      return minEval;
    }
  }

  // Find the best move using minimax
  function findBestMove(gameState, difficulty) {
    const depth = DIFFICULTY_DEPTH_MAP[difficulty] || 4;
    transpositionTable.clear(); // Clear table for new search

    const moves = getAllValidMoves(gameState);
    if (moves.length === 0) return null;

    let bestScore = -Infinity;
    let bestMove = null;

    // Sort moves by position weight for better pruning
    moves.sort((a, b) => WEIGHT_BOARD[b] - WEIGHT_BOARD[a]);

    for (const position of moves) {
      const newGameState = makeMove(gameState, position);
      const score = minimax(
        newGameState,
        depth - 1,
        -Infinity,
        Infinity,
        false,
        gameState.currentPlayer
      );
      if (score > bestScore) {
        bestScore = score;
        bestMove = position;
      }
    }

    return bestMove;
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
