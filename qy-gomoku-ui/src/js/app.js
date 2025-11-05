import { ethers } from 'ethers';

// 合约ABI - 使用用户提供的版本
const contractABI = [
    // 用ETH兑换代币（1:1)
    'function mintWithEth() payable',
    // 用代币兑换回ETH（1:1）
    'function burnToEth(uint256 tokenAmount)',
    // 查询余额
    'function balanceOf(address account) view returns (uint256)',
    // 创建游戏
    'function createGame(uint256 stake, uint32 intervalTime) returns (uint256)',
    // 取消游戏
    'function cancelGame(uint256 _gameId)',
    // 分页查找最新可加入的游戏
    'function getJoinableGames(uint256 page, uint256 pageSize) view returns (uint256[])',
    // 加入游戏
    'function joinGame(uint256 _gameId)',
    // 落子
    'function placeStone(uint256 _gameId, uint8 x, uint8 y)',
    // 主动尝试结算超时游戏，防止锁定代币无法提取
    'function trySettleTimeout(uint256 _gameId)',
    // 授权
    'function approve(address spender, uint256 value) returns (bool)',
    // 获取游戏信息
    'function getGame(uint256 _gameId) view returns (address creator, address joiner, address currentPlayer, uint256 stake, bool started, bool finished, address winner, uint32 intervalTime, uint32 lastMoveTime)',
    // 获取游戏棋盘格子状态
    'function getBoardCell(uint256 gameId, uint8 x, uint8 y) view returns (uint8)',
    // 获取整个游戏棋盘状态
    'function getBoard(uint256 gameId) view returns (uint8[][])',
    
    // 事件
    'event JoinGame(uint256 indexed _gameId, address joiner)',
    'event PlaceStone(uint256 indexed _gameId, address indexed player, uint8 x, uint8 y)',
    'event GameFinished(uint256 indexed _gameId, address winner)',
    'event SettleTimeout(uint256 indexed _gameId, address winner)'
];

// 合约地址 - 请替换为实际部署的合约地址
const contractAddress = '0x203f6ad5f29710d349449fcf143dc70cce33ace4';

// DOM元素
const elements = {
  // 导航和视图
  lobbyView: document.getElementById('lobby-view'),
  gameView: document.getElementById('game-view'),
  lobbyTab: document.getElementById('lobby-tab'),
  gameTab: document.getElementById('game-tab'),
  
  // 钱包相关
  connect: document.getElementById('connect'),
  address: document.getElementById('address'),
  balance: document.getElementById('balance'),
  
  // 创建游戏
  createGame: document.getElementById('createGame'),
  createStake: document.getElementById('createStake'),
  createInterval: document.getElementById('createInterval'),
  
  // 游戏列表
  listGames: document.getElementById('listGames'),
  page: document.getElementById('page'),
  pageSize: document.getElementById('pageSize'),
  gamesList: document.getElementById('gamesList'),
  
  // 加载游戏
  loadGameBtn: document.getElementById('loadGameBtn'),
  loadGameId: document.getElementById('loadGameId'),
  
  // 对局界面
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
  
  // 代币操作
  refreshBalance: document.getElementById('refreshBalance'),
  mintAmount: document.getElementById('mintAmount'),
  mint: document.getElementById('mint'),
  burnAmount: document.getElementById('burnAmount'),
  burn: document.getElementById('burn'),
  
  // 棋盘
  grid: document.getElementById('grid'),
  
  // 通知
  notification: document.getElementById('notification'),
  notificationIcon: document.getElementById('notification-icon'),
  notificationMessage: document.getElementById('notification-message')
};

// 游戏状态管理
const gameState = {
  provider: null,
  signer: null,
  contract: null,
  currentAccount: null,
  currentGameId: null,
  currentGame: null,
  board: Array(15).fill().map(() => Array(15).fill(0)), // 0:空, 1:创建者, 2:加入者
  gameTimer: null,
  eventListeners: {},
  isListeningCreator: false,
  isListeningJoiner: false
};

