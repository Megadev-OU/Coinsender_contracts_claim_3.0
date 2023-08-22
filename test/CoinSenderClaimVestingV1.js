const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

describe("CoinSenderClaimVestingV1 Tests", function () {

  let CoinSenderClaimVestingV1;
  let coinSenderClaimVestingV1;
  let owner, addr1, addr2, addr3, addr4;
  let initialOwnerBalance;
  let erc20, erc20_2;
  let minFee = ethers.utils.parseEther('0.01')

  let vestingParameters = {
    start: Math.floor(Date.now() / 1000),
    cliffDuration: 300,
    duration: 3600,
    slicePeriodSeconds: 60,
    revocable: true
  };

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, addr4, ...addrs] = await ethers.getSigners();
    initialOwnerBalance = await owner.getBalance();

    // Deploy ERC20 token for testing purpose
    const ERC20 = await ethers.getContractFactory('ERC20Mock')
    erc20 = await ERC20.deploy('TestToken', 'TTK') // mint 1M ERC20 tokens to the deployer
    await erc20.deployed()

    await erc20.mint(owner.address, ethers.utils.parseEther('100000000'))

    // Deploy ERC20 token for testing purpose
    const ERC20_2 = await ethers.getContractFactory('ERC20Mock')
    erc20_2 = await ERC20_2.deploy('TestToken', 'TTK') // mint 1M ERC20 tokens to the deployer
    await erc20_2.deployed()

    await erc20_2.mint(owner.address, ethers.utils.parseEther('100000000'))


    CoinSenderClaimVestingV1 = await ethers.getContractFactory("CoinSenderClaimVestingV1");
    coinSenderClaimVestingV1 = await upgrades.deployProxy(CoinSenderClaimVestingV1,
      [owner.address, minFee],
      { initializer: 'initialize' }
    );
    await coinSenderClaimVestingV1.deployed();

    // Transfer some ERC20 tokens to addr1
    await erc20.transfer(addr1.address, ethers.utils.parseEther('1000000')) // transfer 10K ERC20 tokens to addr1
    await erc20_2.transfer(addr1.address, ethers.utils.parseEther('1000000')) // transfer 10K ERC20 tokens to addr1

  });

  describe("Initialization", function () {
    it('Should set the right owner', async function () {
      expect(await coinSenderClaimVestingV1.owner()).to.equal(owner.address)
    })

    it('Should set the right minimum fee', async function () {
      expect(await coinSenderClaimVestingV1.minFee()).to.equal(minFee)
    })
  });

  describe("Sending funds with vesting", function () {

    it('Should send funds with vesting successfully', async function () {
      // Approve the contract to spend tokens
      await erc20.connect(addr1).approve(coinSenderClaimVestingV1.address, ethers.utils.parseEther('1000'));

      await coinSenderClaimVestingV1.connect(addr1).sendCoins([
        erc20.address,
        [addr2.address, addr3.address],
        [ethers.utils.parseEther('500'), ethers.utils.parseEther('200')],
        vestingParameters.cliffDuration,
        vestingParameters.start,
        vestingParameters.duration,
        vestingParameters.slicePeriodSeconds,
        vestingParameters.revocable,
        minFee
      ], { value: minFee });

      const transferDetails = await coinSenderClaimVestingV1.connect(addr1).viewSentCoins(addr1.address);

      expect(transferDetails[0].id).to.equal('0');
      expect(transferDetails[0].sender).to.equal(addr1.address);
      expect(transferDetails[0].recipient).to.equal(addr2.address);
      expect(transferDetails[0].coin).to.equal(erc20.address);
      expect(transferDetails[0].amount).to.equal(ethers.utils.parseEther('500'));
      expect(transferDetails[0].start).to.equal(vestingParameters.start);
      expect(transferDetails[0].cliff).to.equal(vestingParameters.start + vestingParameters.cliffDuration);
      expect(transferDetails[0].duration).to.equal(vestingParameters.duration);

      expect(transferDetails[1].id).to.equal('1');
      expect(transferDetails[1].sender).to.equal(addr1.address);
      expect(transferDetails[1].recipient).to.equal(addr3.address);
      expect(transferDetails[1].coin).to.equal(erc20.address);
      expect(transferDetails[1].amount).to.equal(ethers.utils.parseEther('200'));
      expect(transferDetails[1].start).to.equal(vestingParameters.start);
      expect(transferDetails[1].cliff).to.equal(vestingParameters.start + vestingParameters.cliffDuration);
      expect(transferDetails[1].duration).to.equal(vestingParameters.duration);
    });

    it('Should fail when duration is less than cliff', async function () {
      await erc20.connect(addr1).approve(coinSenderClaimVestingV1.address, ethers.utils.parseEther('500'));

      await expect(
        coinSenderClaimVestingV1.connect(addr1).sendCoins([
          erc20.address,
          [addr2.address],
          [ethers.utils.parseEther('500')],
          vestingParameters.start + 120,
          vestingParameters.start,
          60,  // duration less than cliff
          vestingParameters.slicePeriodSeconds,
          vestingParameters.revocable,
          minFee
        ], { value: minFee })
      ).to.be.revertedWith("TokenVesting: duration must be >= cliff");
    });

    it('Should fail with mismatched recipient and amount arrays', async function () {
      await erc20.connect(addr1).approve(coinSenderClaimVestingV1.address, ethers.utils.parseEther('1000'));

      await expect(
        coinSenderClaimVestingV1.connect(addr1).sendCoins([
          erc20.address,
          [addr2.address],
          [ethers.utils.parseEther('500'), ethers.utils.parseEther('500')],
          vestingParameters.cliffDuration,
          vestingParameters.start,
          vestingParameters.duration,
          vestingParameters.slicePeriodSeconds,
          vestingParameters.revocable,
          minFee
          ], { value: minFee }
        )
      ).to.be.revertedWith("CoinSenderClaim: Recipients and amounts arrays should have the same length");
    });

    it('Should fail with insufficient balance or allowance', async function () {
      await erc20.connect(addr4).approve(coinSenderClaimVestingV1.address, ethers.utils.parseEther('500'));

      await expect(
        coinSenderClaimVestingV1.connect(addr4).sendCoins( // addr4 doesn't have ERC20 tokens in our setup
          [
            erc20.address,
            [addr2.address],
            [ethers.utils.parseEther('500')],
            vestingParameters.cliffDuration,
            vestingParameters.start,
            vestingParameters.duration,
            vestingParameters.slicePeriodSeconds,
            vestingParameters.revocable,
            minFee
          ], { value: minFee }
        )
      ).to.be.reverted;  // Check for a generic revert as the error message might vary depending on the token implementation
    });

    it('Should fail with min fee', async function () {
      await erc20.connect(addr1).approve(coinSenderClaimVestingV1.address, ethers.utils.parseEther('500'));

      await expect(
        coinSenderClaimVestingV1.connect(addr4).sendCoins( // addr4 doesn't have ERC20 tokens in our setup
          [
            erc20.address,
            [addr2.address],
            [ethers.utils.parseEther('500')],
            vestingParameters.cliffDuration,
            vestingParameters.start,
            vestingParameters.duration,
            vestingParameters.slicePeriodSeconds,
            vestingParameters.revocable,
            minFee
          ]
        )
      ).to.be.revertedWith('CoinSenderClaim: Fee to low');
    })

  });

  describe("Claim tests", function() {

    beforeEach(async function () {
      await erc20.connect(addr1).approve(coinSenderClaimVestingV1.address, ethers.utils.parseEther('500'));

      // Setup a transfer to claim later in the tests
      await coinSenderClaimVestingV1.connect(addr1).sendCoins([
        erc20.address,
        [addr3.address],
        [ethers.utils.parseEther('500')],
        vestingParameters.cliffDuration,
        vestingParameters.start,
        vestingParameters.duration,
        vestingParameters.slicePeriodSeconds,
        vestingParameters.revocable,
        minFee
      ], { value: minFee });
    });

    it("Should fail to claim funds before cliff period", async function() {
      await ethers.provider.send("evm_increaseTime", [vestingParameters.cliffDuration - 100]); // увеличиваем время на значение, меньшее, чем cliffDuration
      await ethers.provider.send("evm_mine");

      const increasedTime = vestingParameters.cliffDuration - 100;
      const expectedTime = vestingParameters.start + increasedTime;
      const currentBlock = await ethers.provider.getBlock("latest");

      const climeCoints = await coinSenderClaimVestingV1.connect(addr3).viewClaimsCoins(addr3.address);
      await expect(coinSenderClaimVestingV1.connect(addr3).claim([0], minFee, { value: minFee }))
        .to.be.revertedWith("No releasable amount at the moment");
    });

    it("Should successfully claim funds after vesting duration", async function() {
      await ethers.provider.send("evm_increaseTime", [vestingParameters.duration]);
      await ethers.provider.send("evm_mine");
      await coinSenderClaimVestingV1.connect(addr3).claim([0], minFee, { value: minFee });
      expect(await erc20.balanceOf(addr3.address)).to.equal(ethers.utils.parseEther('500'));
    });

    it("Should claim partial funds after cliff but before full duration", async function() {
      await ethers.provider.send("evm_increaseTime", [vestingParameters.slicePeriodSeconds]);
      await ethers.provider.send("evm_mine");
      await coinSenderClaimVestingV1.connect(addr3).claim([0], minFee, { value: minFee });
      expect(await erc20.balanceOf(addr3.address)).to.be.gt(0);
    });

    it("Non-recipient should not be able to claim", async function() {
      await expect(coinSenderClaimVestingV1.connect(addr2).claim([0], minFee, { value: minFee }))
        .to.be.revertedWith("Claimant is not the recipient of the transfer");
    });

    it("Claiming with wrong transfer ID should fail", async function() {
      await expect(coinSenderClaimVestingV1.connect(addr3).claim([99], minFee, { value: minFee })).to.be.revertedWith("No pending claim found");
    });
  });

  describe("Cancel tests", function() {

    beforeEach(async function () {
      let currentBlock = await ethers.provider.getBlock("latest");
      let currentTimestamp = currentBlock.timestamp;

      await erc20.connect(addr1).approve(coinSenderClaimVestingV1.address, ethers.utils.parseEther('500'));

      await coinSenderClaimVestingV1.connect(addr1).sendCoins([
        erc20.address,
        [addr2.address],
        [ethers.utils.parseEther('500')],
        vestingParameters.cliffDuration,
        currentTimestamp,
        vestingParameters.duration,
        vestingParameters.slicePeriodSeconds,
        vestingParameters.revocable,
        minFee
      ], { value: minFee });
    });


    it("Should successfully cancel transfer", async function() {
      await coinSenderClaimVestingV1.connect(addr1).cancel([0]);
      expect(await erc20.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('1000000'));
    });

    it("Should get back only unclaimed funds after some claim", async function() {
      await ethers.provider.send("evm_increaseTime", [vestingParameters.cliffDuration]);
      await ethers.provider.send("evm_mine");

      const balanceBeforeClaim = await erc20.balanceOf(addr2.address);

      await coinSenderClaimVestingV1.connect(addr2).claim([0], minFee, { value: minFee });

      const balanceAfterClaim = await erc20.balanceOf(addr2.address);

      expect(balanceAfterClaim).to.be.gt(balanceBeforeClaim);
      expect(balanceAfterClaim).to.be.lt(balanceBeforeClaim.add(ethers.utils.parseEther('500')));

      const balanceAddr1BeforeCancel = await erc20.balanceOf(addr1.address);
      await coinSenderClaimVestingV1.connect(addr1).cancel([0]);
      const balanceAddr1AfterCancel = await erc20.balanceOf(addr1.address);

      expect(balanceAddr1AfterCancel.sub(balanceAddr1BeforeCancel)).to.equal(ethers.utils.parseEther('500').sub(balanceAfterClaim.sub(balanceBeforeClaim)));
    });


    it("Non-sender should not be able to cancel", async function() {
      await expect(coinSenderClaimVestingV1.connect(addr2).cancel([0])).to.be.revertedWith("Requestor is not the sender of the transfer");
    });

    it("Canceling with wrong transfer ID should fail", async function() {
      await expect(coinSenderClaimVestingV1.connect(addr1).cancel([99])).to.be.revertedWith("No transfer found");
    });
  });

  describe("Management functions", function () {

    it('Only owner can set min fee', async function () {
      await expect(coinSenderClaimVestingV1.connect(addr1).setMinFee(ethers.utils.parseEther('0.02')))
        .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`);
    });

    it('Owner can set min fee', async function () {
      await coinSenderClaimVestingV1.setMinFee(ethers.utils.parseEther('0.02'));
      expect(await coinSenderClaimVestingV1.minFee()).to.equal(ethers.utils.parseEther('0.02'));
    });

  });

  describe("Sending multiple tokens in one go", function () {

    it('Should send multiple types of tokens with vesting successfully', async function () {
      await erc20.connect(addr1).approve(coinSenderClaimVestingV1.address, ethers.utils.parseEther('700'));
      await erc20_2.connect(addr1).approve(coinSenderClaimVestingV1.address, ethers.utils.parseEther('500'));

      await coinSenderClaimVestingV1.connect(addr1).sendCoins([
        erc20.address,
        [addr2.address, addr3.address],
        [ethers.utils.parseEther('500'), ethers.utils.parseEther('200')],
        vestingParameters.cliffDuration,
        vestingParameters.start,
        vestingParameters.duration,
        vestingParameters.slicePeriodSeconds,
        vestingParameters.revocable,
        minFee
      ], { value: minFee });

      await coinSenderClaimVestingV1.connect(addr1).sendCoins([
        erc20_2.address,
        [addr2.address, addr3.address],
        [ethers.utils.parseEther('300'), ethers.utils.parseEther('200')],
        vestingParameters.cliffDuration,
        vestingParameters.start,
        vestingParameters.duration,
        vestingParameters.slicePeriodSeconds,
        vestingParameters.revocable,
        minFee
      ], { value: minFee });
    });

  });

  describe("Multiple sends to the same recipient", function () {

    it('Should send and claim multiple times to the same recipient', async function () {
      await erc20.connect(addr1).approve(coinSenderClaimVestingV1.address, ethers.utils.parseEther('1000'));

      // First send
      await coinSenderClaimVestingV1.connect(addr1).sendCoins([
        erc20.address,
        [addr2.address],
        [ethers.utils.parseEther('500')],
        vestingParameters.cliffDuration,
        vestingParameters.start,
        vestingParameters.duration,
        vestingParameters.slicePeriodSeconds,
        vestingParameters.revocable,
        minFee
      ], { value: minFee });

      // Second send
      await coinSenderClaimVestingV1.connect(addr1).sendCoins([
        erc20.address,
        [addr2.address],
        [ethers.utils.parseEther('400')],
        vestingParameters.cliffDuration,
        vestingParameters.start,
        vestingParameters.duration,
        vestingParameters.slicePeriodSeconds,
        vestingParameters.revocable,
        minFee
      ], { value: minFee });

      await ethers.provider.send("evm_increaseTime", [vestingParameters.duration]);
      await ethers.provider.send("evm_mine");

      // Claim both
      await coinSenderClaimVestingV1.connect(addr2).claim([0, 1], minFee, { value: minFee });

      expect(await erc20.balanceOf(addr2.address)).to.equal(ethers.utils.parseEther('900'));
    });

  });



});
