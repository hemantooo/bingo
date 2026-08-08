// DOM Elements
const screens = {
  lobby: document.getElementById('lobby-screen'),
  game: document.getElementById('game-screen')
};

const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const inputJoin = document.getElementById('join-input');
const createLoading = document.getElementById('create-loading');
const joinError = document.getElementById('join-error');
const displayRoomCode = document.getElementById('display-room-code');
const turnIndicator = document.getElementById('turn-indicator');
const turnText = document.getElementById('turn-text');
const bingoGrid = document.getElementById('bingo-grid');
const bingoLetters = [
  document.getElementById('letter-0'),
  document.getElementById('letter-1'),
  document.getElementById('letter-2'),
  document.getElementById('letter-3'),
  document.getElementById('letter-4')
];
const gameOverModal = document.getElementById('game-over-modal');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverMessage = document.getElementById('game-over-message');
const btnPlayAgain = document.getElementById('btn-play-again');

// Game State
let peer = null;
let conn = null;
let isHost = false;
let myTurn = false;
let boardState = []; // Array of objects { number: int, marked: bool }
let completedLines = 0;
const ROOM_PREFIX = 'bingo-web-'; // Prefix to avoid global collisions

// Initialize app
function init() {
  btnCreate.addEventListener('click', createGame);
  btnJoin.addEventListener('click', joinGame);
  btnPlayAgain.addEventListener('click', requestPlayAgain);
  
  // Format input code
  inputJoin.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 4);
  });
}

// Generates a random 4 char code
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Create a new game room
function createGame() {
  btnCreate.classList.add('hidden');
  createLoading.classList.remove('hidden');
  
  const roomCode = generateCode();
  const peerId = ROOM_PREFIX + roomCode;
  
  peer = new Peer(peerId, {
    secure: true,
    debug: 1
  });

  // Timeout if PeerJS cloud server doesn't respond
  const createTimeout = setTimeout(() => {
    console.error('PeerJS connection timed out');
    peer.destroy();
    alert('Connection to server timed out. Please try again.');
    btnCreate.classList.remove('hidden');
    createLoading.classList.add('hidden');
  }, 10000);
  
  peer.on('open', (id) => {
    clearTimeout(createTimeout);
    isHost = true;
    displayRoomCode.textContent = roomCode;
    console.log('Room Created:', roomCode);
    
    // Show game screen immediately to display the code to the host
    showScreen('game');
    turnText.textContent = "Waiting for opponent...";
    turnIndicator.classList.remove('active');
    turnIndicator.classList.add('opponent');
    bingoGrid.classList.add('disabled');
    
    // Waiting for connection
    peer.on('connection', (connection) => {
      conn = connection;
      setupConnection();
    });
  });

  peer.on('error', (err) => {
    clearTimeout(createTimeout);
    console.error('PeerJS error:', err.type, err);
    alert('Error creating game: ' + err.type + '. Please try again.');
    btnCreate.classList.remove('hidden');
    createLoading.classList.add('hidden');
  });
}

// Join an existing room
function joinGame() {
  const code = inputJoin.value;
  if (code.length !== 4) {
    showJoinError('Please enter a 4-character code.');
    return;
  }

  const peerId = ROOM_PREFIX + code;
  peer = new Peer(undefined, {
    secure: true,
    debug: 1
  });

  // Timeout if PeerJS cloud server doesn't respond
  const joinTimeout = setTimeout(() => {
    console.error('PeerJS join timed out');
    peer.destroy();
    showJoinError('Connection timed out. Please try again.');
  }, 10000);
  
  peer.on('open', () => {
    clearTimeout(joinTimeout);
    conn = peer.connect(peerId, { reliable: true });
    
    conn.on('open', () => {
      isHost = false;
      displayRoomCode.textContent = code;
      setupConnection();
    });

    conn.on('error', (err) => {
      showJoinError('Connection failed: ' + err.type);
    });
  });
  
  peer.on('error', (err) => {
    clearTimeout(joinTimeout);
    console.error('PeerJS error:', err.type, err);
    if (err.type === 'peer-unavailable') {
      showJoinError('Room not found. Check the code and try again.');
    } else {
      showJoinError('Could not connect: ' + err.type);
    }
  });
}

function showJoinError(msg) {
  joinError.textContent = msg;
  joinError.classList.remove('hidden');
  setTimeout(() => joinError.classList.add('hidden'), 3000);
}

// Setup Data Connection Events
function setupConnection() {
  showScreen('game');
  startGame();

  conn.on('data', (data) => {
    if (data.type === 'MOVE') {
      handleOpponentMove(data.number);
    } else if (data.type === 'WIN') {
      handleOpponentWin();
    } else if (data.type === 'RESTART_REQ') {
      // Automatic accept for demo
      conn.send({ type: 'RESTART_ACK' });
      startGame();
    } else if (data.type === 'RESTART_ACK') {
      startGame();
    }
  });

  conn.on('close', () => {
    alert('Opponent disconnected.');
    location.reload();
  });
}