// 显示通知
function showNotification(message, isError = false) {
  elements.notificationMessage.textContent = message;
  elements.notificationIcon.className = isError ? 'fa fa-exclamation-circle text-red-500' : 'fa fa-check-circle text-green-500';
  elements.notification.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transform translate-y-0 opacity-100 transition-all duration-300 flex items-center ${isError ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`;
  
  setTimeout(() => {
    elements.notification.className = 'fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transform translate-y-20 opacity-0 transition-all duration-300 flex items-center';
  }, 5000);
}

// 切换视图
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

// 连接钱包
async function connectWallet() {
  if (!window.ethereum) {
    showNotification('请安装 MetaMask 或其他 Web3 钱包', true);
    return;
  }
  
  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    gameState.provider = new ethers.BrowserProvider(window.ethereum);
    gameState.signer = await gameState.provider.getSigner();
    gameState.currentAccount = await gameState.signer.getAddress();
    gameState.contract = new ethers.Contract(contractAddress, contractABI, gameState.signer);
    
    // 显示地址（缩短显示）
    elements.address.textContent = `${gameState.currentAccount.slice(0, 6)}...${gameState.currentAccount.slice(-4)}`;
    elements.address.classList.remove('hidden');
    elements.balance.classList.remove('hidden');
    
    // 刷新余额
    await refreshBalance();
    
    // 监听账户变化
    window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length === 0) {
        gameState.currentAccount = null;
        elements.address.textContent = '未连接';
        elements.balance.textContent = '余额: -';
        switchView('lobby');
      } else {
        gameState.currentAccount = accounts[0];
        elements.address.textContent = `${gameState.currentAccount.slice(0, 6)}...${gameState.currentAccount.slice(-4)}`;
        await refreshBalance();
      }
    });
    
    showNotification('钱包连接成功');
    return true;
  } catch (e) {
    console.error(e);
    showNotification(`连接钱包失败: ${e.message}`, true);
    return false;
  }
}

// 刷新余额
async function refreshBalance() {
  if (!gameState.contract || !gameState.signer) return;
  
  try {
    const balance = await gameState.contract.balanceOf(gameState.currentAccount);
    elements.balance.textContent = `余额: ${ethers.formatEther(balance)} QYC`;
  } catch (e) {
    console.error('刷新余额失败:', e);
    showNotification('刷新余额失败', true);
  }
}

// Mint代币
async function mint() {
  if (!gameState.contract) {
    return showNotification('请先连接钱包', true);
  }
  
  const amount = elements.mintAmount.value;
  if (!amount || isNaN(amount) || amount <= 0) {
    return showNotification('请输入有效的金额', true);
  }
  
  try {
    const ethAmount = ethers.parseEther(amount);
    const tx = await gameState.contract.mintWithEth({ value: ethAmount });
    showNotification(`Mint交易已发送: ${tx.hash.substring(0, 10)}...`);
    
    await tx.wait();
    showNotification('Mint成功');
    await refreshBalance();
    elements.mintAmount.value = '';
  } catch (e) {
    console.error('Mint失败:', e);
    showNotification(`Mint失败: ${e?.data?.message || e.message}`, true);
  }
}

// Burn代币
async function burn() {
  if (!gameState.contract) {
    return showNotification('请先连接钱包', true);
  }
  
  const amount = elements.burnAmount.value;
  if (!amount || isNaN(amount) || amount <= 0) {
    return showNotification('请输入有效的金额', true);
  }
  
  try {
    const tokenAmount = ethers.parseEther(amount);
    
    // 先授权
    // showNotification('正在授权...');
    // const approveTx = await gameState.contract.approve(contractAddress, tokenAmount);
    // await approveTx.wait();
    
    // 执行burn
    showNotification('正在Burn...');
    const tx = await gameState.contract.burnToEth(tokenAmount);
    showNotification(`Burn交易已发送: ${tx.hash.substring(0, 10)}...`);
    
    await tx.wait();
    showNotification('Burn成功');
    await refreshBalance();
    elements.burnAmount.value = '';
  } catch (e) {
    console.error('Burn失败:', e);
    showNotification(`Burn失败: ${e?.data?.message || e.message}`, true);
  }
}

// 创建棋盘
function buildGrid() {
  elements.grid.innerHTML = '';
  
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell border border-neutral-700/30 relative';
      cell.dataset.x = x;
      cell.dataset.y = y;
      
      // 添加点击事件
      cell.addEventListener('click', async () => {
        // 执行落子
        await placeStone(gameState.currentGameId, x, y);
      });
      
      elements.grid.appendChild(cell);
    }
  }
}

// 更新棋盘显示
function updateBoard() {
  const cells = elements.grid.querySelectorAll('.cell');
  cells.forEach(cell => {
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    const value = gameState.board[y][x];
    
    // 清除之前的棋子
    cell.innerHTML = '';
    
    // 添加棋子
    if (value == 1) {
      // 创建者的棋子（黑棋）
      const stone = document.createElement('div');
      stone.className = 'absolute inset-1 rounded-full bg-black';
      cell.appendChild(stone);
    } else if (value == 2) {
      // 加入者的棋子（白棋，带黑边）
      const stone = document.createElement('div');
      stone.className = 'absolute inset-1 rounded-full bg-white border border-black';
      cell.appendChild(stone);
    }
  });
}

async function fetchBoardData(gameId) {
  if (!gameState.contract) return;
  
  try {
    // 初始化棋盘
    gameState.board = Array(15).fill().map(() => Array(15).fill(0));
    const boardCells = await gameState.contract.getBoard(gameId);
    boardCells.forEach((row, y) => {
      row.forEach((value, x) => {
        gameState.board[x][y] = value;
      });
    });
    
    return true;
  } catch (e) {
    console.error('获取棋盘数据失败:', e);
    showNotification('获取棋盘数据失败', true);
    return false;
  }
}

// 创建游戏
async function createGame() {
  if (!gameState.contract) {
    return showNotification('请先连接钱包', true);
  }
  
  const stake = Number(elements.createStake.value || 0);
  const interval = Number(elements.createInterval.value || 60);
  
  try {
    // 转换为wei
    const stakeWei = ethers.parseEther(stake.toString());
    
    // 先授权
    showNotification('正在授权...');
    const approveTx = await gameState.contract.approve(contractAddress, stakeWei);
    await approveTx.wait();
    
    // 创建游戏
    showNotification('正在创建游戏...');
    const gameId = await gameState.contract.createGame(stakeWei, interval);
    // const receipt = await tx.wait();
    showNotification(`游戏创建成功！ID: ${gameId}`);
    
    // 跳转到游戏界面
    await loadGame(gameId);
    
    // 自动填充到加载游戏ID输入框
    elements.loadGameId.value = gameId;
    
    // 刷新游戏列表
    listGames();
  } catch (e) {
    console.error('创建游戏失败:', e);
    showNotification(`创建游戏失败: ${e?.data?.message || e.message}`, true);
  }
}

// 列出可加入的游戏
async function listGames() {
  if (!gameState.contract) {
    return showNotification('请先连接钱包', true);
  }
  
  const page = Number(elements.page.value || 1);
  const pageSize = Number(elements.pageSize.value || 5);
  
  try {
    elements.gamesList.innerHTML = '<div class="col-span-full text-center py-8"><i class="fa fa-spinner fa-spin text-primary"></i> 加载中...</div>';
    
    const ids = await gameState.contract.getJoinableGames(page, pageSize);
    
    elements.gamesList.innerHTML = '';
    
    if (!ids || ids.length === 0) {
      elements.gamesList.innerHTML = '<div class="col-span-full text-neutral-500 italic">没有可加入的游戏</div>';
      return;
    }
    
    // 批量获取游戏信息
    for (const id of ids) {
      try {
        const game = await gameState.contract.getGame(id);
        const gameEl = document.createElement('div');
        gameEl.className = 'game-card';
        gameEl.innerHTML = `
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-bold">游戏 #${id}</h3>
            <span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">可加入</span>
          </div>
          <div class="space-y-1 text-sm mb-3">
            <div>创建者: ${game.creator.slice(0, 6)}...${game.creator.slice(-4)}</div>
            <div>押注: ${ethers.formatEther(game.stake)} QYC</div>
            <div>思考时间: ${game.intervalTime}秒</div>
          </div>
          <button class="join-game-btn btn-primary w-full text-sm" data-game-id="${id}">
            <i class="fa fa-sign-in mr-1"></i>加入游戏
          </button>
        `;
        elements.gamesList.appendChild(gameEl);
      } catch (e) {
        console.error(`获取游戏 ${id} 信息失败:`, e);
      }
    }
    
    // 绑定加入游戏事件
    document.querySelectorAll('.join-game-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const gameId = btn.dataset.gameId;
        await joinGame(gameId);
      });
    });
  } catch (e) {
    console.error('获取游戏列表失败:', e);
    elements.gamesList.innerHTML = `<div class="col-span-full text-red-500">获取列表失败: ${e.message}</div>`;
  }
}

// 加入游戏
async function joinGame(gameId) {
  if (!gameState.contract) {
    return showNotification('请先连接钱包', true);
  }
  
  if (!gameId || isNaN(gameId)) {
    return showNotification('请输入有效的游戏ID', true);
  }
  
  try {
    // 获取游戏信息以获取押注金额
    const game = await gameState.contract.getGame(gameId);
    
    // 先授权
    showNotification('正在授权...');
    const approveTx = await gameState.contract.approve(contractAddress, game.stake);
    await approveTx.wait();
    
    // 加入游戏
    showNotification(`正在加入游戏 #${gameId}...`);
    const tx = await gameState.contract.joinGame(gameId);
    await tx.wait();
    
    showNotification(`成功加入游戏 #${gameId}`);
    
    // 加载游戏界面
    await loadGame(gameId);
  } catch (e) {
    console.error('加入游戏失败:', e);
    showNotification(`加入游戏失败: ${e?.data?.message || e.message}`, true);
  }
}

