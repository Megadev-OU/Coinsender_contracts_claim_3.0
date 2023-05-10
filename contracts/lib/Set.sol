// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Set {
    struct Data {
        mapping(address => uint) index;
        address[] list;
    }

    function add(Data storage self, address _addr) internal {
        if (!exists(self, _addr)) {
            self.index[_addr] = self.list.length;
            self.list.push(_addr);
        }
    }

    function remove(Data storage self, address _addr) internal {
        if (exists(self, _addr)) {
            uint256 indexToRemove = self.index[_addr];
            address lastAddress = self.list[self.list.length - 1];

            self.list[indexToRemove] = lastAddress;
            self.index[lastAddress] = indexToRemove;

            self.list.pop();
            delete self.index[_addr];
        }
    }

    function exists(Data storage self, address _addr) internal view returns (bool) {
        if (self.list.length == 0) {
            return false;
        }
        return self.list[self.index[_addr]] == _addr;
    }

    function getAll(Data storage self) internal view returns (address[] memory) {
        return self.list;
    }
}
