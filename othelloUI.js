import othelloController from "./othelloController.js";

//if ('serviceWorker' in navigator) {
//  navigator.serviceWorker.register('./webCache.js');
//};

const othelloUI = (() => {
  let cacheValidMoves = [];
  const config = {
    firstPlayer: 'human',
    difficulty: 'medium',
    showHints: false
  };

  const iterateBoard = (callback) => {
    for (let pos = 0; pos < 64; pos++) {
      callback(pos);
    };
  };

  const elements = {
    board: document.getElementById('othello-board'),
    blackPlayer: document.getElementById('black-player'),
    whitePlayer: document.getElementById('white-player'),
    blackScore: document.getElementById('black-score'),
    whiteScore: document.getElementById('white-score'),
    status: document.getElementById('othello-status'),
    newGameBtn: document.getElementById('new-game-btn'),
    showHintsToggle: document.getElementById('show-hints'),
    modal: document.getElementById('new-game-modal'),
    playerOptions: document.querySelectorAll('.option-card[data-player]'),
    difficultyOptions: document.querySelectorAll('.difficulty-card[data-difficulty]'),
    startBtn: document.getElementById('start-new-game'),
    cancelBtn: document.getElementById('cancel-new-game'),
    cellMap: {}
  };

  function setupEventListeners() {
    elements.board.addEventListener('click', handleBoardClick);
    elements.newGameBtn.addEventListener('click', showNewGameModal);
    elements.cancelBtn.addEventListener('click', hideNewGameModal);
    elements.startBtn.addEventListener('click', handleNewGameStart);
    elements.showHintsToggle.addEventListener('change', () => {
      config.showHints = elements.showHintsToggle.checked;
      updateValidMoves(cacheValidMoves);
    });
    elements.playerOptions.forEach(option => {
      option.addEventListener('click', () => {
        elements.playerOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        config.firstPlayer = option.dataset.player;
      });
    });
    elements.difficultyOptions.forEach(option => {
      option.addEventListener('click', () => {
        elements.difficultyOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        config.difficulty = option.dataset.difficulty;
      });
    });
  };

  function createBoardUI() {
    elements.board.innerHTML = '';
    iterateBoard((pos)=> {
      const cell = document.createElement('div');
      cell.classList.add('othello-cell');
      cell.dataset.pos = pos;
      elements.board.appendChild(cell);
      elements.cellMap[`${pos}`] = cell;
    });
  };

  function initUI() {
    createBoardUI();
    setupEventListeners();
    config.showHints = elements.showHintsToggle.checked;
    const gameState = othelloController.init();
    refreshUI(gameState);
  };

  function handleBoardClick(e) {
    const cell = e.target.closest('.othello-cell');
    if (!cell) return;
    const pos = +cell.dataset.pos;
    const gameState = othelloController.handleMove(pos);
    if (gameState === undefined) return;
    requestAnimationFrame(() => {
      refreshUI(gameState);
    });
  };

  function refreshUI(gameState) {
    const {
      board,
      currentPlayer: player,
      validMoves: moves,
      blackCount: black,
      whiteCount: white,
      aiShouldPlay,
      message,
    } = gameState;
    cacheValidMoves = moves;
    updateBoard(board);
    updateScores(black, white);
    updateCurrentPlayer(player);
    updateValidMoves(moves);
    updateStatus(message);
    if (aiShouldPlay) {
      setTimeout(() => {
        const gameState = othelloController.makeAIMove(config);
        requestAnimationFrame(() => refreshUI(gameState));
      }, 500);
    };
  };

  function updateBoard(board) {
    iterateBoard((pos) => {
      const currentCell = board[pos];
      const cell = elements.cellMap[`${pos}`];
      cell.classList.toggle('black', currentCell === 1);
      cell.classList.toggle('white', currentCell === -1);
    });
  };

  function updateScores(blackCount, whiteCount) {
    elements.blackScore.textContent = blackCount;
    elements.whiteScore.textContent = whiteCount;
  };

  function updateCurrentPlayer(player) {
    elements.blackPlayer.classList.toggle('selected', player === 1);
    elements.whitePlayer.classList.toggle('selected', player === -1);
  };

  function updateValidMoves(validMoves) {
    document.querySelectorAll('.othello-cell.valid-move').forEach(cell => {
      cell.classList.remove('valid-move');
    });
    if (!config.showHints) return;
    validMoves.forEach(pos => {
      const cell = elements.cellMap[`${pos}`];
      if (cell) {
        cell.classList.add('valid-move');
      }
    });
  };

  function updateStatus(message) {
    elements.status.textContent = message;
  };

  function showNewGameModal() {
    elements.modal.style.display = 'flex';
  };

  function hideNewGameModal() {
    elements.modal.style.display = 'none';
  };

  function handleNewGameStart() {
    hideNewGameModal();
    const gameState = othelloController.startNewGame(config.firstPlayer);
    refreshUI(gameState);
  };

  return {
    initUI,
  };
})();

window.addEventListener('DOMContentLoaded', othelloUI.initUI);