// 加载游戏
async function loadGame(gameId) {
  if (!gameState.contract) {
    return showNotification('请先连接钱包', true);
  }
  
  if (!gameId || isNaN(gameId)) {
    return showNotification('请输入有效的游戏ID', true);
  }
  
  try {
    // 清除之前的游戏计时器
    if (gameState.gameTimer) {
      clearInterval(gameState.gameTimer);
      gameState.gameTimer = null;
    }
    
    // 获取游戏信息
    const game = await gameState.contract.getGame(gameId);
    //(address creator, address joiner, address currentPlayer, uint256 stake, bool started, bool finished, address winner, uint32 intervalTime, uint32 lastMoveTime)
    console.log('加载游戏信息:', game);
    gameState.currentGameId = gameId;
    gameState.currentGame = game;
    
    // 获取棋盘状态（逐个单元格获取）
    const boardLoaded = await fetchBoardData(gameId);
    if (!boardLoaded) {
      return;
    }
    
    // 更新UI
    elements.currentGameId.textContent = gameId;
    elements.gameStake.textContent = `${ethers.formatEther(game.stake)} QYC`;
    elements.gameCreator.textContent = `${game.creator.slice(0, 6)}...${game.creator.slice(-4)}`;
    elements.gameOpponent.textContent = game.joiner ? `${game.joiner.slice(0, 6)}...${game.joiner.slice(-4)}` : '等待中';
    elements.gameInterval.textContent = `${game.intervalTime}秒`;
    
    // 构建并更新棋盘
    buildGrid();
    updateBoard();
    
    // 清空落子记录
    elements.moveHistory.innerHTML = '';
    
    // 获取落子历史（通过事件查询）
    await loadMoveHistory(gameId);
    
    // 更新游戏状态
    updateGameStatus();
    
    // 切换到游戏视图
    switchView('game');
    
    // 设置游戏监听
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
      // 启动计时器
      startGameTimer();
    }
    
  } catch (e) {
    console.error('加载游戏失败:', e);
    showNotification(`加载游戏失败: ${e.message}`, true);
  }
}

