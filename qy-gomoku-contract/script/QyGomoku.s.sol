// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {QyGomoku} from "../src/QyGomoku.sol";

contract QyGomokuScript is Script {
    QyGomoku public qyGomoku;

    function setUp() public {}

    function run() public {
        uint256 deployer = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployer);

        qyGomoku = new QyGomoku("QuanYu Coin", "QYC");

        vm.stopBroadcast();
    }
}
