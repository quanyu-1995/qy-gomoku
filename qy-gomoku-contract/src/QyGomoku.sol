// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import "lib/openzeppelin-contracts/contracts/access/Ownable.sol";

contract QyGomoku is ERC20, Ownable {


    struct Game {
        address creator;
        address joiner;
        address currentPlayer;
        uint256 stake;
        bool started;
        bool finished;
        address winner;
        uint32 intervalTime;
        uint32 lastMoveTime;
    }

    struct GameQueryResult {
        uint256[] gameIds;
        uint256 totalCount;
        uint256 totalPages;
    }

    event GameCreated(uint256 gameId, uint256 stake, uint32 intervalTime, address creator);
    event JoinGame(uint256 indexed _gameId, address joiner);
    event PlaceStone(uint256 indexed _gameId, address indexed player, uint8 x, uint8 y);
    event GameFinished(uint256 indexed _gameId, address winner);
    event SettleTimeout(uint256 indexed _gameId, address winner);

    mapping(uint256 => Game) public games;
    mapping(address => uint256) public userGame;
    mapping(address => mapping(uint256 => bool)) public userGameHistory;
    mapping(uint256 => mapping(uint8 => mapping(uint8 => uint8))) private gameBoard;

    mapping(uint256 => uint256) public joinableNext;
    uint256 public joinableHead;

    uint16 public feeRate = 100;
    uint256 public nextGameId;
    uint256 public maxStake = 1e19;
    uint256 public minStake = 1e14;

    constructor(string memory name, string memory symbol) 
        ERC20(name, symbol) Ownable(msg.sender) 
    {
        nextGameId = 1;
    }

    function mintWithEth() external payable {
        _mint(msg.sender, msg.value); 
    }

    function burnToEth(uint256 tokenAmount) external {
        require(balanceOf(msg.sender) >= tokenAmount, "Insufficient tokens");
        require(address(this).balance >= tokenAmount, "Contract has insufficient ETH");
        _burn(msg.sender, tokenAmount);
        payable(msg.sender).transfer(tokenAmount);
    }

    function createGame(uint256 stake, uint32 intervalTime) external returns (uint256) {
        require(stake <= maxStake && stake >= minStake, "Invalid stake");
        require(userGame[msg.sender] == 0, "Already in a game");
        
        _transfer(msg.sender, address(this), stake);
        
        games[nextGameId] = Game({
            creator: msg.sender, 
            joiner: address(0), 
            currentPlayer: msg.sender, 
            stake: stake, 
            started: false, 
            finished: false, 
            winner: address(0), 
            intervalTime: intervalTime,
            lastMoveTime: uint32(block.timestamp)
        });
        
        userGame[msg.sender] = nextGameId;
        userGameHistory[msg.sender][nextGameId] = false;
        
        joinableNext[nextGameId] = joinableHead;
        joinableHead = nextGameId;
        
        nextGameId++;
        emit GameCreated(nextGameId - 1, stake, intervalTime, msg.sender);
        return nextGameId - 1;
    }
    
    function cancelGame(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(game.creator == msg.sender, "Not creator");
        require(game.joiner == address(0), "Already joined");
        require(!game.started && !game.finished, "Game in progress");
        
        _removeFromJoinableList(_gameId);
        game.finished = true;
        _transfer(address(this), game.creator, game.stake);
        delete userGame[msg.sender];
    }

    // mode: 0 = joinable games, 1 = my history (settled games involving msg.sender), 2 = all games
    function getGames(uint256 page, uint256 pageSize, uint8 mode) external view returns (GameQueryResult memory) {
        require(pageSize > 0 && page > 0, "Invalid page params");

        uint256[] memory result = new uint256[](pageSize);
        uint256 count = 0;
        uint256 skip = (page - 1) * pageSize;
        uint256 processed = 0;
        uint256 totalCount = 0;

        if (mode == 0) {
            // joinable list (iterate linked list)
            uint256 current = joinableHead;
            while (current != 0) {
                Game storage game = games[current];
                if (game.creator != address(0) && !game.started && !game.finished && game.joiner == address(0)) {
                    if (processed >= skip && count < pageSize) {
                        result[count++] = current;
                    }
                    processed++;
                    totalCount++;
                }
                current = joinableNext[current];
            }
        } else if (mode == 1) {
            // my history (settled games involving caller)
            for (uint256 i = 1; i < nextGameId; i++) {
                if (userGameHistory[msg.sender][i]) {
                    totalCount++;
                    if (processed >= skip && count < pageSize) {
                        result[count++] = i;
                    }
                    processed++;
                }
            }
            if (userGame[msg.sender] != 0) {
                totalCount++;
                if (processed >= skip && count < pageSize) {
                    result[count++] = userGame[msg.sender];
                }
                processed++;
            }
        } else {
            // all games (iterate by id)
            for (uint256 i = 1; i < nextGameId; i++) {
                Game storage game = games[i];
                if (game.creator != address(0)) {
                    totalCount++;
                    if (processed >= skip && count < pageSize) {
                        result[count++] = i;
                    }
                    processed++;
                }
            }
        }

        uint256[] memory truncated = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            truncated[i] = result[i];
        }

        uint256 totalPages = (totalCount + pageSize - 1) / pageSize;
        return GameQueryResult(truncated, totalCount, totalPages);
    }

    function joinGame(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(game.creator != address(0), "Game not exist");
        require(!game.started, "Already started");
        require(msg.sender != game.creator, "Cannot join own game");
        require(balanceOf(msg.sender) >= game.stake, "Insufficient balance");
        
        _removeFromJoinableList(_gameId);
        _transfer(msg.sender, address(this), game.stake);
        
        game.joiner = msg.sender;
        game.started = true;
        game.currentPlayer = game.creator;
        game.lastMoveTime = uint32(block.timestamp);
        userGame[msg.sender] = _gameId;
        userGameHistory[msg.sender][_gameId] = false;
        emit JoinGame(_gameId, msg.sender);
    }

    function placeStone(uint256 _gameId, uint8 x, uint8 y) external {
        Game storage game = games[_gameId];
        require(game.started && !game.finished, "Game not active");
        require(msg.sender == game.currentPlayer, "Not your turn");

        if (block.timestamp > game.lastMoveTime + game.intervalTime) {
            address winner = msg.sender == game.creator ? game.joiner : game.creator;
            _settleGame(game, _gameId, winner);
            emit SettleTimeout(_gameId, winner);
            return;
        }

        require(x < 15 && y < 15, "Out of bounds");
        require(gameBoard[_gameId][x][y] == 0, "Already occupied");

        uint8 playerMark = msg.sender == game.creator ? 1 : 2;
        gameBoard[_gameId][x][y] = playerMark;
        emit PlaceStone(_gameId, msg.sender, x, y);

        if (checkWin(_gameId, x, y, playerMark)) {
            _settleGame(game, _gameId, msg.sender);
            emit GameFinished(_gameId, msg.sender);
        } else {
            game.currentPlayer = msg.sender == game.creator ? game.joiner : game.creator;
            game.lastMoveTime = uint32(block.timestamp);
        }
    }

    function trySettleTimeout(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(game.started && !game.finished, "Game not active");
        
        if (block.timestamp > game.lastMoveTime + game.intervalTime) {
            address winner = game.currentPlayer == game.creator ? game.joiner : game.creator;
            _settleGame(game, _gameId, winner);
            emit SettleTimeout(_gameId, winner);
        } else {
            revert("Not timeout yet");
        }
    }

    function getMyGame() external view returns (uint256){
        return userGame[msg.sender];
    }

    function getGame(uint256 gameId) external view returns (
        address, address, address, uint256, bool, bool, address, uint32, uint32
    ) {
        Game storage game = games[gameId];
        return (
            game.creator, game.joiner, game.currentPlayer,
            game.stake, game.started, game.finished,
            game.winner, game.intervalTime, game.lastMoveTime
        );
    }

    function getBoardCell(uint256 gameId, uint8 x, uint8 y) external view returns (uint8) {
        require(x < 15 && y < 15, "Out of bounds");
        return gameBoard[gameId][x][y];
    }

    function getBoard(uint256 gameId) external view returns (uint8[][] memory) {
        uint8[][] memory board = new uint8[][](15);
        for (uint8 i = 0; i < 15; i++) {
            board[i] = new uint8[](15);
            for (uint8 j = 0; j < 15; j++) {
                board[i][j] = gameBoard[gameId][i][j];
            }
        }
        return board;
    }

    function checkWin(uint256 gameId, uint8 x, uint8 y, uint8 playerMark) internal view returns (bool) {
        int256[4][2] memory dirs = [
            [int256(1), int256(0), int256(1), int256(1)], // dx
            [int256(0), int256(1), int256(1), int256(-1)] // dy
        ];

        int256 nx;
        assembly { nx := x }
        int256 ny;
        assembly { ny := y }
        
        uint8 count;
        int256 stepInt;
        int256 newX;
        int256 newY;
        uint8 newXUint;
        uint8 newYUint;

        for (uint8 dir = 0; dir < 4; dir++) {
            count = 1; 
            
            for (uint8 step = 1; step < 5; step++) {
                assembly { stepInt := step }
                newX = nx + dirs[0][dir] * stepInt;
                newY = ny + dirs[1][dir] * stepInt;
                
                if (newX < 0 || newX >= 15 || newY < 0 || newY >= 15) break;

                assembly { newXUint := newX } 
                assembly { newYUint := newY }
                if (gameBoard[gameId][newXUint][newYUint] == playerMark) {
                    count++;
                } else {
                    break;
                }
            }
            
            for (uint8 step = 1; step < 5; step++) {
                assembly { stepInt := step }
                newX = nx - dirs[0][dir] * stepInt;
                newY = ny - dirs[1][dir] * stepInt;
                
                if (newX < 0 || newX >= 15 || newY < 0 || newY >= 15) break;

                assembly { newXUint := newX }
                assembly { newYUint := newY }
                if (gameBoard[gameId][newXUint][newYUint] == playerMark) {
                    count++;
                } else {
                    break;
                }
            }
            
            if (count >= 5) return true;
        }
        
        return false;
    }

    function _removeFromJoinableList(uint256 _gameId) private {
        if (joinableHead == _gameId) {
            joinableHead = joinableNext[_gameId];
        } else {
            uint256 current = joinableHead;
            while (current != 0) {
                if (joinableNext[current] == _gameId) {
                    joinableNext[current] = joinableNext[_gameId];
                    break;
                }
                current = joinableNext[current];
            }
        }
        delete joinableNext[_gameId];
    }

    function _settleGame(Game storage game, uint256 gameId, address winner) internal {
        game.finished = true;
        game.winner = winner;
        
        uint256 total = uint256(game.stake) * 2;
        uint256 fee = total * uint256(feeRate) / 10000;
        uint256 reward = total - fee;
        
        _transfer(address(this), winner, reward);
        _transfer(address(this), owner(), fee);
        
        delete userGame[game.creator];
        delete userGame[game.joiner];
        userGameHistory[game.creator][gameId] = true;
        userGameHistory[game.joiner][gameId] = true;
    }
}