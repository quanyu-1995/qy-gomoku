import { ethers } from 'ethers';

const contractABI = [
    'function mintWithEth() payable',
    'function burnToEth(uint256 tokenAmount)',
    'function balanceOf(address account) view returns (uint256)',
    'function createGame(uint256 stake, uint32 intervalTime) returns (uint256)',
    'function cancelGame(uint256 _gameId)',
    'function getGames(uint256 page, uint256 pageSize, uint8 mode) view returns (tuple(uint256[] gameIds, uint256 totalCount, uint256 totalPages))',
    'function joinGame(uint256 _gameId)',
    'function placeStone(uint256 _gameId, uint8 x, uint8 y)',
    'function trySettleTimeout(uint256 _gameId)',
    'function approve(address spender, uint256 value) returns (bool)',
    'function getGame(uint256 _gameId) view returns (address creator, address joiner, address currentPlayer, uint256 stake, bool started, bool finished, address winner, uint32 intervalTime, uint32 lastMoveTime)',
    'function getMyGame() view returns (uint256)',
    'function getBoardCell(uint256 gameId, uint8 x, uint8 y) view returns (uint8)',
    'function getBoard(uint256 gameId) view returns (uint8[][])',


    'event GameCreated(uint256 gameId, uint256 stake, uint32 intervalTime, address creator)',
    'event JoinGame(uint256 indexed _gameId, address joiner)',
    'event PlaceStone(uint256 indexed _gameId, address indexed player, uint8 x, uint8 y)',
    'event GameFinished(uint256 indexed _gameId, address winner)',
    'event SettleTimeout(uint256 indexed _gameId, address winner)'
];

const contractAddress = '0x86a53e9ea51e7204b6aba012eb00b9f42946a535';

const elements = {
  // view
  lobbyView: document.getElementById('lobby-view'),
  gameView: document.getElementById('game-view'),
  lobbyTab: document.getElementById('lobby-tab'),
  gameTab: document.getElementById('game-tab'),
  
  // balance
  connect: document.getElementById('connect'),
  address: document.getElementById('address'),
  balance: document.getElementById('balance'),
  
  // create game
  createGame: document.getElementById('createGame'),
  createStake: document.getElementById('createStake'),
  createInterval: document.getElementById('createInterval'),
  
  // list games
  listGames: document.getElementById('listGames'),
  page: document.getElementById('page'),
  pageSize: document.getElementById('pageSize'),
  queryMode: document.getElementById('queryMode'),
  totalCount: document.getElementById('totalCount'),
  totalPages: document.getElementById('totalPages'),
  gamesList: document.getElementById('gamesList'),
  
  // load
  loadGameBtn: document.getElementById('loadGameBtn'),
  loadGameId: document.getElementById('loadGameId'),
  
  // play game
  backToLobby: document.getElementById('back-to-lobby'),
  currentGameId: document.getElementById('current-game-id'),
  gameStatus: document.getElementById('game-status'),
  currentPlayer: document.getElementById('current-player'),
  timeLeft: document.getElementById('time-left'),
  gameStake: document.getElementById('game-stake'),
  gameCreator: document.getElementById('game-creator'),
  gameOpponent: document.getElementById('game-opponent'),
  gameInterval: document.getElementById('game-interval'),
  moveHistory: document.getElementById('move-history'),
  gameSettle: document.getElementById('game-settle'),
  cancelGame: document.getElementById('game-cancel'),
  
  // coin management
  refreshBalance: document.getElementById('refreshBalance'),
  mintAmount: document.getElementById('mintAmount'),
  mint: document.getElementById('mint'),
  burnAmount: document.getElementById('burnAmount'),
  burn: document.getElementById('burn'),
  
  // board
  grid: document.getElementById('grid'),
  
  // notify
  notification: document.getElementById('notification'),
  notificationIcon: document.getElementById('notification-icon'),
  notificationMessage: document.getElementById('notification-message')
};

const gameState = {
  provider: null,
  signer: null,
  contract: null,
  currentAccount: null,
  currentGameId: null,
  currentGame: null,
  board: Array(15).fill().map(() => Array(15).fill(0)), // 0:empty, 1:creator, 2:joiner
  gameTimer: null,
  eventListeners: {},
  isListeningCreator: false,
  isListeningJoiner: false,
  queryMode: 0
};

