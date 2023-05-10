const hre = require("hardhat");
const {ethers, upgrades} = require("hardhat");


const minFee = ethers.utils.parseEther("0"); // комиссия в ETH
const owner = "0xe1251c4f899c30ab8CEFEBDAAB9773EA946547D9";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const сoinSenderClaim = await ethers.getContractFactory("CoinSenderClaim");

  // Deploy contract
  const proxy = await upgrades.deployProxy(сoinSenderClaim,
    [ owner, minFee ],
    {
      initializer: 'initialize',
      kind: "uups",
    });

  // Wait for deployment confirmation
  await proxy.deployed();

  console.log("UniswapZapV2 deployed to:", proxy.address);

  console.log("UniswapZapV2 initialized with values:");
  console.log("  owner:", deployer.address);
  console.log("  fee:", minFee.toString());

  // Wait for 3 minutes to allow for contract to propagate
  console.log("Waiting 3 minutes...");
  await new Promise((resolve) => setTimeout(resolve, 180000));

  // Verify contract
  await hre.run("verify:verify", {
    address: proxy.address,
    constructorArguments: [],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
