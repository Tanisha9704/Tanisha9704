import { ethers } from 'hardhat';

async function main() {
  const FEE_BPS = 150;
  const TREASURY = process.env.TREASURY_ADDRESS;
  const SIGNER = process.env.SETTLEMENT_SIGNER_ADDRESS;
  if (!TREASURY || !SIGNER) {
    throw new Error('Set TREASURY_ADDRESS and SETTLEMENT_SIGNER_ADDRESS in .env');
  }

  const factory = await ethers.getContractFactory('UnoEscrow');
  const escrow = await factory.deploy(FEE_BPS, TREASURY, SIGNER);
  await escrow.waitForDeployment();
  const addr = await escrow.getAddress();
  console.log(`UnoEscrow deployed to: ${addr}`);
  console.log(`Constructor args: feeBps=${FEE_BPS}, treasury=${TREASURY}, signer=${SIGNER}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