function showNotification(message, isError = false) {
  elements.notificationMessage.textContent = message;
  elements.notificationIcon.className = isError ? 'fa fa-exclamation-circle text-red-500' : 'fa fa-check-circle text-green-500';
  elements.notification.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transform translate-y-0 opacity-100 transition-all duration-300 flex items-center ${isError ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`;
  
  setTimeout(() => {
    elements.notification.className = 'fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transform translate-y-20 opacity-0 transition-all duration-300 flex items-center';
  }, 10000);
}

function switchView(viewName) {
  elements.lobbyView.classList.add('hidden');
  elements.gameView.classList.add('hidden');
  
  elements.lobbyTab.classList.remove('border-primary', 'text-primary');
  elements.gameTab.classList.remove('border-primary', 'text-primary');
  
  elements.lobbyTab.classList.add('border-transparent', 'text-neutral-500');
  elements.gameTab.classList.add('border-transparent', 'text-neutral-500');
  
  if (viewName === 'lobby') {
    elements.lobbyView.classList.remove('hidden');
    elements.lobbyTab.classList.remove('border-transparent', 'text-neutral-500');
    elements.lobbyTab.classList.add('border-primary', 'text-primary');
  } else if (viewName === 'game') {
    elements.gameView.classList.remove('hidden');
    elements.gameTab.classList.remove('border-transparent', 'text-neutral-500');
    elements.gameTab.classList.add('border-primary', 'text-primary');
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    showNotification('please install MetaMask or other Web3 wallets', true);
    return;
  }
  
  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    gameState.provider = new ethers.BrowserProvider(window.ethereum);
    gameState.signer = await gameState.provider.getSigner();
    gameState.currentAccount = await gameState.signer.getAddress();
    gameState.contract = new ethers.Contract(contractAddress, contractABI, gameState.signer);
    
    elements.address.textContent = `${gameState.currentAccount.slice(0, 6)}...${gameState.currentAccount.slice(-4)}`;
    elements.address.classList.remove('hidden');
    elements.balance.classList.remove('hidden');
    
    await refreshBalance();
    
    window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length === 0) {
        gameState.currentAccount = null;
        elements.address.textContent = 'Not connected';
        elements.balance.textContent = 'balance: -';
        switchView('lobby');
      } else {
        gameState.currentAccount = accounts[0];
        elements.address.textContent = `${gameState.currentAccount.slice(0, 6)}...${gameState.currentAccount.slice(-4)}`;
        await refreshBalance();
      }
    });
    
    showNotification('Wallet connection successful');
    return true;
  } catch (e) {
    console.error(e);
    showNotification(`Wallet connection failed: ${e.message}`, true);
    return false;
  }
}

async function refreshBalance() {
  if (!gameState.contract || !gameState.signer) return;
  
  try {
    const balance = await gameState.contract.balanceOf(gameState.currentAccount);
    elements.balance.textContent = `balance: ${ethers.formatEther(balance)} QYC`;
  } catch (e) {
    console.error('Refresh balance failed:', e);
    showNotification('Refresh balance failed', true);
  }
}

async function mint() {
  if (!gameState.contract) {
    return showNotification('Please connect the wallet first', true);
  }
  
  const amount = elements.mintAmount.value;
  if (!amount || isNaN(amount) || amount <= 0) {
    return showNotification('Please enter a valid amount', true);
  }
  
  try {
    const ethAmount = ethers.parseEther(amount);
    const tx = await gameState.contract.mintWithEth({ value: ethAmount });
    showNotification(`Mint transaction has been sent: ${tx.hash.substring(0, 10)}...`);
    
    await tx.wait();
    showNotification('Mint successful');
    await refreshBalance();
    elements.mintAmount.value = '';
  } catch (e) {
    console.error('Mint failed:', e);
    showNotification(`Mint failed: ${e?.info?.error?.data?.message || e?.data?.message || e.message}`, true);
  }
}

async function burn() {
  if (!gameState.contract) {
    return showNotification('Please connect the wallet first', true);
  }
  
  const amount = elements.burnAmount.value;
  if (!amount || isNaN(amount) || amount <= 0) {
    return showNotification('Please enter a valid amount', true);
  }
  
  try {
    const tokenAmount = ethers.parseEther(amount);
    
    // showNotification('Authorizing...');
    // const approveTx = await gameState.contract.approve(contractAddress, tokenAmount);
    // await approveTx.wait();
    
    showNotification('Burning...');
    const tx = await gameState.contract.burnToEth(tokenAmount);
    showNotification(`Burn transaction has been sent: ${tx.hash.substring(0, 10)}...`);
    
    await tx.wait();
    showNotification('Burn successful');
    await refreshBalance();
    elements.burnAmount.value = '';
  } catch (e) {
    console.error('Burn failed:', e);
    showNotification(`Burn failed: ${e?.info?.error?.data?.message || e?.data?.message || e.message}`, true);
  }
}

function buildGrid() {
  elements.grid.innerHTML = '';
  
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell border border-neutral-700/30 relative';
      cell.dataset.x = x;
      cell.dataset.y = y;
      
      cell.addEventListener('click', async () => {
        await placeStone(gameState.currentGameId, x, y);
      });
      elements.grid.appendChild(cell);
    }
  }
}

function updateBoard() {
  const cells = elements.grid.querySelectorAll('.cell');
  cells.forEach(cell => {
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    const value = gameState.board[y][x];
    
    // Clear previous pieces
    cell.innerHTML = '';
    
    // Add pieces
    if (value == 1) {
      // Creator's piece (black)
      const stone = document.createElement('div');
      stone.className = 'absolute inset-1 rounded-full bg-black';
      cell.appendChild(stone);
    } else if (value == 2) {
      // Joiner's piece（white with black borders）
      const stone = document.createElement('div');
      stone.className = 'absolute inset-1 rounded-full bg-white border border-black';
      cell.appendChild(stone);
    }
  });
}

async function fetchBoardData(gameId) {
  if (!gameState.contract) return;
  
  try {
    // Initialize the chessboard
    gameState.board = Array(15).fill().map(() => Array(15).fill(0));
    const boardCells = await gameState.contract.getBoard(gameId);
    boardCells.forEach((row, y) => {
      row.forEach((value, x) => {
        gameState.board[x][y] = value;
      });
    });
    
    return true;
  } catch (e) {
    console.error('Failed to obtain chessboard data:', e);
    showNotification('Failed to obtain chessboard data', true);
    return false;
  }
}

async function createGame() {
  if (!gameState.contract) {
    return showNotification('Please connect the wallet first', true);
  }
  
  const stake = Number(elements.createStake.value || 0);
  const interval = Number(elements.createInterval.value || 60);
  
  try {
    // Convert to Wei
    const stakeWei = ethers.parseEther(stake.toString());
    
    showNotification('Authorizing...');
    const approveTx = await gameState.contract.approve(contractAddress, stakeWei);
    await approveTx.wait();
    
    showNotification('Creating game...');
    const createGameTx = await gameState.contract.createGame(stakeWei, interval);
    const cgResult = await createGameTx.wait();

    const { gameId } = gameState.contract.interface.parseLog(cgResult.logs[1]).args
    // const receipt = await tx.wait();
    showNotification(`Game created successfully! ID: ${gameId}`);
    const gameIdNum = Number(gameId);
    await loadGame(gameIdNum);
    
    // Automatically fill in the input box for loading game ID
    elements.loadGameId.value = gameIdNum;
    
    // Refresh game list
    listGames();
  } catch (e) {
    console.error('Game creation failed:', e);
    showNotification(`Game creation failed: ${e?.info?.error?.data?.message || e?.data?.message || e.message}`, true);
  }
}

async function listGames() {
  if (!gameState.contract) {
    return showNotification('Please connect the wallet first', true);
  }
  
  const page = Number(elements.page.value || 1);
  const pageSize = Number(elements.pageSize.value || 5);
  const mode = Number(elements.queryMode.value || 0);
  
  try {
    elements.gamesList.innerHTML = '<div class="col-span-full text-center py-8"><i class="fa fa-spinner fa-spin text-primary"></i> loading...</div>';
    
    const result = await gameState.contract.getGames(page, pageSize, mode);
    const { gameIds, totalCount, totalPages } = result;
    
    // Update pagination info
    elements.totalCount.textContent = `Total: ${totalCount}`;
    elements.totalPages.textContent = `Pages: ${totalPages}`;
    
    elements.gamesList.innerHTML = '';
    
    if (!gameIds || gameIds.length === 0) {
      const modeText = mode === 0 ? 'to join' : mode === 1 ? 'in history' : 'in the system';
      elements.gamesList.innerHTML = `<div class="col-span-full text-neutral-500 italic">There are no games ${modeText}</div>`;
      return;
    }
    
    // Batch obtain game information
    for (const id of gameIds) {
      try {
        const game = await gameState.contract.getGame(id);
        const gameEl = document.createElement('div');
        gameEl.className = 'game-card';
        
        let statusBadge = '';
        let actionButton = '';
        
        if (mode === 0) {
          // Joinable games
          statusBadge = '<span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Joinable</span>';
          actionButton = `<button class="join-game-btn btn-primary w-full text-sm" data-game-id="${id}"><i class="fa fa-sign-in mr-1"></i>Join</button>`;
        } else if (mode === 1) {
          // My history games
          const statusText = game.finished ? 'Finished' : 'In Progress';
          const statusClass = game.finished ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800';
          statusBadge = `<span class="px-2 py-1 ${statusClass} rounded-full text-xs">${statusText}</span>`;
          actionButton = `<button class="load-game-btn btn-primary w-full text-sm" data-game-id="${id}"><i class="fa fa-download mr-1"></i>Load</button>`;
        } else {
          // All games
          const statusText = game.finished ? 'Finished' : game.started ? 'In Progress' : 'Waiting';
          const statusClass = game.finished ? 'bg-blue-100 text-blue-800' : game.started ? 'bg-yellow-100 text-yellow-800' : 'bg-neutral-100 text-neutral-800';
          statusBadge = `<span class="px-2 py-1 ${statusClass} rounded-full text-xs">${statusText}</span>`;
          actionButton = `<button class="load-game-btn btn-primary w-full text-sm" data-game-id="${id}"><i class="fa fa-download mr-1"></i>Load</button>`;
        }
        
        gameEl.innerHTML = `
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-bold">Game #${id}</h3>
            ${statusBadge}
          </div>
          <div class="space-y-1 text-sm mb-3">
            <div>Creator: ${game.creator.slice(0, 6)}...${game.creator.slice(-4)}</div>
            <div>Bet Amount: ${ethers.formatEther(game.stake)} QYC</div>
            <div>Thinking time: ${game.intervalTime} seconds</div>
            ${game.joiner && game.joiner !== ethers.ZeroAddress ? `<div>Opponent: ${game.joiner.slice(0, 6)}...${game.joiner.slice(-4)}</div>` : ''}
          </div>
          ${actionButton}
        `;
        elements.gamesList.appendChild(gameEl);
      } catch (e) {
        console.error(`Failed to retrieve game ${id} information:`, e);
      }
    }
    
    document.querySelectorAll('.join-game-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const gameId = btn.dataset.gameId;
        await joinGame(gameId);
      });
    });
    
    document.querySelectorAll('.load-game-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const gameId = btn.dataset.gameId;
        await loadGame(gameId);
      });
    });
  } catch (e) {
    console.error('Failed to retrieve game list:', e);
    elements.gamesList.innerHTML = `<div class="col-span-full text-red-500">Failed to retrieve game list: ${e.message}</div>`;
  }
}

async function joinGame(gameId) {
  if (!gameState.contract) {
    return showNotification('Please connect the wallet first', true);
  }
  
  if (!gameId || isNaN(gameId)) {
    return showNotification('Please enter a valid game ID', true);
  }
  
  try {
    const game = await gameState.contract.getGame(gameId);
    
    showNotification('Authorizing...');
    const approveTx = await gameState.contract.approve(contractAddress, game.stake);
    await approveTx.wait();
    
    // join game
    showNotification(`Joining #${gameId}...`);
    const tx = await gameState.contract.joinGame(gameId);
    await tx.wait();
    
    showNotification(`join #${gameId} Successfully`);
    
    await loadGame(gameId);
  } catch (e) {
    console.error('join failed:', e);
    showNotification(`join failed: ${e?.info?.error?.data?.message || e?.data?.message || e.message}`, true);
  }
}