// 加载落子历史
async function loadMoveHistory(gameId) {
  if (!gameState.contract || !gameState.provider) return;
  
  try {
    // 获取所有落子事件
    const filter = gameState.contract.filters.PlaceStone(gameId);
    const events = await gameState.contract.queryFilter(filter, 0, 'latest');
    
    if (events.length > 0) {
      elements.moveHistory.innerHTML = '';
      
      // 按时间排序
      events.sort((a, b) => a.blockNumber - b.blockNumber);
      
      // 添加到历史记录
      for (const event of events) {
        const { player, x, y } = event.args;
        const isCurrentPlayer = player.toLowerCase() === gameState.currentAccount.toLowerCase();
        const playerDesc = isCurrentPlayer ? '你' : `${player.slice(0, 6)}...`;
        
        addMoveHistory(playerDesc, x, y, isCurrentPlayer);
      }
    } else {
      elements.moveHistory.innerHTML = '<div class="text-neutral-500 italic">尚未有落子记录</div>';
    }
  } catch (e) {
    console.error('加载落子历史失败:', e);
    elements.moveHistory.innerHTML = '<div class="text-neutral-500 italic">无法加载落子记录</div>';
  }
}

// 更新游戏状态
async function updateGameStatus() {
  if (!gameState.currentGame) return;
  // 获取游戏信息
  const game = await gameState.contract.getGame(gameState.currentGameId);
  console.log('加载游戏信息:', game);
  gameState.currentGame = game;
  const { finished, winner, joiner } = gameState.currentGame;
  
  if (finished) {
    // 游戏已结束
    elements.gameStatus.textContent = winner === ethers.ZeroAddress ? '游戏结束，平局' : 
      winner.toLowerCase() === gameState.currentAccount.toLowerCase() ? '游戏结束，你获胜了！' : 
      '游戏结束，你输了';
    
    elements.gameStatus.className = winner === ethers.ZeroAddress ? 'px-4 py-2 bg-neutral-100 rounded-full text-sm font-medium' :
      winner.toLowerCase() === gameState.currentAccount.toLowerCase() ? 'px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium' :
      'px-4 py-2 bg-red-100 text-red-800 rounded-full text-sm font-medium';
      
    elements.currentPlayer.textContent = '游戏已结束';
    elements.currentPlayer.className = 'inline-block px-3 py-1 bg-neutral-100 rounded-full text-sm font-medium';
    
    // 清除计时器
    if (gameState.gameTimer) {
      clearInterval(gameState.gameTimer);
      gameState.gameTimer = null;
      elements.timeLeft.textContent = '游戏已结束';
    }
  } else if (!joiner) {
    // 等待对手加入
    elements.gameStatus.textContent = '等待对方加入...';
    elements.gameStatus.className = 'px-4 py-2 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium';
    elements.currentPlayer.textContent = '等待对手加入';
    elements.currentPlayer.className = 'inline-block px-3 py-1 bg-neutral-100 rounded-full text-sm font-medium';
  } else {
    // 游戏进行中
    elements.gameStatus.textContent = '游戏进行中';
    elements.gameStatus.className = 'px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium';
    
    // 更新当前玩家
    const isMyTurn = await isCurrentPlayerTurn();
    elements.currentPlayer.textContent = isMyTurn ? '当前回合: 你' : '当前回合: 对手';
    elements.currentPlayer.className = isMyTurn ? 'inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium' :
      'inline-block px-3 py-1 bg-neutral-100 rounded-full text-sm font-medium';
  }
}

