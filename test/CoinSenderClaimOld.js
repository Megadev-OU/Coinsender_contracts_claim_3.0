const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

describe("CoinSenderClaim", function () {
  let owner, bank, sender, recipient1, recipient2;
  let CoinSenderClaim, coinSenderClaim;
  let erc20Token;

  beforeEach(async () => {
    [owner, bank, sender, recipient1, recipient2] = await ethers.getSigners();

    // Deploy ERC20 token for testing
    const ERC20Token = await ethers.getContractFactory("ERC20Mock");
    erc20Token = await ERC20Token.deploy("TestToken", "TTK");
    await erc20Token.deployed();

    // Deploy CoinSenderClaim contract
    CoinSenderClaim = await ethers.getContractFactory("CoinSenderClaimOld");
    coinSenderClaim = await upgrades.deployProxy(
      CoinSenderClaim,
      [owner.address, ethers.utils.parseEther("0.01")],
      { initializer: "initialize" }
    );
    await coinSenderClaim.deployed();
  });

  it("should initialize contract correctly", async () => {
    expect(await coinSenderClaim.owner()).to.equal(owner.address);
    expect(await coinSenderClaim.bank()).to.equal(owner.address);
    expect(await coinSenderClaim.minFee()).to.equal(ethers.utils.parseEther("0.01"));
  });

  it("should change the bank address", async () => {
    await coinSenderClaim.connect(owner).changeBankAddress(bank.address);
    expect(await coinSenderClaim.bank()).to.equal(bank.address);
  });

  it("should update the minimum fee", async () => {
    await coinSenderClaim.connect(owner).setMinFee(ethers.utils.parseEther("0.02"));
    expect(await coinSenderClaim.minFee()).to.equal(ethers.utils.parseEther("0.02"));
  });

  it("should send tokens and create claims", async () => {
    // Mint tokens for sender
    await erc20Token.mint(sender.address, ethers.utils.parseEther("1000"));
    await erc20Token.connect(sender).approve(coinSenderClaim.address, ethers.utils.parseEther("1000"));

    const recipients = [recipient1.address, recipient2.address];
    const amounts = [ethers.utils.parseEther("100"), ethers.utils.parseEther("200")];

    // Send tokens
    await coinSenderClaim.connect(sender).multiSendTokens(
      erc20Token.address,
      recipients,
      amounts,
      ethers.utils.parseEther("0.01"),
      { value: ethers.utils.parseEther("0.01") }
    );

    // Check claims
    const claim1 = await coinSenderClaim.tokensToClaim(recipient1.address, 0);
    const claim2 = await coinSenderClaim.tokensToClaim(recipient2.address, 0);

    expect(claim1.tokenAddress).to.equal(erc20Token.address);
    expect(claim1.amount).to.equal(amounts[0]);
    expect(claim1.claimed).to.be.false;

    expect(claim2.tokenAddress).to.equal(erc20Token.address);
    expect(claim2.amount).to.equal(amounts[1]);
    expect(claim2.claimed).to.be.false;
  });

  it("should send ETH and create claims", async () => {
    const recipients = [recipient1.address, recipient2.address];
    const amounts = [ethers.utils.parseEther("1"), ethers.utils.parseEther("2")];

    // Send ETH
    await coinSenderClaim.connect(sender).multiSendEth(recipients, amounts, ethers.utils.parseEther("0.01"), {
      value: ethers.utils.parseEther("3.01"),
    });

    // Check claims
    const claim1 = await coinSenderClaim.ethToClaim(recipient1.address, 0);
    const claim2 = await coinSenderClaim.ethToClaim(recipient2.address, 0);

    expect(claim1.amount).to.equal(amounts[0]);
    expect(claim1.claimed).to.be.false;

    expect(claim2.amount).to.equal(amounts[1]);
    expect(claim2.claimed).to.be.false;
  });

  it("should claim tokens", async () => {
    // Prepare token claims
    await erc20Token.mint(sender.address, ethers.utils.parseEther("1000"));
    await erc20Token.connect(sender).approve(coinSenderClaim.address, ethers.utils.parseEther("1000"));

    const recipients = [recipient1.address, recipient2.address];
    const amounts = [ethers.utils.parseEther("100"), ethers.utils.parseEther("200")];

    await coinSenderClaim.connect(sender).multiSendTokens(
      erc20Token.address,
      recipients,
      amounts,
      ethers.utils.parseEther("0.01"),
      { value: ethers.utils.parseEther("0.01") }
    );

    // Claim tokens for recipient1
    await coinSenderClaim.connect(recipient1).claimTokens(0, ethers.utils.parseEther("0.02"), {
      value: ethers.utils.parseEther("0.02"),
    });

    // Check claim and token balance
    const claim = await coinSenderClaim.tokensToClaim(recipient1.address, 0);
    expect(claim.claimed).to.be.true;

    const recipient1Balance = await erc20Token.balanceOf(recipient1.address);
    expect(recipient1Balance).to.equal(amounts[0]);
  });

  it("should claim ETH", async () => {

    const gasPrice = ethers.utils.parseUnits("10", "gwei"); // Задайте значение газовой цены (например, 10 Gwei)

    // Prepare ETH claims
    const recipients = [recipient1.address, recipient2.address];
    const amounts = [ethers.utils.parseEther("1"), ethers.utils.parseEther("2")];

    await coinSenderClaim.connect(sender).multiSendEth(recipients, amounts, ethers.utils.parseEther("0.02"), {
      value: ethers.utils.parseEther("3.02"),
      gasPrice,
    });

    // Claim ETH for recipient1
    const initialRecipient1Balance = await recipient1.getBalance();

    const tx = await coinSenderClaim.connect(recipient1).claimEth(0, ethers.utils.parseEther("0.02"), {
      gasPrice: gasPrice,
    });

    // Check claim and ETH balance
    const claim = await coinSenderClaim.ethToClaim(recipient1.address, 0);
    expect(claim.claimed).to.be.true;

    const recipient1Balance = await recipient1.getBalance();

    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed;
    const gasCost = gasUsed.mul(gasPrice);

    expect(recipient1Balance.sub(initialRecipient1Balance).add(gasCost)).to.equal(amounts[0].sub(ethers.utils.parseEther("0.02")));
  });

});