async function loadMyGame(){
  if (!gameState.contract) {
    return showNotification('Please connect the wallet first', true);
  }
  const gameId = await gameState.contract.getMyGame();
  const gameIdNum = Number(gameId);
  if(gameIdNum>0){
    loadGame(gameIdNum);
  }
}

async function loadGame(gameId) {
  if (!gameState.contract) {
    return showNotification('Please connect the wallet first', true);
  }
  
  if (!gameId || isNaN(gameId)) {
    return showNotification('Please enter a valid game ID', true);
  }
  
  try {
    // Clear the previous game timer
    if (gameState.gameTimer) {
      clearInterval(gameState.gameTimer);
      gameState.gameTimer = null;
    }
    
    // Get game information
    const game = await gameState.contract.getGame(gameId);
    //(address creator, address joiner, address currentPlayer, uint256 stake, bool started, bool finished, address winner, uint32 intervalTime, uint32 lastMoveTime)
    console.log('Load game information:', game);
    gameState.currentGameId = gameId;
    gameState.currentGame = game;
    
    // Get the status of the board
    const boardLoaded = await fetchBoardData(gameId);
    if (!boardLoaded) {
      return;
    }
    
    // update UI
    elements.currentGameId.textContent = gameId;
    elements.gameStake.textContent = `${ethers.formatEther(game.stake)} QYC`;
    elements.gameCreator.textContent = `${game.creator.slice(0, 6)}...${game.creator.slice(-4)}`;
    elements.gameOpponent.textContent = game.joiner ? `${game.joiner.slice(0, 6)}...${game.joiner.slice(-4)}` : 'Waiting';
    elements.gameInterval.textContent = `${game.intervalTime} seconds`;
    
    buildGrid();
    updateBoard();
    
    elements.moveHistory.innerHTML = '';
    
    await loadMoveHistory(gameId);
    
    updateGameStatus();
    
    switchView('game');
    
    gameState.contract.removeAllListeners();
    if (!game.started){
      listenJoinGameOnce(gameId);
    }
    if( !game.finished){
      listenGameFinishedOnce(gameId);
    }
    if (game.started && !game.finished) {
      const isMyTurn = await isCurrentPlayerTurn();
      if (!isMyTurn){
        listenPlaceStoneOnce(gameId, gameState.currentAccount==game.joiner ? game.creator : game.joiner);
      }
      startGameTimer();
    }
    
  } catch (e) {
    console.error('Game loading failed:', e);
    showNotification(`Game loading failed: ${e.message}`, true);
  }
}

