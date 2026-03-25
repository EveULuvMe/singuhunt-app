/// Configure the trusted claim ticket signer on-chain.
/// Usage:
///   pnpm set-ticket-signer -- --address <SUI_ADDRESS>

import { Transaction } from "@mysten/sui/transactions";
import {
  getAdminKeypair,
  getSuiClient,
  ADMIN_CAP_ID,
  GAME_STATE_ID,
  SINGUHUNT_PACKAGE_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

async function main() {
  const args = process.argv.slice(2);
  let signerAddress = process.env.CLAIM_TICKET_SIGNER_ADDRESS || "";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--address" && args[i + 1]) {
      signerAddress = args[i + 1];
    }
  }

  if (!signerAddress) {
    throw new Error(
      "Missing --address <SUI_ADDRESS> or CLAIM_TICKET_SIGNER_ADDRESS",
    );
  }

  const client = getSuiClient();
  const admin = getAdminKeypair();
  const tx = new Transaction();

  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::set_ticket_signer`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(GAME_STATE_ID),
      tx.pure.address(signerAddress),
    ],
  });

  await signAndExecute(client, admin, tx);
  console.log(`Configured trusted claim ticket signer: ${signerAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
