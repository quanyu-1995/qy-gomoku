import { ethers } from 'ethers';

const contractABI = [
    //用ETH兑换代币（1:1)
    'function mintWithEth() payable',
    //用代币兑换回ETH（1:1）
    'function burnToEth(uint256 tokenAmount)',
    //查询余额
    'function balanceOf(address account) view returns (uint256)',
    //创建游戏
    'function createGame(uint256 stake, uint256 intervalTime)',
    //取消游戏
    'function cancelGame(uint256 _gameId)',
    //分页查找最新可加入的游戏
    'function getJoinableGames(uint256 page, uint256 pageSize) view returns (uint256[] memory)',
    //加入游戏
    'function joinGame(uint256 _gameId)',
    //落子
    'function placeStone(uint256 _gameId, uint8 x, uint8 y)',
    //主动尝试结算超时游戏，防止锁定代币无法提取
    'function trySettleTimeout(uint256 _gameId)',
    //授权
    'function approve(address spender, uint256 value) returns (bool)'
];

const contractAddress = '0x174652e21e1c73356470b4bc0ccdf089d1520d25';

const elements = {
  connect: document.getElementById('connect'),
  address: document.getElementById('address'),
  balance: document.getElementById('balance'),
  contractAddress: document.getElementById('contractAddress'),
  createGame: document.getElementById('createGame'),
  createStake: document.getElementById('createStake'),
  createInterval: document.getElementById('createInterval'),
  listGames: document.getElementById('listGames'),
  page: document.getElementById('page'),
  pageSize: document.getElementById('pageSize'),
  gamesList: document.getElementById('gamesList'),
  joinGame: document.getElementById('joinGame'),
  joinGameId: document.getElementById('joinGameId'),
  placeStone: document.getElementById('placeStone'),
  placeGameId: document.getElementById('placeGameId'),
  coordX: document.getElementById('coordX'),
  coordY: document.getElementById('coordY'),
  trySettle: document.getElementById('trySettle'),
  settleGameId: document.getElementById('settleGameId'),
  refreshBalance: document.getElementById('refreshBalance'),
  mintAmount: document.getElementById('mintAmount'),
  mint: document.getElementById('mint'),
  grid: document.getElementById('grid')
};

elements.contractAddress.textContent = contractAddress;

let provider;
let signer;
let contract;

async function connectWallet() {
  if (!window.ethereum) {
    alert('请安装 MetaMask 或其他 Web3 钱包');
    return;
  }
  try {
    debugger;
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();

    const address = await signer.getAddress();
    elements.address.textContent = address;

    contract = new ethers.Contract(contractAddress, contractABI, signer);
    await refreshBalance();
  } catch (e) {
    console.error(e);
    alert('连接钱包失败: ' + e.message);
  }
}

async function refreshBalance() {
  if (!contract || !signer) return;
  const address = await signer.getAddress();
  const balance = await contract.balanceOf(address);
  elements.balance.textContent = '余额: ' + balance.toString();
}

async function mint() {
  if (!contract) return alert('先连接钱包');
  const amount = elements.mintAmount.value;
  try {
    const tx = await contract.mintWithEth({value: amount});
    alert('Mint交易已发送: ' + tx.hash);
    await tx.wait();
    alert('Mint成功');
    await refreshBalance();
  } catch (e) {
    alert('Mint失败: ' + (e?.data?.message || e.message));
  }
}

async function createGame() {
  if (!contract) return alert('先连接钱包');
  const stake = Number(elements.createStake.value || 0);
  const interval = Number(elements.createInterval.value || 60);
  try {
    const tx = await contract.approve(contractAddress, stake);
    alert('授权交易已发送: ' + tx.hash);
    await tx.wait();
    alert('授权成功');
  } catch (e) {
    alert('授权失败: ' + (e?.data?.message || e.message));
  }
  try {
    const tx = await contract.createGame(stake, interval);
    alert('tx sent: ' + tx.hash);
    await tx.wait();
    alert('创建成功');
  } catch (e) {
    alert('创建失败: ' + (e?.data?.message || e.message));
  }
}

async function listGames() {
  if (!contract) return alert('先连接钱包');
  const page = Number(elements.page.value || 1);
  const pageSize = Number(elements.pageSize.value || 10);
  try {
    debugger;
    const ids = await contract.getJoinableGames(page, pageSize);
    elements.gamesList.innerHTML = '';
    if (!ids || ids.length === 0) {
      elements.gamesList.textContent = '没有可加入的游戏';
      return;
    }
    ids.forEach(id => {
      const el = document.createElement('div');
      el.className = 'box';
      el.textContent = 'gameId: ' + id;
      const btn = document.createElement('button');
      btn.textContent = '加入';
      btn.onclick = async () => {
        try {
          const tx = await contract.joinGame(id);
          alert('tx sent: ' + tx.hash);
          await tx.wait();
          alert('加入成功');
        } catch (e) {
          alert('加入失败: ' + (e?.data?.message || e.message));
        }
      };
      el.appendChild(btn);
      elements.gamesList.appendChild(el);
    });
  } catch (e) {
    alert('获取列表失败: ' + e.message);
  }
}

async function joinGame() {
  if (!contract) return alert('先连接钱包');
  const id = Number(elements.joinGameId.value);
  if (Number.isNaN(id)) return alert('请输入 gameId');
  try {
    const tx = await contract.joinGame(id);
    alert('tx sent: ' + tx.hash);
    await tx.wait();
    alert('加入成功');
  } catch (e) {
    alert('加入失败: ' + (e?.data?.message || e.message));
  }
}

async function placeStone() {
  if (!contract) return alert('先连接钱包');
  const id = Number(elements.placeGameId.value);
  const x = Number(elements.coordX.value);
  const y = Number(elements.coordY.value);
  if (Number.isNaN(id)) return alert('请输入 gameId');
  try {
    const tx = await contract.placeStone(id, x, y);
    alert('tx sent: ' + tx.hash);
    await tx.wait();
    alert('落子成功');
  } catch (e) {
    alert('落子失败: ' + (e?.data?.message || e.message));
  }
}

async function trySettle() {
  if (!contract) return alert('先连接钱包');
  const id = Number(elements.settleGameId.value);
  if (Number.isNaN(id)) return alert('请输入 gameId');
  try {
    const tx = await contract.trySettleTimeout(id);
    alert('tx sent: ' + tx.hash);
    await tx.wait();
    alert('结算尝试已发送');
  } catch (e) {
    alert('结算失败: ' + (e?.data?.message || e.message));
  }
}

function buildGrid() {
  elements.grid.innerHTML = '';
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.addEventListener('click', () => {
        elements.coordX.value = x;
        elements.coordY.value = y;
      });
      elements.grid.appendChild(cell);
    }
  }
}

// wire events
elements.connect.onclick = connectWallet;
elements.createGame.onclick = createGame;
elements.listGames.onclick = listGames;
elements.joinGame.onclick = joinGame;
elements.placeStone.onclick = placeStone;
elements.trySettle.onclick = trySettle;
elements.refreshBalance.onclick = refreshBalance;
elements.mint.onclick = mint;

buildGrid();

export {};
