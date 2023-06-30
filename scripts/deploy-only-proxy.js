const hre = require("hardhat");
const {ethers, upgrades} = require("hardhat");

const minFee = ethers.utils.parseEther("0"); // комиссия в ETH
const owner = "0xe1251c4f899c30ab8CEFEBDAAB9773EA946547D9";

// замените этот адрес на адрес уже задеплоенного контракта
const alreadyDeployedContractAddress = "0x438377BB9619B07799cb80c51cf2667a04Ba1d4F";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const сoinSenderClaim = await ethers.getContractAt("CoinSenderClaimV2", alreadyDeployedContractAddress);

  console.log("сoinSenderClaim", сoinSenderClaim);

  // Deploy proxy
  const proxy = await upgrades.deployProxy(сoinSenderClaim,
    [ owner, minFee ],
    {
      initializer: 'initialize',
      kind: "uups",
    });

  // Wait for deployment confirmation
  await proxy.deployed();

  console.log("Proxy deployed to:", proxy.address);

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