// 检查是否是当前玩家的回合
async function isCurrentPlayerTurn() {
  if (!gameState.currentGame || !gameState.currentAccount) return false;
  
  const { creator, joiner, lastMoveTime } = gameState.currentGame;
  
  // 如果还没有玩家落子，创建者先行
  if (lastMoveTime === 0n) {
    return creator.toLowerCase() === gameState.currentAccount.toLowerCase();
  }
  
  // 获取最后一手棋的玩家
  const filter = gameState.contract.filters.PlaceStone(gameState.currentGameId);
  const events = await gameState.contract.queryFilter(filter, 0, 'latest');
  
  if (events.length === 0) {
    return creator.toLowerCase() === gameState.currentAccount.toLowerCase();
  }
  
  // 获取最后一个落子事件
  const lastEvent = events[events.length - 1];
  const lastPlayer = lastEvent.args.player;
  
  // 如果最后落子的是当前玩家，则不是当前回合
  if (lastPlayer.toLowerCase() === gameState.currentAccount.toLowerCase()) {
    return false;
  }
  
  // 否则是当前回合
  return true;
}

// 启动游戏计时器
function startGameTimer() {
  // 清除之前的计时器
  if (gameState.gameTimer) {
    clearInterval(gameState.gameTimer);
  }

  if (!gameState.currentGame || gameState.currentGame.finished || !gameState.currentGame.joiner) {
    return;
  }
  
  // 更新时间的函数
  const updateTime = () => {
    if (!gameState.currentGame) return;
    
    const { lastMoveTime, intervalTime, startTime } = gameState.currentGame;
    // 确定基准时间（最后落子时间或开始时间）
    const baseTimeSec = lastMoveTime > 0n ? lastMoveTime : startTime;
    const now = Date.now() / 1000;
    const elapsed = now - Number(baseTimeSec);
    const remaining = Math.max(0, Number(intervalTime) - elapsed);
    
    // 格式化时间
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    elements.timeLeft.textContent = `剩余时间: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // 如果时间到了，提示可以结算
    if (remaining <= 0) {
      elements.timeLeft.className = 'inline-block px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium';
      showNotification('对手已超时，可以尝试结算', false);
    } else {
      elements.timeLeft.className = 'inline-block px-3 py-1 bg-neutral-100 rounded-full text-sm font-medium';
    }
  };
  
  // 立即更新一次
  updateTime();
  
  // 每秒更新一次
  gameState.gameTimer = setInterval(updateTime, 1000);
}

// 落子
async function placeStone(gameId, x, y) {
  if (!gameState.contract) {
    return showNotification('请先连接钱包', true);
  }
  
  if (!gameId || isNaN(gameId)) {
    return showNotification('请输入有效的游戏ID', true);
  }
  
  if (x < 0 || x >= 15 || y < 0 || y >= 15) {
    return showNotification('坐标必须在0-14之间', true);
  }
  
  try {
    // 检查是否是当前玩家的回合
    const isMyTurn = await isCurrentPlayerTurn();
    if (!isMyTurn) {
      return showNotification('还没到你的回合', true);
    }
    
    // 检查单元格是否已被占用
    if (gameState.board[y][x] !== 0n) {
      return showNotification('该位置已落子', true);
    }
    
    showNotification(`正在落子 (${x}, ${y})...`);
    // 监听落子
    gameState.contract.removeAllListeners();
    const game = gameState.currentGame;
    listenPlaceStoneOnce(gameId, game.creator);
    listenPlaceStoneOnce(gameId, game.joiner);
    const tx = await gameState.contract.placeStone(gameId, x, y);
    await tx.wait();
    showNotification(`落子成功 (${x}, ${y})`);
  } catch (e) {
    console.error('落子失败:', e);
    showNotification(`落子失败: ${e?.data?.message || e.message}`, true);
  }
}

// 尝试结算超时游戏
async function trySettle(gameId) {
  if (!gameState.contract) {
    return showNotification('请先连接钱包', true);
  }
  
  if (!gameId || isNaN(gameId)) {
    return showNotification('请输入有效的游戏ID', true);
  }
  
  try {
    showNotification(`正在尝试结算游戏 #${gameId}...`);
    const tx = await gameState.contract.trySettleTimeout(gameId);
    await tx.wait();
    showNotification(`游戏 #${gameId} 结算成功`);
    
    // 如果是当前游戏，更新状态
    if (gameState.currentGameId === gameId) {
      await loadGame(gameId);
    }
  } catch (e) {
    console.error('结算失败:', e);
    showNotification(`结算失败: ${e?.data?.message || e.message}`, true);
  }
}

