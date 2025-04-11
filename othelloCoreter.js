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
    hard: 8,
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

  // Ensure all operations in the shift function handle BigInt properly
  function shift(bitboard, direction) {
    // Apply edge masks based on the direction to prevent wrapping
    switch (String(direction)) {
      case String(EAST):
        return (bitboard & NOT_H_FILE) << 1n;
      case String(WEST):
        return (bitboard & NOT_A_FILE) >> 1n;
      case String(NORTH):
        return bitboard >> 8n;
      case String(SOUTH):
        return bitboard << 8n;
      case String(NORTH_EAST):
        return (bitboard & NOT_H_FILE) >> 7n;
      case String(NORTH_WEST):
        return (bitboard & NOT_A_FILE) >> 9n;
      case String(SOUTH_EAST):
        return (bitboard & NOT_H_FILE) << 9n;
      case String(SOUTH_WEST):
        return (bitboard & NOT_A_FILE) << 7n;
      default:
        return 0n;
    }
  }

  // Calculate valid moves in one direction
  function getValidMovesInDirection(playerDiscs, opponentDiscs, direction) {
    // Determine the appropriate edge mask
    const edgeMask =
      (direction === EAST || direction === NORTH_EAST || direction === SOUTH_EAST) ? NOT_A_FILE :
      (direction === WEST || direction === NORTH_WEST || direction === SOUTH_WEST) ? NOT_H_FILE :
      0xFFFFFFFFFFFFFFFFn;

    // Find positions adjacent to player discs where opponent discs are located
    let adjacent = shift(playerDiscs, direction) & edgeMask;
    let candidates = adjacent & opponentDiscs;

    if (candidates === 0n) return 0n; // No adjacent opponent discs

    // Continue searching for opponent discs in a line
    let validPositions = 0n;
    let frontier = candidates;

    while (frontier !== 0n) {
      // Advance in the direction
      frontier = shift(frontier, direction) & edgeMask;

      // Empty positions after opponent discs are valid moves
      let emptyPositions = frontier & ~(playerDiscs | opponentDiscs);
      if (emptyPositions !== 0n) {
        validPositions |= emptyPositions;
        break;
      }

      // Continue if more opponent discs are found
      frontier = frontier & opponentDiscs;
    }

    return validPositions;
  }

  // Capture pieces in one direction
  function captureInDirection(movePosition, playerDiscs, opponentDiscs, direction) {
    let capturedDiscs = 0n;
    let frontier = shift(movePosition, direction);

    // Continue advancing in the direction
    while (frontier !== 0n) {
      // If the frontier contains a player disc, the capture is valid
      if ((frontier & playerDiscs) !== 0n) {
        return capturedDiscs;
      }

      // If the frontier is empty or reaches the edge, no capture
      if ((frontier & opponentDiscs) === 0n) {
        return 0n;
      }

      // Accumulate opponent discs
      capturedDiscs |= frontier;

      // Advance further in the direction
      frontier = shift(frontier, direction);
    }

    return 0n; // No capture if no player disc is found
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

    console.log("calculateValidMoves: player:", player, "validMoves:", validMoves.toString(2));

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
    while (bitboard !== 0n) {
      // Using trailing zeros technique that avoids BigInt negation
      let position = 0;
      let temp = bitboard;

      // Count trailing zeros (position of least significant 1)
      while ((temp & 1n) === 0n && position < 64) {
        temp >>= 1n;
        position++;
      }

      moves.push(position);
      // Clear this bit
      bitboard &= ~(1n << BigInt(position));
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
