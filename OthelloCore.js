const othelloCore = (() => {
  const BOARD_SIZE = 8;
  const EMPTY_CELL = 0;
  const PLAYER_BLACK = 1;
  const PLAYER_WHITE = -1;
  const DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [ 0, -1],          [ 0, 1],
    [ 1, -1], [ 1, 0], [ 1, 1]
  ];
  const BOARD_WEIGHTS = [
    [120, -20, 20,  5,  5, 20, -20, 120],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [ 20,  -5, 15,  3,  3, 15,  -5,  20],
    [  5,  -5,  3,  3,  3,  3,  -5,   5],
    [  5,  -5,  3,  3,  3,  3,  -5,   5],
    [ 20,  -5, 15,  3,  3, 15,  -5,  20],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [120, -20, 20,  5,  5, 20, -20, 120]
  ];
  const DIFFICULTY_DEPTH_MAP = {
    noob: 1,
    easy: 2,
    medium: 4,
    hard: 6
  };

  const isOutOfBounds = (row, col) => row < 0 || row >= 8 || col < 0 || col >= 8
  const iterateBoard = (callback) => {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        callback(row, col);
      };
    };
  };

  function createNewGame() {
    const board = [
      [ 0, 0, 0, 0, 0, 0, 0, 0],
      [ 0, 0, 0, 0, 0, 0, 0, 0],
      [ 0, 0, 0, 0, 0, 0, 0, 0],
      [ 0, 0, 0,-1, 1, 0, 0, 0],
      [ 0, 0, 0, 1,-1, 0, 0, 0],
      [ 0, 0, 0, 0, 0, 0, 0, 0],
      [ 0, 0, 0, 0, 0, 0, 0, 0],
      [ 0, 0, 0, 0, 0, 0, 0, 0]
    ];
    return {
      board,
      currentPlayer: PLAYER_BLACK,
    };
  };

  function isValidMove(board, row, col, player) {
    if (board[row][col] !== EMPTY_CELL) return false;
    for (const [dr, dc] of DIRECTIONS) {
      let r = row + dr;
      let c = col + dc;
      if (isOutOfBounds(r, c) || board[r][c] !== -player) continue;
      do {
        r += dr;
        c += dc;
        if (isOutOfBounds(r, c) || board[r][c] === EMPTY_CELL) break;
        if (board[r][c] === player) return true;
      } while (true);
    };
    return false;
  };

  function hasNoValidMove(board, player) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (isValidMove(board, row, col, player)) return false;
      };
    };
    return true;
  };

  function getAllValidMoves(board, player) {
    const validMoves = [];
    iterateBoard((row, col) => {
      if (isValidMove(board, row, col, player)) validMoves.push([row, col]);
    });
    return validMoves;
  };

  function flipPieces(board, row, col, player) {
    board[row][col] = player;
    for (const [dr, dc] of DIRECTIONS) {
      let r = row + dr;
      let c = col + dc;
      const toFlip = [];
      while (!isOutOfBounds(r, c)) {
        const cell = board[r][c];
        if (cell === EMPTY_CELL) break;
        if (cell === -player) toFlip.push([r, c]);
        if (cell === player) {
          toFlip.forEach(([flipRow, flipCol]) => board[flipRow][flipCol] = player);
          break;
        };
        r += dr;
        c += dc;
      };
    };
  };

  function makeMove(gameState, row, col) {
    const newBoard = gameState.board.map(row => [...row]);
    const player = gameState.currentPlayer;
    if (!isValidMove(newBoard, row, col, player)) return gameState;
    flipPieces(newBoard, row, col, player);
    let nextPlayer = -player;
    if (hasNoValidMove(newBoard, nextPlayer)) {
      nextPlayer = player;
      if (hasNoValidMove(newBoard, nextPlayer)) {
        nextPlayer = 0;
      };
    };
    return {
      board: newBoard,
      currentPlayer: nextPlayer,
    };
  };

  function countPieces(board) {
    let blackCount = 0, whiteCount = 0;
    iterateBoard((row, col) => {
      const cell = board[row][col];
      blackCount += +(cell === PLAYER_BLACK);
      whiteCount += +(cell === PLAYER_WHITE);
    });
    return { blackCount, whiteCount };
  };

  function getGameResult(board) {
    const { blackCount, whiteCount } = countPieces(board);
    const winner = Math.sign(blackCount - whiteCount);
    return { winner, blackCount, whiteCount };
  };

  function evaluateBoard(board, player) {
    let score = 0;
    iterateBoard((row, col) => {
      score += board[row][col] * player * BOARD_WEIGHTS[row][col];
    });
    return score;
  };

  function minimax(board, depth, alpha, beta, isMaximizing, originalPlayer) {
    if (depth === 0) return evaluateBoard(board, originalPlayer);
    const currentPlayer = isMaximizing ? originalPlayer : -originalPlayer;
    const validMoves = getAllValidMoves(board, currentPlayer);
    if (validMoves.length === 0) {
      const oppositePlayer = -currentPlayer;
      if (getAllValidMoves(board, oppositePlayer).length === 0) {
        const { blackCount, whiteCount } = countPieces(board);
        const pieceDiff = originalPlayer === PLAYER_BLACK ? blackCount - whiteCount : whiteCount - blackCount;
        return pieceDiff === 0 ? 0 : 1000 * Math.sign(pieceDiff) + pieceDiff;
      }; // If both players have no valid moves, evaluate game over
      return minimax(board, depth - 1, alpha, beta, !isMaximizing, originalPlayer); //skip turn
    }; // If no valid moves, skip turn

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const [row, col] of validMoves) {
        const newBoardState = makeMove({
            board: board,
            currentPlayer: currentPlayer
            }, row, col);
        const evaluation = minimax(
            newBoardState.board,
            depth - 1,
            alpha, beta,
            false,
            originalPlayer);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break; // Alpha-beta pruning
      };
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const [row, col] of validMoves) {
        const newBoardState = makeMove({
            board: board,
            currentPlayer: currentPlayer
            }, row, col);
        const evaluation = minimax(
            newBoardState.board,
            depth - 1,
            alpha,
            beta,
            true,
            originalPlayer);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break; // Alpha-beta pruning
      };
      return minEval;
    };
  };

  function findBestMove(gameState, difficulty) {
    const {board, currentPlayer: player} = gameState;
    const validMoves = getAllValidMoves(board, player);
    if (validMoves.length === 0) return null;
    let depth = DIFFICULTY_DEPTH_MAP[difficulty] || 4;
    let bestScore = -Infinity;
    let bestMove = null;
    validMoves.forEach(([row, col]) => {
      const newBoardState = makeMove(gameState, row, col);
      const score = minimax(
          newBoardState.board,
          depth - 1,
          -Infinity,
          Infinity,
          false,
          player);
      if (score > bestScore) {
        bestScore = score;
        bestMove = [row, col];
      };
    });
    return bestMove;
  };

  return {
    createNewGame,
    makeMove,
    findBestMove,
    getAllValidMoves,
    countPieces,
    getGameResult
  };
})();

export default othelloCore;