async function loadMoveHistory(gameId) {
  if (!gameState.contract || !gameState.provider) return;
  
  try {
    const filter = gameState.contract.filters.PlaceStone(gameId);
    const events = await gameState.contract.queryFilter(filter, 0, 'latest');
    
    if (events.length > 0) {
      elements.moveHistory.innerHTML = '';
      
      events.sort((a, b) => a.blockNumber - b.blockNumber);
      
      for (const event of events) {
        const { player, x, y } = event.args;
        const isCurrentPlayer = player.toLowerCase() === gameState.currentAccount.toLowerCase();
        const playerDesc = isCurrentPlayer ? '你' : `${player.slice(0, 6)}...`;
        
        addMoveHistory(playerDesc, x, y, isCurrentPlayer);
      }
    } else {
      elements.moveHistory.innerHTML = '<div class="text-neutral-500 italic">There is no any drop record yet</div>';
    }
  } catch (e) {
    console.error('load drop history failed:', e);
    elements.moveHistory.innerHTML = '<div class="text-neutral-500 italic">Unable to load drop record</div>';
  }
}

async function updateGameStatus() {
  if (!gameState.currentGame) return;
  const game = await gameState.contract.getGame(gameState.currentGameId);
  console.log('loading game:', game);
  gameState.currentGame = game;
  const { finished, winner, joiner } = gameState.currentGame;
  
  if (finished) {
    elements.gameStatus.textContent = winner === ethers.ZeroAddress ? 'The game has been canceled' : 
      winner.toLowerCase() === gameState.currentAccount.toLowerCase() ? 'The game is over, you have won!' : 
      'The game is over, you lost';
    
    elements.gameStatus.className = winner === ethers.ZeroAddress ? 'px-4 py-2 bg-neutral-100 rounded-full text-sm font-medium' :
      winner.toLowerCase() === gameState.currentAccount.toLowerCase() ? 'px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium' :
      'px-4 py-2 bg-red-100 text-red-800 rounded-full text-sm font-medium';
      
    elements.currentPlayer.textContent = winner === ethers.ZeroAddress ? 'The game has been canceled' : 'The game is over';
    elements.currentPlayer.className = 'inline-block px-3 py-1 bg-neutral-100 rounded-full text-sm font-medium';
    
    if (gameState.gameTimer) {
      clearInterval(gameState.gameTimer);
      gameState.gameTimer = null;
      elements.timeLeft.textContent = winner === ethers.ZeroAddress ? 'The game has been canceled' : 'The game is over';
    }
  } else if (joiner===ethers.ZeroAddress) {
    // Waiting for opponents to join
    elements.gameStatus.textContent = 'Waiting for opponents to join...';
    elements.gameStatus.className = 'px-4 py-2 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium';
    elements.currentPlayer.textContent = 'Waiting for opponents to join';
    elements.currentPlayer.className = 'inline-block px-3 py-1 bg-neutral-100 rounded-full text-sm font-medium';
  } else {
    // The game is in progress
    elements.gameStatus.textContent = 'The game is in progress';
    elements.gameStatus.className = 'px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium';
    
    // Update current player
    const isMyTurn = await isCurrentPlayerTurn();
    elements.currentPlayer.textContent = isMyTurn ? 'Current round: You' : 'Current round: opponent';
    elements.currentPlayer.className = isMyTurn ? 'inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium' :
      'inline-block px-3 py-1 bg-neutral-100 rounded-full text-sm font-medium';
  }
}

