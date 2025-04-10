import othelloCore from './othelloCore.js';

const othelloController = (() => {
  let gameState = {};
  let humanPlayer = 1;
  let aiPlayer = -1;

  function init() {
    gameState = othelloCore.createNewGame();
    return getFullGameState();
  };

  function startNewGame(firstPlayer) {
    gameState = othelloCore.createNewGame();
    humanPlayer = firstPlayer === 'human' ? 1 : -1;
    aiPlayer = -humanPlayer;
    return getFullGameState();
  };

  function handleMove(pos) {
    if (gameState.currentPlayer !== humanPlayer) return;
    const newState = othelloCore.makeMove(gameState, pos);
    if (newState === gameState) return;
    gameState = newState;
    return getFullGameState();
  };

  function makeAIMove(config) {
    const move = othelloCore.findBestMove(gameState, config.difficulty);
    if (move) {
      const pos = move;
      gameState = othelloCore.makeMove(gameState, pos);
      return getFullGameState();
    };
  };

  function getFullGameState() {
    const { blackDiscs, whiteDiscs, currentPlayer: player } = gameState;
    const board = new Array(64).fill(0);
    for (let i = 0; i < 64; i++) {
      if (blackDiscs & (1n << BigInt(i))) board[i] = 1;
      else if (whiteDiscs & (1n << BigInt(i))) board[i] = -1;
    };
    return {
      board,
      currentPlayer: player,
      validMoves: othelloCore.getAllValidMoves(gameState), // Pass gameState directly to ensure BigInt compatibility
      ...othelloCore.countPieces(gameState), // Pass gameState directly for consistency
      aiShouldPlay: player === aiPlayer,
      message: getStatusMessage()
    };
  };

  function getStatusMessage() {
    const { board, currentPlayer: player } = gameState;
    if (player === 0) {
      const { winner, blackCount, whiteCount } = othelloCore.getGameResult(board);
      if (winner === 0) return `Game Over!\nDraw\n${blackCount} to ${whiteCount}`;
      const isBlack = winner === 1;
      const color = isBlack ? "Black" : "White";
      const playerType = winner === humanPlayer ? "You" : "AI";
      const [winScore, loseScore] = isBlack ?
        [blackCount, whiteCount] :
        [whiteCount, blackCount];
      return `Game Over!\n${color} (${playerType})\nwins\n${winScore} to ${loseScore}`;
    };
    const messages = {
      [humanPlayer]: "Your\nturn",
      [aiPlayer]: "AI is\nthinking..."
    };
    return messages[player] || "Waiting...";
  };

  return {
    init,
    startNewGame,
    handleMove,
    makeAIMove
  };
})();

export default othelloController;