// 添加落子记录
function addMoveHistory(player, x, y, isCurrentPlayer) {
  const moveEl = document.createElement('div');
  moveEl.className = `p-2 rounded-md ${isCurrentPlayer ? 'bg-primary/10 text-primary' : 'bg-neutral-100'}`;
  moveEl.innerHTML = `
    <div class="flex justify-between items-center">
      <span>${player}</span>
    </div>
    <div class="text-sm">落子位置: (${x}, ${y})</div>
  `;
  
  // 添加到顶部
  elements.moveHistory.insertBefore(moveEl, elements.moveHistory.firstChild);
  
  // 自动滚动到顶部
  elements.moveHistory.scrollTop = 0;
}


function listenJoinGameOnce(gameId){
  // 监听加入游戏事件
  const joinFilter = gameState.contract.filters.JoinGame(gameId);
  const joinCallback = (event) => {
    const { _gameId, joiner } = event.args;
    if (_gameId.toString() === gameId) {
      showNotification(`${joiner.slice(0, 6)}... 已加入游戏，请落子！`);
      
      // 如果是当前查看的游戏，刷新游戏状态
      if (gameState.currentGameId === gameId) {
        loadGame(gameId);
      }
    }
  };
  gameState.contract.once(joinFilter, joinCallback); // 注册事件
}