async function isCurrentPlayerTurn() {
  if (!gameState.currentGame || !gameState.currentAccount) return false;
  
  const { creator, joiner, lastMoveTime } = gameState.currentGame;
  
  // If there are no players left yet, the creator takes the lead
  if (lastMoveTime == 0) {
    return creator.toLowerCase() === gameState.currentAccount.toLowerCase();
  }
  
  // Get the player who plays the last drop
  const filter = gameState.contract.filters.PlaceStone(gameState.currentGameId);
  const events = await gameState.contract.queryFilter(filter, 0, 'latest');
  
  if (events.length === 0) {
    return creator.toLowerCase() === gameState.currentAccount.toLowerCase();
  }
  
  // Get the last drop event
  const lastEvent = events[events.length - 1];
  const lastPlayer = lastEvent.args.player;
  
  // If the player who falls last is the current player, then it is not the current round
  if (lastPlayer.toLowerCase() === gameState.currentAccount.toLowerCase()) {
    return false;
  }
  
  // Otherwise, it is the current round
  return true;
}

function startGameTimer() {
  // Clear the previous timer
  if (gameState.gameTimer) {
    clearInterval(gameState.gameTimer);
  }

  if (!gameState.currentGame || gameState.currentGame.finished || !gameState.currentGame.joiner) {
    return;
  }
  
  const updateTime = () => {
    if (!gameState.currentGame) return;
    
    const { lastMoveTime, intervalTime, startTime } = gameState.currentGame;
    // Determine the reference time (last settling time or start time)
    const baseTimeSec = lastMoveTime > 0n ? lastMoveTime : startTime;
    const now = Date.now() / 1000;
    const elapsed = now - Number(baseTimeSec);
    const remaining = Math.max(0, Number(intervalTime) - elapsed);
    
    // format time
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    elements.timeLeft.textContent = `remaining time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // If the time is up, prompt to settle
    if (remaining <= 0) {
      elements.timeLeft.className = 'inline-block px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium';
      showNotification('The opponent has exceeded the time limit, you can try to settle', false);
    } else {
      elements.timeLeft.className = 'inline-block px-3 py-1 bg-neutral-100 rounded-full text-sm font-medium';
    }
  };
  
  updateTime();
  gameState.gameTimer = setInterval(updateTime, 1000);
}

async function placeStone(gameId, x, y) {
  if (!gameState.contract) {
    return showNotification('Please connect the wallet first', true);
  }
  
  if (!gameId || isNaN(gameId)) {
    return showNotification('Please enter a valid game ID', true);
  }
  
  if (x < 0 || x >= 15 || y < 0 || y >= 15) {
    return showNotification('The coordinates must be between 0-14', true);
  }
  
  try {
    const isMyTurn = await isCurrentPlayerTurn();
    if (!isMyTurn) {
      return showNotification('It\'s not your turn yet', true);
    }
    
    if (gameState.board[y][x] !== 0n) {
      return showNotification('This position has been placed', true);
    }
    
    showNotification(`placing: (${x}, ${y})...`);

    gameState.contract.removeAllListeners();
    const game = gameState.currentGame;
    listenPlaceStoneOnce(gameId, game.creator);
    listenPlaceStoneOnce(gameId, game.joiner);
    const tx = await gameState.contract.placeStone(gameId, x, y);
    await tx.wait();
    showNotification(`Successfully placed (${x}, ${y})`);
  } catch (e) {
    console.error('Failed to place:', e);
    showNotification(`Failed to place: ${e?.info?.error?.data?.message || e?.data?.message || e.message}`, true);
  }
}

async function trySettle(gameId) {
  if (!gameState.contract) {
    return showNotification('Please connect the wallet first', true);
  }
  
  if (!gameId || isNaN(gameId)) {
    return showNotification('Please enter a valid game ID', true);
  }
  
  try {
    showNotification(`Attempting to settle the game #${gameId}...`);
    const tx = await gameState.contract.trySettleTimeout(gameId);
    await tx.wait();
    showNotification(`Game # ${gameId} settlement successful`);
    
    if (gameState.currentGameId === gameId) {
      await loadGame(gameId);
    }
  } catch (e) {
    console.error('settlement failed:', e?.info?.error?.data?.message || e?.data?.message || e.message);
    showNotification(`settlement failed: ${e?.info?.error?.data?.message || e?.data?.message || e.message}`, true);
  }
}

