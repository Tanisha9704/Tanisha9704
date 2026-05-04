import { expect } from 'chai';
import { ethers } from 'hardhat';
import { keccak256, toUtf8Bytes } from 'ethers';

describe('UnoEscrow', () => {
  async function deploy() {
    const [owner, treasury, signer, alice, bob, carol] = await ethers.getSigners();
    const UnoEscrow = await ethers.getContractFactory('UnoEscrow');
    const escrow = await UnoEscrow.deploy(150, treasury.address, signer.address);
    await escrow.waitForDeployment();
    return { escrow, owner, treasury, signer, alice, bob, carol };
  }

  function gameIdFor(s: string): string {
    return keccak256(toUtf8Bytes(s));
  }

  it('caps fee at 5%', async () => {
    const { escrow, owner } = await deploy();
    await expect(escrow.connect(owner).setFeeBps(600)).to.be.revertedWith('fee too high');
    await escrow.connect(owner).setFeeBps(300);
    expect(await escrow.platformFeeBps()).to.equal(300n);
  });

  it('host creates and second player joins', async () => {
    const { escrow, alice, bob } = await deploy();
    const id = gameIdFor('game-1');
    const buyIn = ethers.parseEther('1');
    await escrow.connect(alice).createGame(id, 2, { value: buyIn });
    await escrow.connect(bob).joinGame(id, { value: buyIn });
    const g = await escrow.getGame(id);
    expect(g.currentPlayers).to.equal(2n);
    expect(g.host).to.equal(alice.address);
  });

  it('rejects join with wrong buy-in', async () => {
    const { escrow, alice, bob } = await deploy();
    const id = gameIdFor('game-2');
    await escrow.connect(alice).createGame(id, 2, { value: ethers.parseEther('1') });
    await expect(
      escrow.connect(bob).joinGame(id, { value: ethers.parseEther('0.5') }),
    ).to.be.revertedWith('wrong buy-in');
  });

  it('refunds on host leave and cancels game', async () => {
    const { escrow, alice, bob } = await deploy();
    const id = gameIdFor('game-3');
    const buyIn = ethers.parseEther('1');
    await escrow.connect(alice).createGame(id, 3, { value: buyIn });
    await escrow.connect(bob).joinGame(id, { value: buyIn });

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);
    await escrow.connect(alice).leaveBeforeStart(id);
    const aliceAfter = await ethers.provider.getBalance(alice.address);
    const bobAfter = await ethers.provider.getBalance(bob.address);

    expect(aliceAfter).to.be.gt(aliceBefore - ethers.parseEther('0.01')); // refunded - gas
    expect(bobAfter - bobBefore).to.equal(buyIn);

    const g = await escrow.getGame(id);
    expect(g.active).to.equal(false);
  });

  it('settles to winner with 1.5% fee', async () => {
    const { escrow, signer, treasury, alice, bob, carol } = await deploy();
    const id = gameIdFor('game-4');
    const buyIn = ethers.parseEther('1');
    await escrow.connect(alice).createGame(id, 3, { value: buyIn });
    await escrow.connect(bob).joinGame(id, { value: buyIn });
    await escrow.connect(carol).joinGame(id, { value: buyIn });

    const payload = ethers.solidityPackedKeccak256(['bytes32', 'address'], [id, bob.address]);
    const sig = await signer.signMessage(ethers.getBytes(payload));

    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);

    await escrow.connect(alice).settleGame(id, bob.address, sig);

    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    const bobAfter = await ethers.provider.getBalance(bob.address);

    const totalPool = buyIn * 3n;
    const expectedFee = (totalPool * 150n) / 10_000n;
    const expectedPayout = totalPool - expectedFee;

    expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    expect(bobAfter - bobBefore).to.equal(expectedPayout);
  });

  it('rejects settlement with wrong signer', async () => {
    const { escrow, alice, bob, carol } = await deploy();
    const id = gameIdFor('game-5');
    const buyIn = ethers.parseEther('1');
    await escrow.connect(alice).createGame(id, 2, { value: buyIn });
    await escrow.connect(bob).joinGame(id, { value: buyIn });
    const payload = ethers.solidityPackedKeccak256(['bytes32', 'address'], [id, bob.address]);
    const wrongSig = await carol.signMessage(ethers.getBytes(payload)); // Carol is not the signer
    await expect(escrow.connect(alice).settleGame(id, bob.address, wrongSig)).to.be.revertedWith('bad signature');
  });
});
