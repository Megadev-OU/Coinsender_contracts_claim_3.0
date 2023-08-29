const hre = require("hardhat");
const {ethers, upgrades} = require("hardhat");


const minFee = ethers.utils.parseEther("0"); // комиссия в ETH
const owner = "0xCa3E72D5DbcBdB56bD45bFd91b70107eF05eaf21";

async function main() {
  // const [deployer] = await ethers.getSigners();
  //
  // console.log("Deploying contracts with the account:", deployer.address);
  //
  // const coinSenderClaimVestingV1 = await ethers.getContractFactory("CoinSenderClaimVestingV1");
  //
  // // Deploy contract
  // const proxy = await upgrades.deployProxy(coinSenderClaimVestingV1,
  //   [ owner, minFee ],
  //   {
  //     initializer: 'initialize',
  //     kind: "uups",
  //   });
  //
  // // Wait for deployment confirmation
  // await proxy.deployed();
  //
  // console.log("CoinSenderClaimVestingV1 deployed to:", proxy.address);
  //
  // console.log("CoinSenderClaimVestingV1 initialized with values:");
  // console.log("  owner:", deployer.address);
  // console.log("  fee:", minFee.toString());
  //
  // // Wait for 3 minutes to allow for contract to propagate
  // console.log("Waiting 3 minutes...");
  // await new Promise((resolve) => setTimeout(resolve, 180000));

  // Verify contract
  await hre.run("verify:verify", {
    address: '0x297acd37Fb921f07E03384a02C04429f13C7f7B9',
    constructorArguments: [],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