// Game Logic
function startGame() {
  gameOverModal.classList.add('hidden');
  completedLines = 0;
  bingoLetters.forEach(letter => letter.classList.remove('active'));
  
  // Host always starts
  myTurn = isHost;
  updateTurnUI();
  
  generateBoard();
  renderBoard();
}

function generateBoard() {
  // Generate array 1-25
  let nums = Array.from({ length: 25 }, (_, i) => i + 1);
  
  // Shuffle array (Fisher-Yates)
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  
  boardState = nums.map(n => ({ number: n, marked: false }));
}

function renderBoard() {
  bingoGrid.innerHTML = '';
  
  boardState.forEach((cell, index) => {
    const cellEl = document.createElement('div');
    cellEl.className = 'bingo-cell';
    if (cell.marked) cellEl.classList.add('marked');
    cellEl.textContent = cell.number;
    
    cellEl.addEventListener('click', () => {
      if (myTurn && !cell.marked && completedLines < 5) {
        makeMove(cell.number);
      }
    });
    
    bingoGrid.appendChild(cellEl);
  });
}

function updateTurnUI() {
  if (myTurn) {
    turnIndicator.classList.add('active');
    turnIndicator.classList.remove('opponent');
    turnText.textContent = "Your Turn";
    bingoGrid.classList.remove('disabled');
  } else {
    turnIndicator.classList.add('opponent');
    turnIndicator.classList.remove('active');
    turnText.textContent = "Opponent's Turn";
    bingoGrid.classList.add('disabled');
  }
}

function makeMove(number) {
  // Mark locally
  markNumber(number);
  
  // Send to opponent
  conn.send({ type: 'MOVE', number: number });
  
  // Switch turns
  myTurn = false;
  updateTurnUI();
  
  // Check win
  checkWin();
}

function handleOpponentMove(number) {
  // Mark locally
  markNumber(number);
  
  // Switch turns
  myTurn = true;
  updateTurnUI();
  
  // Check win (in case opponent's move caused our win)
  checkWin();
}

function markNumber(number) {
  const idx = boardState.findIndex(c => c.number === number);
  if (idx !== -1) {
    boardState[idx].marked = true;
    
    // Update DOM specifically
    const cells = bingoGrid.children;
    if (cells[idx]) {
      cells[idx].classList.add('marked');
    }
  }
}

function checkWin() {
  let newCompletedLines = calculateCompletedLines();
  
  if (newCompletedLines > completedLines) {
    // Light up letters
    for (let i = completedLines; i < Math.min(newCompletedLines, 5); i++) {
      bingoLetters[i].classList.add('active');
    }
    completedLines = newCompletedLines;
  }
  
  if (completedLines >= 5) {
    conn.send({ type: 'WIN' });
    showGameOver(true);
  }
}

function calculateCompletedLines() {
  let lines = 0;
  
  // Check Rows
  for (let r = 0; r < 5; r++) {
    let rowComplete = true;
    for (let c = 0; c < 5; c++) {
      if (!boardState[r * 5 + c].marked) {
        rowComplete = false;
        break;
      }
    }
    if (rowComplete) lines++;
  }
  
  // Check Cols
  for (let c = 0; c < 5; c++) {
    let colComplete = true;
    for (let r = 0; r < 5; r++) {
      if (!boardState[r * 5 + c].marked) {
        colComplete = false;
        break;
      }
    }
    if (colComplete) lines++;
  }
  
  // Check Diagonal 1
  let d1Complete = true;
  for (let i = 0; i < 5; i++) {
    if (!boardState[i * 5 + i].marked) {
      d1Complete = false;
      break;
    }
  }
  if (d1Complete) lines++;
  
  // Check Diagonal 2
  let d2Complete = true;
  for (let i = 0; i < 5; i++) {
    if (!boardState[i * 5 + (4 - i)].marked) {
      d2Complete = false;
      break;
    }
  }
  if (d2Complete) lines++;
  
  return lines;
}

function handleOpponentWin() {
  showGameOver(false);
}

function showGameOver(isWinner) {
  gameOverTitle.textContent = isWinner ? 'You Win!' : 'You Lose!';
  gameOverTitle.style.color = isWinner ? 'var(--accent-secondary)' : 'var(--accent-danger)';
  gameOverMessage.textContent = isWinner ? 'You got 5 lines first. BINGO!' : 'Opponent got 5 lines first.';
  gameOverModal.classList.remove('hidden');
}

function requestPlayAgain() {
  btnPlayAgain.textContent = "Waiting...";
  btnPlayAgain.disabled = true;
  conn.send({ type: 'RESTART_REQ' });
}

// Utils
function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[screenName].classList.add('active');
}

// Start app
init();