async function tryCancel(gameId) {
  if (!gameState.contract) {
    return showNotification('Please connect the wallet first', true);
  }
  
  if (!gameId || isNaN(gameId)) {
    return showNotification('Please enter a valid game ID', true);
  }
  
  try {
    showNotification(`Attempting to cancel the game #${gameId}...`);
    const tx = await gameState.contract.cancelGame(gameId);
    await tx.wait();
    showNotification(`Game # ${gameId} cancellation successful`);
    
    if (gameState.currentGameId === gameId) {
      await loadGame(gameId);
    }
    
    // Refresh game list
    listGames();
  } catch (e) {
    console.error('cancellation failed:', e);
    showNotification(`cancellation failed: ${e?.info?.error?.data?.message || e?.data?.message || e.message}`, true);
  }
}

function addMoveHistory(player, x, y, isCurrentPlayer) {
  const moveEl = document.createElement('div');
  moveEl.className = `p-2 rounded-md ${isCurrentPlayer ? 'bg-primary/10 text-primary' : 'bg-neutral-100'}`;
  moveEl.innerHTML = `
    <div class="flex justify-between items-center">
      <span>${player}</span>
    </div>
    <div class="text-sm">placed: (${x}, ${y})</div>
  `;
  
  elements.moveHistory.insertBefore(moveEl, elements.moveHistory.firstChild);
  
  elements.moveHistory.scrollTop = 0;
}


