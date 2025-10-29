// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {QyGomoku} from "../src/QyGomoku.sol";
import "forge-std/console.sol";

contract QyGomokuTest is Test {
    QyGomoku public qyGomoku;
    address public u1;
    address public u2;
    uint256 public gameId;
    bool public isPrint;

    function setUp() public {
        isPrint = false;
        qyGomoku = new QyGomoku("QuanYu Coin", "QYC");
        u1 = address(0x1111);
        u2 = address(0x2222);
        // 1. 给用户充值 ETH 用于 mint 代币
        vm.deal(u1, 1 ether); 
        vm.deal(u2, 1 ether); 
    }

    function test_fullGame() public {
        uint256 startGas = gasleft();
        test_mint();
        uint256 endGas = gasleft();
        console.log(unicode"test_mint 操作消耗的 gas:", startGas - endGas);

        startGas = gasleft();
        test_createGame();
        endGas = gasleft();
        console.log(unicode"test_createGame 操作消耗的 gas: %s", startGas - endGas);

        startGas = gasleft();
        test_joinGame();
        endGas = gasleft();
        console.log(unicode"test_joinGame 操作消耗的 gas: %s", startGas - endGas);
        
        // test_printGame();
        
        startGas = gasleft();
        test_placeStone();
        endGas = gasleft();
        console.log(unicode"test_placeStone 操作消耗的 gas: %s", startGas - endGas);

        console.log("U1 balance:", qyGomoku.balanceOf(u1));
        console.log("U2 balance:", qyGomoku.balanceOf(u2));
        console.log("owner balance:", qyGomoku.balanceOf(qyGomoku.owner()));
    }

    function test_printGame() public {
        (
            address creator, address joiner, address currentPlayer,
            uint256 stake, bool started, bool finished,
            address winner, uint32 intervalTime, uint32 lastMoveTime
        ) = qyGomoku.getGame(gameId);
        console.log("Game Info:");
        console.log("Creator:", creator);
        console.log("Joiner:", joiner);
        console.log("Current Player:", currentPlayer);
        console.log("Stake:", stake);
        console.log("Started:", started);
        console.log("Finished:", finished);
        console.log("Winner:", winner);
        console.log("Interval Time:", intervalTime);
        console.log("Last Move Time:", lastMoveTime);
        console.log("creator==currentPlayer:", creator==currentPlayer);
    }

    function test_mint() public {
        vm.prank(u1);
        qyGomoku.mintWithEth{value: 1e18}(); 
        assertEq(qyGomoku.balanceOf(u1), 1e18); // 验证 mint 成功
        vm.prank(u2);
        qyGomoku.mintWithEth{value: 1e18}();
        assertEq(qyGomoku.balanceOf(u2), 1e18); // 验证 mint 成功
    }
    
    function test_approve() public {
        vm.prank(u1);
        qyGomoku.approve(address(qyGomoku), 100); 
        assertEq(qyGomoku.allowance(u1, address(qyGomoku)), 100); // 验证授权成功
        vm.prank(u2);
        qyGomoku.approve(address(qyGomoku), 100); 
        assertEq(qyGomoku.allowance(u2, address(qyGomoku)), 100); // 验证授权成功
    }

    function test_createGame() public {
        vm.prank(u1);
        gameId = qyGomoku.createGame(1e14, 600);
        // assertEq(qyGomoku.balanceOf(u1), 900); // 剩余900代币
    }

    function test_joinGame() public {
        vm.prank(u2);
        qyGomoku.joinGame(gameId);
        // assertEq(qyGomoku.balanceOf(u2), 900); // 剩余900代币
        printBoard(gameId);
    }

    function test_placeStone() public {
        vm.prank(u1);
        uint256 startGas = gasleft();
        qyGomoku.placeStone(gameId, 7, 7); // u1下在(7,7)
        uint256 endGas = gasleft();
        console.log(unicode"----------placeStone %s, %s gas: %s", 7, 7, startGas - endGas);
        printBoard(gameId);

        vm.prank(u2);
        startGas = gasleft();
        qyGomoku.placeStone(gameId, 7, 8); // u2下在(7,8)
        endGas = gasleft();
        console.log(unicode"----------placeStone %s, %s 消耗gas: %s", 7, 8, startGas - endGas);
        printBoard(gameId);

        vm.prank(u1);
        startGas = gasleft();
        qyGomoku.placeStone(gameId, 8, 7); // u1下在(8,7)
        endGas = gasleft();
        console.log(unicode"----------placeStone %s, %s gas: %s", 8, 7, startGas - endGas);
        printBoard(gameId);

        vm.prank(u2);
        startGas = gasleft();
        qyGomoku.placeStone(gameId, 8, 8); // u2下在(8,8)
        endGas = gasleft();
        console.log(unicode"----------placeStone %s, %s gas: %s", 8, 8, startGas - endGas);
        printBoard(gameId);

        vm.prank(u1);
        startGas = gasleft();
        qyGomoku.placeStone(gameId, 9, 7); // u1下在(9,7)
        endGas = gasleft();
        console.log(unicode"----------placeStone %s, %s gas: %s", 9, 7, startGas - endGas);
        printBoard(gameId);

        vm.prank(u2);
        startGas = gasleft();
        qyGomoku.placeStone(gameId, 9, 8); // u2下在(9,8)
        endGas = gasleft();
        console.log(unicode"----------placeStone %s, %s gas: %s", 9, 8, startGas - endGas);
        printBoard(gameId);

        vm.prank(u1);
        startGas = gasleft();
        qyGomoku.placeStone(gameId, 10, 7); // u1下在(10,7)
        endGas = gasleft();
        console.log(unicode"----------placeStone %s, %s gas: %s", 10, 7, startGas - endGas);
        printBoard(gameId);

        vm.prank(u2);
        startGas = gasleft();
        qyGomoku.placeStone(gameId, 10, 8); // u2下在(10,8)
        endGas = gasleft();
        console.log(unicode"----------placeStone %s, %s gas: %s", 10, 8, startGas - endGas);
        printBoard(gameId);

        vm.prank(u1);
        startGas = gasleft();
        qyGomoku.placeStone(gameId, 11, 7); // u1下在(11,7)
        endGas = gasleft();
        console.log(unicode"----------placeStone %s, %s gas: %s", 11, 7, startGas - endGas);
        printBoard(gameId);

    }

    function printBoard(uint256 gameId) internal {
        if(isPrint){
            uint8[][] memory boardArr = qyGomoku.getBoard(gameId);
            for (uint256 i = 0; i < boardArr.length; i++) {
                string memory row = "";
                for (uint256 j = 0; j < boardArr[i].length; j++) {
                    string memory cell = '';
                    if(boardArr[i][j] == 1)
                        cell = "-";
                    else if(boardArr[i][j] == 2)
                        cell = "*";
                    row = string(abi.encodePacked(row, cell, ", "));
                }
                console.log(row);
            }
        }
    }
}
