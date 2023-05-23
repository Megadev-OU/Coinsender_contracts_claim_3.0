const { ethers, upgrades } = require("hardhat");
const hre = require('hardhat')

// upgrades variables
const PROXY = '0x64C4eD8B34710fe29D1ec4cC8B52C11Dc3e45F63';
const contractName = 'CoinSenderClaimV2';

// upgrade example
async function main() {

  const Contract = await ethers.getContractFactory(contractName);
  await upgrades.upgradeProxy(PROXY, Contract);

  console.log(`${contractName}.proxy.address:`, PROXY);

  console.log(`Verifying ${contractName}.`);

  // Wait for 3 minutes to allow for contract to propagate
  console.log("Waiting 3 minutes...");
  await new Promise((resolve) => setTimeout(resolve, 180000));

  // Verify contract
  await hre.run("verify:verify", {
    address: PROXY,
    constructorArguments: [],
  });

  console.log(`${contractName} verified on ${network.name} network.`);

  // await sleep(5000);
  // await verify(PROXY, []);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
