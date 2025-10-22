// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

// 导入 OpenZeppelin 的 ERC-20 合约和 Ownable 权限控制合约
import "lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import "lib/openzeppelin-contracts/contracts/access/Ownable.sol";
// import "forge-std/console.sol";

// 合约继承 ERC-20（实现代币标准）和 Ownable（实现所有者权限）
contract QyGomoku is ERC20, Ownable {


    struct Game {
        uint256 gameId;
        address creator;
        address joiner;
        address currentPlayer; // 当前轮到谁
        uint256 stake;
        bool started;
        bool finished;
        address winner;
        uint8[15][15] board; // 15x15棋盘
        uint256 intervalTime; //间隔时间, 单位：s
        uint256 lastMoveTime; //最后落子时间
    }

    //事件
    event JoinGame(uint256 _gameId, address joiner);
    event PlaceStone(uint256 _gameId, address player, uint8 x, uint8 y);
    event GameFinished(uint256 _gameId, address winner);
    event SettleTimeout(uint256 _gameId, address winner);

    mapping(uint256 => Game) public games;      // 所有游戏
    mapping(address => uint256) public userGame;  // 用户正在参与的游戏
    mapping(address => mapping(uint256 => bool)) public userGameHistory;// 用户的游戏历史记录（bool记录游戏是否正常结束）

    uint256 public feeRate = 100;  //1% 手续费 1/10000
    uint256 public nextGameId;
    uint256 public maxStake = 1000; // 最大下注1000代币

    // 构造函数：初始化代币名称、符号，并设置合约部署者为 owner
    constructor(
        string memory name,  // 代币名称
        string memory symbol // 代币符号
    ) ERC20(name, symbol) Ownable(msg.sender) {
    }

    // 用ETH兑换代币（1:1）
    function mintWithEth() external payable {
        // 铸造与ETH数量相等的代币
        _mint(msg.sender, msg.value); 
    }

    // 用代币兑换回ETH（1:1）
    function burnToEth(uint256 tokenAmount) external {
        // 检查用户是否有足够的代币
        require(balanceOf(msg.sender) >= tokenAmount, "Insufficient tokens");
        // 检查合约是否有足够的ETH支付
        require(address(this).balance >= tokenAmount, "Contract has insufficient ETH");
        // 先销毁用户的代币（防止重入攻击：先减后加）
        _burn(msg.sender, tokenAmount);
        // 向用户返还等量ETH
        payable(msg.sender).transfer(tokenAmount);
    }

    function createGame(uint256 stake, uint256 intervalTime) external {
        // 玩家需先 approve 合约 stake 数量
        require(stake <= maxStake, "Invalid stake");
        // 检查是否有已参加的游戏
        require(userGame[msg.sender]==0, "Already in a game");
        transfer(address(this), stake);
        games[nextGameId] = Game(
                nextGameId,
                msg.sender, 
                address(0), 
                msg.sender, 
                stake, 
                false, 
                false, 
                address(0), 
                emptyBoard(), 
                intervalTime,
                block.timestamp // 初始化最后落子时间
            );
        userGame[msg.sender] = nextGameId;
        userGameHistory[msg.sender][nextGameId] = false;
        nextGameId++;
    }
    
    // 发起者取消自己发起且无人参与的棋局
    function cancelGame(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(game.creator == msg.sender, "Not creator");
        require(game.joiner == address(0), "Already joined");
        require(!game.started, "Already started");
        require(!game.finished, "Already finished");
        game.finished = true;
        bool b = this.transfer(game.creator, game.stake);
        require(b, "Transfer to creator failed");
        delete userGame[msg.sender];
    }

    // 分页查找最新可加入的游戏
    function getJoinableGames(uint256 page, uint256 pageSize) external view returns (uint256[] memory) {
        require(pageSize > 0 && page > 0, "Invalid page params");
        uint256[] memory temp = new uint256[](pageSize);
        uint256 count = 0;
        uint256 start = nextGameId == 0 ? 0 : nextGameId - 1;
        uint256 found = 0;
        for (uint256 i = start; i >= 0 && found < page * pageSize; i--) {
            Game storage game = games[i];
            if (
                game.creator != address(0) &&
                !game.started &&
                !game.finished &&
                game.joiner == address(0)
            ) {
                found++;
                if (found > (page - 1) * pageSize && count < pageSize) {
                    temp[count] = i;
                    count++;
                }
            }
            if (i == 0) break;
        }
        // 如果实际数量不足 pageSize，截断数组
        uint256[] memory result = new uint256[](count);
        for (uint256 j = 0; j < count; j++) {
            result[j] = temp[j];
        }
        return result;
    }

    // 加入游戏
    function joinGame(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(game.creator != address(0), "Game not exist");
        require(!game.started, "Already started");
        require(msg.sender != game.creator, "Cannot join own game");
        require(balanceOf(msg.sender)>=game.stake, "Insufficient balance");

        transfer(address(this), game.stake);
        game.joiner = msg.sender;
        game.started = true;
        game.currentPlayer = game.creator;
        // 更新最后落子时间
        game.lastMoveTime = block.timestamp;
        // 记录用户参与的游戏
        userGame[msg.sender] = _gameId;
        userGameHistory[msg.sender][_gameId] = false;
        // 广播事件
        emit JoinGame(_gameId, msg.sender);
    }

    // 落子
    function placeStone(uint256 _gameId, uint8 x, uint8 y) external {
        Game storage game = games[_gameId];
        require(game.started && !game.finished, "Game not active");
        require(msg.sender == game.currentPlayer, "Not your turn");

        // 超时判负逻辑
        if (block.timestamp > game.lastMoveTime + game.intervalTime) {
            game.finished = true;
            // 超时，胜者为对方
            address winner = msg.sender == game.creator ? game.joiner : game.creator;
            game.winner = winner;
            uint256 total = game.stake * 2;
            uint256 fee = total * feeRate / 10000;
            uint256 reward = total - fee;
            bool b = this.transfer(winner, reward);
            require(b, "Transfer to winner failed");
            b= this.transfer(owner(), fee);
            require(b, "Transfer to owner failed");
            return;
        }

        require(x < 15 && y < 15, "Out of bounds");
        require(game.board[x][y] == 0, "Already occupied");

        uint8 playerMark = msg.sender == game.creator ? 1 : 2;
        game.board[x][y] = playerMark;

        // 广播落子事件
        emit PlaceStone(_gameId, msg.sender, x, y);

        // 检查胜负
        if (checkWin(game.board, x, y, playerMark)) {
            game.finished = true;
            game.winner = msg.sender;
            // 分配奖励
            uint256 total = game.stake * 2;
            uint256 fee = total * feeRate / 10000;
            uint256 reward = total - fee;
            bool b = this.transfer(game.winner, reward);
            require(b, "Transfer to winner failed");
            b = this.transfer(owner(), fee);
            require(b, "Transfer to owner failed");
            game.finished = true;
            //更新历史记录状态
            userGameHistory[game.creator][_gameId] = true;
            userGameHistory[game.joiner][_gameId] = true;
            emit GameFinished(_gameId, msg.sender);
        } else {
            // 轮到另一方
            game.currentPlayer = msg.sender == game.creator ? game.joiner : game.creator;
            // 更新最后落子时间
            game.lastMoveTime = block.timestamp;
        }
    }

    // 主动尝试结算超时游戏，防止锁定代币无法提取
    function trySettleTimeout(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(game.started && !game.finished, "Game not active");
        // 判断当前轮到玩家是否超时
        if (block.timestamp > game.lastMoveTime + game.intervalTime) {
            game.finished = true;
            address winner = game.currentPlayer == game.creator ? game.joiner : game.creator;
            game.winner = winner;
            uint256 total = game.stake * 2;
            uint256 fee = total * feeRate / 10000;
            uint256 reward = total - fee;
            bool b = this.transfer(winner, reward);
            require(b, "Transfer to winner failed");
            b = this.transfer(owner(), fee);
            require(b, "Transfer to owner failed");
            //更新历史记录状态
            userGameHistory[game.creator][_gameId] = true;
            userGameHistory[game.joiner][_gameId] = true;
            // 广播事件
            emit SettleTimeout(_gameId, winner);
        } else {
            revert("Not timeout yet");
        }
    }

    function getGame(uint256 gameId) external view returns (
        uint256,
        address,
        address,
        address,
        uint256,
        bool,
        bool,
        address,
        uint8[15][15] memory,
        uint256,
        uint256
    ) {
        Game storage game = games[gameId];
        return (
            game.gameId,
            game.creator,
            game.joiner,
            game.currentPlayer,
            game.stake,
            game.started,
            game.finished,
            game.winner,
            game.board,
            game.intervalTime,
            game.lastMoveTime
        );
    }

    // 检查五连胜
    function checkWin(uint8[15][15] memory board, uint8 x, uint8 y, uint8 playerMark) internal pure returns (bool) {
        // 检查横、竖、斜方向是否有五连
        int256[4] memory dx = [int256(1), int256(0), int256(1), int256(1)]; // 右、下、右下、右上
        int256[4] memory dy = [int256(0), int256(1), int256(1), int256(-1)];
        for (uint8 dir = 0; dir < 4; dir++) {
            uint8 count = 1;
            // 向正方向查找
            int256 nx = int256(uint256(x));
            int256 ny = int256(uint256(y));
            for (uint8 step = 1; step < 5; step++) {
                nx += dx[dir];
                ny += dy[dir];
                if (nx < 0 || nx >= 15 || ny < 0 || ny >= 15) break;
                if (board[uint8(uint256(nx))][uint8(uint256(ny))] == playerMark) {
                    count++;
                } else {
                    break;
                }
            }
            // 向反方向查找
            nx = int256(uint256(x));
            ny = int256(uint256(y));
            for (uint8 step = 1; step < 5; step++) {
                nx -= dx[dir];
                ny -= dy[dir];
                if (nx < 0 || nx >= 15 || ny < 0 || ny >= 15) break;
                if (board[uint8(uint256(nx))][uint8(uint256(ny))] == playerMark) {
                    count++;
                } else {
                    break;
                }
            }
            if (count >= 5) {
                return true;
            }
        }
        return false;
    }

    // 初始化空棋盘
    function emptyBoard() internal pure returns (uint8[15][15] memory board) {
        for (uint8 i = 0; i < 15; i++) {
            for (uint8 j = 0; j < 15; j++) {
                board[i][j] = 0;
            }
        }
    }
}