function listenPlaceStoneOnce(gameId, player){
  // 监听落子事件
  const placeStoneFilter = gameState.contract.filters.PlaceStone(gameId, player);
  const placeStoneCallback = (event) => {
    const { _gameId, player, x, y } = event.args;
    if (_gameId.toString() === gameId) {
      const isCurrentPlayer = player.toLowerCase() === gameState.currentAccount.toLowerCase();
      const playerDesc = isCurrentPlayer ? '你' : `${player.slice(0, 6)}...`;
      
      // 更新本地棋盘 
      if (gameState.currentGame) {
        const isCreator = gameState.currentGame.creator.toLowerCase() === player.toLowerCase();
        gameState.board[y][x] = isCreator ? 1 : 2;
        
        // 如果是当前查看的游戏，更新UI
        if (gameState.currentGameId === gameId) {
          updateBoard();
          // 添加落子记录
          addMoveHistory(playerDesc, x, y, isCurrentPlayer);
          // 更新游戏状态
          updateGameStatus();
          // 重置计时器
          startGameTimer();
        } else {
          // 如果不是当前查看的游戏，显示通知
          showNotification(`${playerDesc} 在游戏 #${gameId} 落子 (${x}, ${y})`);
        }
      }
    }
  };
  gameState.contract.once(placeStoneFilter, placeStoneCallback); // 注册事件
}

function listenGameFinishedOnce(gameId){
  // 监听游戏结束事件
  const finishFilter = gameState.contract.filters.GameFinished(gameId);
  const finishCallback = (event) => {
    const { _gameId, winner } = event.args;
    if (_gameId.toString() === gameId) {
      const isWinner = winner.toLowerCase() === gameState.currentAccount.toLowerCase();
      showNotification(isWinner ? `恭喜！你赢得了游戏 #${gameId}！` : 
        `游戏 #${gameId} 已结束，获胜者是 ${winner.slice(0, 6)}...`);
      
      // 如果是当前查看的游戏，更新状态
      if (gameState.currentGameId === gameId) {
        loadGame(gameId);
      }
    }
  };
  gameState.contract.once(finishFilter, finishCallback); // 注册事件
}

function listenSettleTimeoutOnce(gameId){
  // 监听超时结算事件
  const settleFilter = gameState.contract.filters.SettleTimeout(gameId);
  const settleCallback = (event) => {
    const { _gameId, winner } = event.args;
    if (_gameId.toString() === gameId) {
      const isWinner = winner.toLowerCase() === gameState.currentAccount.toLowerCase();
      showNotification(isWinner ? `游戏 #${gameId} 对手超时，你获胜！` : 
        `游戏 #${gameId} 已超时结算，获胜者是 ${winner.slice(0, 6)}...`);
      
      // 如果是当前查看的游戏，更新状态
      if (gameState.currentGameId === gameId) {
        loadGame(gameId);
      }
    }
  };
  gameState.contract.once(settleFilter, settleCallback); // 注册事件
}

// 绑定事件
function bindEvents() {
  // 导航切换
  elements.lobbyTab.addEventListener('click', () => switchView('lobby'));
  elements.gameTab.addEventListener('click', () => switchView('game'));
  
  // 钱包连接
  elements.connect.addEventListener('click', connectWallet);
  
  // 刷新余额
  elements.refreshBalance.addEventListener('click', refreshBalance);
  
  // Mint和Burn代币
  elements.mint.addEventListener('click', mint);
  elements.burn.addEventListener('click', burn);
  
  // 创建游戏
  elements.createGame.addEventListener('click', createGame);
  
  // 列出游戏
  elements.listGames.addEventListener('click', listGames);
  
  // 加载游戏
  elements.loadGameBtn.addEventListener('click', () => {
    const gameId = elements.loadGameId.value;
    loadGame(gameId);
  });
  
  // 返回大厅
  elements.backToLobby.addEventListener('click', () => {
    // 清除游戏计时器
    if (gameState.gameTimer) {
      clearInterval(gameState.gameTimer);
      gameState.gameTimer = null;
    }
    
    switchView('lobby');
  });
  
  // 游戏内结算按钮
  elements.gameSettle.addEventListener('click', () => {
    if (gameState.currentGameId) {
      trySettle(gameState.currentGameId);
    }
  });
}

// 初始化
function init() {
  buildGrid();
  bindEvents();
  switchView('lobby');
}

// 启动应用
init();

export {};