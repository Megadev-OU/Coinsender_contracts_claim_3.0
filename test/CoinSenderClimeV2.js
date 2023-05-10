const { expect } = require('chai')
const { ethers, upgrades } = require('hardhat')

const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

describe('CoinSenderClaim', function () {
  let CoinSenderClaim, coinSenderClaim, owner, addr1, addr2, addr3, addr4
  let erc20, erc20_2
  let minFee = ethers.utils.parseEther('0.01')

  beforeEach(async () => {
    // Here we create a new contract for each test
    CoinSenderClaim = await ethers.getContractFactory('CoinSenderClaim');
    [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners()

    // Deploy ERC20 token for testing purpose
    const ERC20 = await ethers.getContractFactory('ERC20Mock')
    erc20 = await ERC20.deploy('TestToken', 'TTK') // mint 1M ERC20 tokens to the deployer
    await erc20.deployed()

    await erc20.mint(owner.address, ethers.utils.parseEther('100000000'))

    // Deploy ERC20 token for testing purpose
    const ERC20_2 = await ethers.getContractFactory('ERC20Mock')
    erc20_2 = await ERC20_2.deploy('TestToken', 'TTK') // mint 1M ERC20 tokens to the deployer
    await erc20_2.deployed()

    // console.log("erc20", erc20);

    await erc20_2.mint(owner.address, ethers.utils.parseEther('100000000'))

    // Deploy CoinSenderClaim contract
    coinSenderClaim = await upgrades.deployProxy(
      CoinSenderClaim,
      [owner.address, minFee],
      { initializer: 'initialize' }
    )
    await coinSenderClaim.deployed()

    // Transfer some ERC20 tokens to addr1
    await erc20.transfer(addr1.address, ethers.utils.parseEther('1000000')) // transfer 10K ERC20 tokens to addr1
    await erc20_2.transfer(addr1.address, ethers.utils.parseEther('1000000')) // transfer 10K ERC20 tokens to addr1

  })

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      expect(await coinSenderClaim.owner()).to.equal(owner.address)
    })

    it('Should set the right minimum fee', async function () {
      expect(await coinSenderClaim.minFee()).to.equal(minFee)
    })
  })

  describe('Batch Operations', function () {
    it('Should allow a recipient to claim multiple coin types', async function () {
      // Assuming you have multiple token contracts for this test
      const tokens = [erc20, erc20_2]
      const amounts = [ethers.utils.parseEther('10'), ethers.utils.parseEther('10')]

      // Sending coins from addr1 to addr2 and addr3
      await erc20.connect(addr1).approve(coinSenderClaim.address, ethers.utils.parseEther('20'))
      await erc20_2.connect(addr1).approve(coinSenderClaim.address, ethers.utils.parseEther('20'))
      await coinSenderClaim.connect(addr1).sendCoins(erc20.address, [addr2.address, addr3.address], amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })
      await coinSenderClaim.connect(addr1).sendCoins(erc20_2.address, [addr2.address, addr3.address], amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })

      // addr2 claiming all tokens
      await coinSenderClaim.connect(addr2).claimCoinsBatch([addr1.address, addr1.address], [erc20.address, erc20_2.address])

      // Check balances
      expect(await erc20.balanceOf(addr2.address)).to.equal(ethers.utils.parseEther('10'))
      expect(await erc20_2.balanceOf(addr2.address)).to.equal(ethers.utils.parseEther('10'))
    })

    it('Should allow a sender to cancel multiple transfers', async function () {
      // Assuming you have multiple token contracts for this test
      const tokens = [erc20.address, erc20_2.address]
      const amounts = [ethers.utils.parseEther('10'), ethers.utils.parseEther('10')]
      const initialBal_1 = await erc20.balanceOf(addr1.address);
      const initialBal_2 = await erc20_2.balanceOf(addr1.address);

      // Sending coins from addr1 to addr2 and addr3
      await erc20.connect(addr1).approve(coinSenderClaim.address, ethers.utils.parseEther('20'))
      await erc20_2.connect(addr1).approve(coinSenderClaim.address, ethers.utils.parseEther('20'))
      await coinSenderClaim.connect(addr1).sendCoins(erc20.address, [addr2.address, addr3.address], amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })
      await coinSenderClaim.connect(addr1).sendCoins(erc20_2.address, [addr2.address, addr3.address], amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })

      // addr1 canceling all transfers
      await coinSenderClaim.connect(addr1).cancelTransferBatch([addr2.address, addr3.address, addr2.address, addr3.address], [erc20.address, erc20.address, erc20_2.address, erc20_2.address])

      // Check balances - they should be back to initial state
      expect(await erc20.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('1000000'))
      expect(await erc20_2.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther('1000000'))
    })
  })

  describe('Pause and Unpause', function () {
    it('Should not allow transfers when paused', async function () {
      // Pause the contract
      await coinSenderClaim.connect(owner).pause()

      const recipients = [addr2.address]
      const amounts = [ethers.utils.parseEther('1')]

      // We try to make a transaction that we know will fail
      await expect(
        coinSenderClaim.connect(addr1).sendCoins(erc20.address, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })
      ).to.be.revertedWith('Pausable: paused')
    })

    it('Should allow transfers when unpaused', async function () {
      // Pause and then unpause the contract
      await coinSenderClaim.connect(owner).pause()
      await coinSenderClaim.connect(owner).unpause()

      const recipients = [addr2.address]
      const amounts = [ethers.utils.parseEther('1')]

      await erc20.connect(addr1).approve(coinSenderClaim.address, ethers.utils.parseEther('1'))
      await coinSenderClaim.connect(addr1).sendCoins(erc20.address, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })

      // Should pass without any exception
      expect(await erc20.balanceOf(coinSenderClaim.address)).to.equal(ethers.utils.parseEther('1'))
    })
  })

  describe('View functions', function () {
    it('Should correctly display claims', async function () {
      const recipients = [addr2.address, addr3.address]
      const amounts = [ethers.utils.parseEther('10'), ethers.utils.parseEther('15')]

      await erc20.connect(addr1).approve(coinSenderClaim.address, ethers.utils.parseEther('25'))
      await erc20_2.connect(addr1).approve(coinSenderClaim.address, ethers.utils.parseEther('25'))

      await coinSenderClaim.connect(addr1).sendCoins(erc20.address, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })
      await coinSenderClaim.connect(addr1).sendCoins(erc20_2.address, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })

      // Check the claims
      for (let i = 0; i < recipients.length; i++) {
        const claim = await coinSenderClaim.connect(recipients[i]).viewClaims(recipients[i])
        // console.log("claim", claim);
        for (let j = 0; j < claim.length; j++) {
          expect(claim[j].amount.toString()).to.equal(amounts[i].toString())
        }
      }
    })

    it('Should correctly display sent tokens', async function () {
      const recipients = [addr2.address, addr3.address]
      const amounts = [ethers.utils.parseEther('10'), ethers.utils.parseEther('15')]

      await erc20.connect(addr1).approve(coinSenderClaim.address, ethers.utils.parseEther('25'))
      await coinSenderClaim.connect(addr1).sendCoins(erc20.address, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })

      // Check the sent tokens
      const sentTokens = await coinSenderClaim.connect(addr1).viewSentTokens(addr1.address)

      for(let i = 0; i < sentTokens.length; i++) {
        expect(sentTokens[i].amount.toString()).to.equal(amounts[i].toString());
        expect(sentTokens[i].recipient).to.equal(recipients[i]);
        expect(sentTokens[i].token).to.equal(erc20.address);
      }
    })
  })

  describe('Transactions', function () {
    it('Should fail if sender does not have enough tokens', async function () {
      const recipients = [addr2.address]
      const amounts = [ethers.utils.parseEther('20000')] // send 20K ERC20 tokens which addr1 does not have

      // We try to make a transaction that we know will fail
      await expect(
        coinSenderClaim.connect(addr1).sendCoins(erc20.address, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })
      ).to.be.revertedWith('!BAL20')
    })

    it('Should fail if sender does not send enough ETH for fee', async function () {
      const recipients = [addr2.address]
      const amounts = [ethers.utils.parseEther('1')] // send 5K ERC20 tokens

      // We try to make a transaction that we know will fail
      await expect(
        coinSenderClaim.connect(addr1).sendCoins(NATIVE_TOKEN, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })
      ).to.be.revertedWith('CoinSenderClaim: Insufficient ETH sent to cover fee and total amount')
    })

    it('Should fail if sender send ETH and does not send enough ETH for fee', async function () {
      const recipients = [addr2.address]
      const amounts = [ethers.utils.parseEther('5000')] // send 5K ERC20 tokens

      // We try to make a transaction that we know will fail
      await expect(
        coinSenderClaim.connect(addr1).sendCoins(erc20.address, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.005') })
      ).to.be.revertedWith('CoinSenderClaim: Fee to low')
    })

    it('Should send coins correctly', async function () {
      const recipients = [addr2, addr3]
      const amounts = [ethers.utils.parseEther('10'), ethers.utils.parseEther('15')]
      const totalAmount = amounts.reduce((a, b) => a.add(b), ethers.BigNumber.from(0));
      const fee = ethers.utils.parseEther('0.1')
      const initialTokenBalance = await erc20.balanceOf(addr1.address)

      // Sender (addr1) should have enough tokens for this
      await erc20.connect(addr1).approve(coinSenderClaim.address, totalAmount)
      await coinSenderClaim.connect(addr1).sendCoins(erc20.address, recipients.map(i => i.address), amounts, fee, { value: fee })

      // Check that the contract now has the correct balance
      expect(await erc20.balanceOf(coinSenderClaim.address)).to.equal(totalAmount)

      // Check that the recipients have the correct pending claims
      for (let i = 0; i < recipients.length; i++) {
        await coinSenderClaim.connect(recipients[i]).claimCoinsBatch([addr1.address], [ erc20.address ])
        expect((await erc20.balanceOf(recipients[i].address)).toString()).to.equal(amounts[i])
      }

      // Check that the sender's balance has been reduced correctly
      expect(await erc20.balanceOf(addr1.address)).to.equal(initialTokenBalance.sub(totalAmount))
    })

    it('should emit event and update state on setMinFee', async function () {
      const newMinFee = ethers.utils.parseEther('0.1')
      await expect(coinSenderClaim.setMinFee(newMinFee))
        .to.emit(coinSenderClaim, 'MinFeeChanged')
        .withArgs(minFee, newMinFee)

      expect(await coinSenderClaim.minFee()).to.equal(newMinFee)
    })

    it('should revert when trying to setMinFee by non-owner', async function () {
      const newMinFee = ethers.utils.parseEther('0.1')
      const nonOwner = coinSenderClaim.connect(addr2)
      await expect(nonOwner.setMinFee(newMinFee)).to.be.revertedWith('Ownable: caller is not the owner')
    })

  })

  describe('Cancellation and Claims', function () {
    it('Should allow a sender to cancel a transfer and prevent recipient from claiming', async function () {
      const recipients = [addr2.address, addr3.address, addr4.address]
      const amounts = [ethers.utils.parseEther('10'), ethers.utils.parseEther('10'), ethers.utils.parseEther('10')]

      // Sending coins from addr1 to addr2, addr3, and addr1
      await erc20.connect(addr1).approve(coinSenderClaim.address, ethers.utils.parseEther('30'))
      await coinSenderClaim.connect(addr1).sendCoins(erc20.address, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('0.01') })

      // addr1 canceling transfer for addr1
      await coinSenderClaim.connect(addr1).cancelTransferBatch([addr2.address], [erc20.address])

      // Check claim availability for addr1 (should be 0)
      const claim = await coinSenderClaim.connect(addr2).viewClaims(addr2.address)
      expect(claim.length).to.equal(0)

      // addr1 trying to claim should be rejected
      await expect(
        coinSenderClaim.connect(addr1).claimCoinsBatch([addr1.address], [erc20.address])
      ).to.be.revertedWith('No pending claim found')

      // Check claim availability for addr2 and addr3 (should be tokens)
      const claimAddr3 = await coinSenderClaim.connect(addr3).viewClaims(addr3.address)
      const claimAddr4 = await coinSenderClaim.connect(addr4).viewClaims(addr4.address)
      expect(claimAddr3.length).to.be.greaterThan(0)
      expect(claimAddr4.length).to.be.greaterThan(0)

      // addr2 and addr3 try to claim
      await coinSenderClaim.connect(addr3).claimCoinsBatch([addr1.address], [erc20.address])
      await coinSenderClaim.connect(addr4).claimCoinsBatch([addr1.address], [erc20.address])

      // Check balances
      expect(await erc20.balanceOf(addr3.address)).to.equal(ethers.utils.parseEther('10'))
      expect(await erc20.balanceOf(addr4.address)).to.equal(ethers.utils.parseEther('10'))
    })
  })

  describe('Sending ETH', function () {
    it('Should allow a sender to send ETH and recipient to claim it', async function () {
      const recipients = [addr2.address]
      const amounts = [ethers.utils.parseEther('1')]

      // Sender (addr1) sending ETH to addr2
      await coinSenderClaim.connect(addr1).sendCoins(NATIVE_TOKEN, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('1.01') })

      // Check that the contract now has the correct balance
      expect(await ethers.provider.getBalance(coinSenderClaim.address)).to.equal(amounts[0])

      const startBalance = await ethers.provider.getBalance(addr2.address);

      // addr2 claims the ETH
      await coinSenderClaim.connect(addr2).claimCoinsBatch([addr1.address], [NATIVE_TOKEN])

      // Check addr2 balance (minus gas fees)
      expect(await ethers.provider.getBalance(addr2.address)).to.be.closeTo(startBalance.add(amounts[0]), ethers.utils.parseEther('0.01'))
    })

    it('Should prevent a recipient from claiming ETH if sender cancels the transfer', async function () {
      const recipients = [addr2.address]
      const amounts = [ethers.utils.parseEther('1')]

      // Sender (addr1) sending ETH to addr2
      await coinSenderClaim.connect(addr1).sendCoins(NATIVE_TOKEN, recipients, amounts, ethers.utils.parseEther('0.01'), { value: ethers.utils.parseEther('1.01') })

      // Sender (addr1) canceling the transfer
      await coinSenderClaim.connect(addr1).cancelTransferBatch([addr2.address], [NATIVE_TOKEN])

      const initBal = await ethers.provider.getBalance(addr1.address);

      // addr2 trying to claim should be rejected
      await expect(
        coinSenderClaim.connect(addr2).claimCoinsBatch([addr1.address], [NATIVE_TOKEN])
      ).to.be.revertedWith('No pending claim found')

      // Check that the contract now has the correct balance (it should be zero)
      expect(await ethers.provider.getBalance(coinSenderClaim.address)).to.equal(0)

      // Check addr1 balance (minus gas fees). It should be increased by 1 ETH
      expect(await ethers.provider.getBalance(addr1.address)).to.be.closeTo(initBal.add(amounts[0]), ethers.utils.parseEther('0.01'))
    })
  })
})
