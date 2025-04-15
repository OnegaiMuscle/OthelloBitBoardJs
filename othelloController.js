import othelloCore from './othelloCore.js';

const othelloController = (() => {
  let gameState = {};
  let humanPlayer = 1n;
  let aiPlayer = 2n;

  function init() {
    gameState = othelloCore.createNewGame();
    return getFullGameState();
  }

  function startNewGame(firstPlayer) {
    gameState = othelloCore.createNewGame();
    humanPlayer = firstPlayer === 'human' ? 1n : 2n;
    aiPlayer = humanPlayer === 1n ? 2n : 1n;
    return getFullGameState();
  }

  function handleMove(pos) {
    // Vérification que la partie n'est pas terminée
    if (gameState.currentPlayer === 0n) {
      console.log("Game is already over");
      return getFullGameState();
    }

    console.log("handleMove called with position:", pos);

    // Vérification du tour de jeu
    if (gameState.currentPlayer !== humanPlayer) {
      console.log("Not the human player's turn. Current player:", gameState.currentPlayer);
      return getFullGameState();
    }

    // Application du coup
    const newState = othelloCore.makeMove(gameState, pos);
    if (!newState) {
      console.error("makeMove returned null");
      return getFullGameState();
    }

    if (newState === gameState) {
      console.log("Invalid move. Game state did not change.");
      return getFullGameState();
    }

    console.log("Move successful. Updating game state.");
    gameState = newState;

    // Vérification spéciale - si après le coup, c'est encore au tour du joueur humain
    // (l'IA n'a pas de coup), vérifier si le joueur a des coups valides
    if (gameState.currentPlayer === humanPlayer) {
      const humanMoves = othelloCore.getAllValidMoves(gameState);
      if (humanMoves.length === 0) {
        // Si le joueur n'a pas de coups valides non plus, la partie est terminée
        console.log("Neither player has valid moves - game over");
        gameState = {
          ...gameState,
          currentPlayer: 0n // Fin de partie
        };
      }
    }

    return getFullGameState();
  }

  function makeAIMove(config) {
    try {
      // Vérification que la partie n'est pas terminée
      if (gameState.currentPlayer === 0n) {
        console.log("Game is already over");
        return getFullGameState();
      }

      // Vérification du tour de jeu
      if (gameState.currentPlayer !== aiPlayer) {
        console.log("Not the AI's turn");
        return getFullGameState();
      }

      // Vérification des coups valides
      const validMoves = othelloCore.getAllValidMoves(gameState);
      console.log("AI valid moves:", validMoves);

      if (validMoves.length === 0) {
        console.log("AI has no valid moves");

        // Changer le tour au joueur humain
        gameState = {
          ...gameState,
          currentPlayer: humanPlayer
        };

        // Vérifier si le joueur humain a des coups valides
        const humanMoves = othelloCore.getAllValidMoves({
          ...gameState,
          currentPlayer: humanPlayer
        });

        if (humanMoves.length === 0) {
          console.log("Human also has no valid moves - game over");
          gameState = {
            ...gameState,
            currentPlayer: 0n // Fin de partie
          };
        }

        return getFullGameState();
      }

      // L'IA a des coups valides, trouver le meilleur
      const move = othelloCore.findBestMove(gameState, config.difficulty);
      console.log("AI chose move:", move);

      if (move !== null) {
        const newState = othelloCore.makeMove(gameState, move);

        if (newState) {
          gameState = newState;
          console.log("AI move successful, new state:", gameState);
        } else {
          console.error("makeMove returned an invalid state");
        }
      } else {
        console.error("findBestMove returned null despite valid moves");

        // Solution de secours: jouer le premier coup valide
        if (validMoves.length > 0) {
          console.log("Fallback: playing first valid move");
          const fallbackMove = validMoves[0];
          const newState = othelloCore.makeMove(gameState, fallbackMove);

          if (newState) {
            gameState = newState;
          }
        }
      }

      return getFullGameState();
    } catch (error) {
      console.error("Error in makeAIMove:", error);
      // Assurer un retour même en cas d'erreur
      return getFullGameState();
    }
  }

  function getFullGameState() {
    try {
      if (!gameState || !gameState.blackDiscs || !gameState.whiteDiscs) {
        console.error("Invalid gameState in getFullGameState");
        // Retourner un état par défaut
        return {
          board: Array(64).fill(0),
          currentPlayer: 0n,
          validMoves: [],
          blackCount: 0,
          whiteCount: 0,
          aiShouldPlay: false,
          message: "Error: Invalid game state"
        };
      }

      const { blackDiscs, whiteDiscs, currentPlayer } = gameState;

      // Créer le tableau de jeu
      const board = new Array(64).fill(0);
      for (let i = 0; i < 64; i++) {
        const mask = 1n << BigInt(i);
        if ((blackDiscs & mask) !== 0n) board[i] = 1;
        else if ((whiteDiscs & mask) !== 0n) board[i] = 2;
      }

      // Obtenir les coups valides et les comptages
      const validMoves = othelloCore.getAllValidMoves(gameState);
      const { blackCount, whiteCount } = othelloCore.countPieces(gameState);

      return {
        board,
        currentPlayer,
        validMoves,
        blackCount,
        whiteCount,
        aiShouldPlay: currentPlayer === aiPlayer,
        message: getStatusMessage(currentPlayer, blackCount, whiteCount)
      };
    } catch (error) {
      console.error("Error in getFullGameState:", error);
      return {
        board: Array(64).fill(0),
        currentPlayer: 0n,
        validMoves: [],
        blackCount: 0,
        whiteCount: 0,
        aiShouldPlay: false,
        message: "Error: " + error.message
      };
    }
  }

  function getStatusMessage(player, blackCount, whiteCount) {
    if (player === 0n) {
      // Déterminer le vainqueur
      let winner = 0n;
      if (blackCount > whiteCount) winner = 1n;
      else if (whiteCount > blackCount) winner = 2n;

      if (winner === 0n) return `Game Over!\nDraw\n${blackCount} to ${whiteCount}`;

      const isBlack = winner === 1n;
      const color = isBlack ? "Black" : "White";
      const playerType = winner === humanPlayer ? "You" : "AI";
      const [winScore, loseScore] = isBlack ?
        [blackCount, whiteCount] :
        [whiteCount, blackCount];

      return `Game Over!\n${color} (${playerType})\nwins\n${winScore} to ${loseScore}`;
    }

    const messages = {
      [humanPlayer]: "Your\nturn",
      [aiPlayer]: "AI is\nthinking..."
    };

    return messages[player] || "Waiting...";
  }

  return {
    init,
    startNewGame,
    handleMove,
    makeAIMove,
    getFullGameState // Exposer cette fonction peut être utile pour le débogage
  };
})();

export default othelloController;
