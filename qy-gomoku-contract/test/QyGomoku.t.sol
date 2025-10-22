// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {QyGomoku} from "../src/QyGomoku.sol";
import "forge-std/console.sol";

contract QyGomokuTest is Test {
    QyGomoku public qyGomoku;

    function setUp() public {
        qyGomoku = new QyGomoku("QuanYu Coin", "QYC");
    }

    // function test_mint() public {
    //     qyGomoku.mint(address(1),1);
    //     qyGomoku.mint(address(this),1);
    //     assertEq(qyGomoku.balanceOf(address(1)), 1);
    // }

    function test_fullGame() public {
        // 0. 准备工作：定义用户地址，给用户 mint 代币
        address u1 = address(0x1111);
        address u2 = address(0x2222);
        
        // 1. 给用户充值 ETH 用于 mint 代币
        vm.deal(u1, 1 ether); 
        vm.deal(u2, 1 ether); 
        
        // 2. 给用户 mint 代币
        vm.prank(u1);
        qyGomoku.mintWithEth{value: 1000}(); 
        assertEq(qyGomoku.balanceOf(u1), 1000); // 验证 mint 成功
        vm.prank(u2);
        qyGomoku.mintWithEth{value: 1000}();
        assertEq(qyGomoku.balanceOf(u2), 1000); // 验证 mint 成功

        // 3. 用户授权 qyGomoku 合约花费 100 个代币（核心：授权给合约，而非测试合约）
        vm.prank(u1);
        qyGomoku.approve(address(qyGomoku), 100); 
        assertEq(qyGomoku.allowance(u1, address(qyGomoku)), 100); // 验证授权成功
        vm.prank(u2);
        qyGomoku.approve(address(qyGomoku), 100); 
        assertEq(qyGomoku.allowance(u2, address(qyGomoku)), 100); // 验证授权成功

        // 4. 以u1身份调用 createGame（确保扣的是用户的代币）
        vm.prank(u1);
        qyGomoku.createGame(100, 600);
        assertEq(qyGomoku.balanceOf(u1), 900); // 剩余900代币

        // 5. 以u2身份调用 joinGame
        vm.prank(u2);
        qyGomoku.joinGame(0);
        assertEq(qyGomoku.balanceOf(u2), 900); // 剩余900代币
        printBoard();

        // 6.u1和u2轮流落子，直到一方获胜
        vm.prank(u1);
        qyGomoku.placeStone(0, 7, 7); // u1下在(7,7)
        printBoard();
        vm.prank(u2);
        qyGomoku.placeStone(0, 7, 8); // u2下在(7,8)
        printBoard();
        vm.prank(u1);
        qyGomoku.placeStone(0, 8, 7); // u1下在(8,7)
        printBoard();
        vm.prank(u2);
        qyGomoku.placeStone(0, 8, 8); // u2下在(8,8)
        printBoard();
        vm.prank(u1);
        qyGomoku.placeStone(0, 9, 7); // u1下在(9,7)
        printBoard();
        vm.prank(u2);
        qyGomoku.placeStone(0, 9, 8); // u2下在(9,8)
        printBoard();
        vm.prank(u1);
        qyGomoku.placeStone(0, 10, 7); // u1下在(10,7)
        printBoard();
        vm.prank(u2);
        qyGomoku.placeStone(0, 10, 8); // u2下在(10,8)
        printBoard();
        vm.prank(u1);
        qyGomoku.placeStone(0, 11, 7); // u1下在(11,7)
        printBoard();
        // 打印各方余额
        console.log("U1 balance:", qyGomoku.balanceOf(u1));
        console.log("U2 balance:", qyGomoku.balanceOf(u2));
        console.log("owner balance:", qyGomoku.balanceOf(qyGomoku.owner()));
    }

    function printBoard() internal {
        (
            uint256 gameId,
            address creator,
            address joiner,
            address currentPlayer, // 当前轮到谁
            uint256 stake,
            bool started,
            bool finished,
            address winner,
            uint8[15][15] memory board, // 15x15棋盘
            uint256 intervalTime, //间隔时间, 单位：s
            uint256 lastMoveTime //最后落子时间
        ) = qyGomoku.getGame(0);
        console.log("Board:");
        // 遍历行（外层数组）
        for (uint256 i = 0; i < 15; i++) {
            string memory row = ""; // 用于拼接一行的元素
            // 遍历列（内层数组）
            for (uint256 j = 0; j < 15; j++) {
                // 将当前元素转为字符串，拼接到行中（用逗号分隔）
                string memory cell = '';
                if(board[i][j] == 1)
                    cell = "-";
                else if(board[i][j] == 2)
                    cell = "*";
                row = string(abi.encodePacked(row, cell, ", "));
            }
            // 打印一行
            console.log(row);
        }
    }
}
