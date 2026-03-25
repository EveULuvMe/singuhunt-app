/// Expire the current active hunt (admin only).

import { Transaction } from "@mysten/sui/transactions";
import {
  getSuiClient,
  getAdminKeypair,
  SINGUHUNT_PACKAGE_ID,
  GAME_STATE_ID,
  ADMIN_CAP_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

async function main() {
  const client = getSuiClient();
  const admin = getAdminKeypair();

  const tx = new Transaction();
  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::expire_hunt`,
    arguments: [tx.object(ADMIN_CAP_ID), tx.object(GAME_STATE_ID)],
  });

  console.log("Expiring current hunt...");
  const result = await signAndExecute(client, admin, tx);
  console.log("Hunt expired. Digest:", result.digest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