function listenJoinGameOnce(gameId){
  const joinFilter = gameState.contract.filters.JoinGame(gameId);
  const joinCallback = (event) => {
    const { _gameId, joiner } = event.args;
    if (_gameId.toString() === gameId) {
      showNotification(`${joiner.slice(0, 6)}... Joined the game, please leave!`);
      
      if (gameState.currentGameId === gameId) {
        loadGame(gameId);
      }
    }
  };
  gameState.contract.once(joinFilter, joinCallback);
}

function listenPlaceStoneOnce(gameId, player){
  const placeStoneFilter = gameState.contract.filters.PlaceStone(gameId, player);
  const placeStoneCallback = (event) => {
    const { _gameId, player, x, y } = event.args;
    if (_gameId == gameId) {
      const isCurrentPlayer = player.toLowerCase() === gameState.currentAccount.toLowerCase();
      const playerDesc = isCurrentPlayer ? 'You' : `${player.slice(0, 6)}...`;
      
      if (gameState.currentGame) {
        const isCreator = gameState.currentGame.creator.toLowerCase() === player.toLowerCase();
        gameState.board[y][x] = isCreator ? 1 : 2;
        
        if (gameState.currentGameId === gameId) {
          updateBoard();
          addMoveHistory(playerDesc, x, y, isCurrentPlayer);
          updateGameStatus();
          startGameTimer();
        } else {
          showNotification(`${playerDesc} placed in game: #${gameId}  (${x}, ${y})`);
        }
      }
    }
  };
  gameState.contract.once(placeStoneFilter, placeStoneCallback);
}

