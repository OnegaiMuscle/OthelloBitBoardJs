import othelloCore from './othelloCore.js';

const othelloController = (() => {
  let gameState = {};
  let humanPlayer = 1n;
  let aiPlayer = 2n;

  function init() {
    gameState = othelloCore.createNewGame();
    return getFullGameState();
  };

  function startNewGame(firstPlayer) {
    gameState = othelloCore.createNewGame();
    humanPlayer = firstPlayer === 'human' ? 1n : 2n;
    aiPlayer = humanPlayer === 1 ? 2n : 1n;
    return getFullGameState();
  };

  function handleMove(pos) {
    console.log("handleMove called with position:", pos);
    if (gameState.currentPlayer !== humanPlayer) {
      console.log("Not the human player's turn. Current player:", gameState.currentPlayer);
      return;
    }
    const newState = othelloCore.makeMove(gameState, pos);
    if (newState === gameState) {
      console.log("Invalid move. Game state did not change.");
      return;
    }
    console.log("Move successful. Updating game state.");
    gameState = newState;
    return getFullGameState();
  };

  function makeAIMove(config) {
    try {
      // Vérifier explicitement s'il y a des coups valides
      const validMoves = othelloCore.getAllValidMoves(gameState);

      if (validMoves.length === 0) {
        console.log("L'IA n'a pas de coups valides");
        // Changer le joueur
        gameState = {
          ...gameState,
          currentPlayer: humanPlayer
        };
        return getFullGameState();
      }

      const move = othelloCore.findBestMove(gameState, config.difficulty);

      if (move) {
        const newState = othelloCore.makeMove(gameState, move);
        if (newState) {
          gameState = newState;
        } else {
          console.error("makeMove a retourné un état invalide");
        }
      } else {
        console.error("findBestMove a retourné null malgré des coups valides");
      }

      // Toujours retourner un état de jeu valide
      return getFullGameState();
    } catch (error) {
      console.error("Erreur dans makeAIMove:", error);
      // Assurer un retour même en cas d'erreur
      return getFullGameState();
    }
  };

  function getFullGameState() {
    const { blackDiscs, whiteDiscs, currentPlayer: player } = gameState;
    const board = new Array(64).fill(0);
    for (let i = 0; i < 64; i++) {
      if (blackDiscs & (1n << BigInt(i))) board[i] = 1;
      else if (whiteDiscs & (1n << BigInt(i))) board[i] = 2;
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