function listenGameFinishedOnce(gameId){
  const finishFilter = gameState.contract.filters.GameFinished(gameId);
  const finishCallback = (event) => {
    const { _gameId, winner } = event.args;
    if (_gameId.toString() === gameId) {
      const isWinner = winner.toLowerCase() === gameState.currentAccount.toLowerCase();
      showNotification(isWinner ? `Congratulations! You won the game #${gameId}！` : 
        `Game # ${gameId} has ended, the winner is ${winner.slice(0, 6)}...`);
      
      if (gameState.currentGameId === gameId) {
        loadGame(gameId);
      }
    }
  };
  gameState.contract.once(finishFilter, finishCallback);
}

function listenSettleTimeoutOnce(gameId){
  const settleFilter = gameState.contract.filters.SettleTimeout(gameId);
  const settleCallback = (event) => {
    const { _gameId, winner } = event.args;
    if (_gameId.toString() === gameId) {
      const isWinner = winner.toLowerCase() === gameState.currentAccount.toLowerCase();
      showNotification(isWinner ? `Game # ${gameId} opponent timeout, you win!` : 
        `Game # ${gameId} has exceeded the settlement deadline, and the winner is ${winner. slice (0,6)}`);
      if (gameState.currentGameId === gameId) {
        loadGame(gameId);
      }
    }
  };
  gameState.contract.once(settleFilter, settleCallback);
}

function bindEvents() {
  // Navigation toggle
  elements.lobbyTab.addEventListener('click', () => switchView('lobby'));
  elements.gameTab.addEventListener('click', () => {
    loadMyGame();
    switchView('game');
  });
  
  // Wallet connection
  elements.connect.addEventListener('click', connectWallet);
  
  // Refresh balance
  elements.refreshBalance.addEventListener('click', refreshBalance);
  
  // Mint and Burn tokens
  elements.mint.addEventListener('click', mint);
  elements.burn.addEventListener('click', burn);
  
  // Create a game
  elements.createGame.addEventListener('click', createGame);
  
  // list Games
  elements.listGames.addEventListener('click', listGames);
  
  // query mode change
  elements.queryMode.addEventListener('change', () => {
    gameState.queryMode = Number(elements.queryMode.value);
    elements.page.value = 1; // Reset to first page when changing mode
    listGames();
  });
  
  // load Game
  elements.loadGameBtn.addEventListener('click', () => {
    const gameId = elements.loadGameId.value;
    loadGame(gameId);
  });
  
  elements.backToLobby.addEventListener('click', () => {
    if (gameState.gameTimer) {
      clearInterval(gameState.gameTimer);
      gameState.gameTimer = null;
    }
    
    switchView('lobby');
  });
  
  elements.gameSettle.addEventListener('click', () => {
    if (gameState.currentGameId) {
      trySettle(gameState.currentGameId);
    }
  });
  
  elements.cancelGame.addEventListener('click', () => {
    if (gameState.currentGameId) {
      tryCancel(gameState.currentGameId);
    }
  });
}

function init() {
  buildGrid();
  bindEvents();
  switchView('lobby');
}

init();

export {};