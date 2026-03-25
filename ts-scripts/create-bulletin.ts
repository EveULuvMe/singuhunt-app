/// Create a bulletin board configuration for an SSU
/// Usage: pnpm create-bulletin -- --ssu <ssu_object_id>

import { Transaction } from "@mysten/sui/transactions";
import {
  getSuiClient,
  getAdminKeypair,
  SINGUHUNT_PACKAGE_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

async function main() {
  const args = process.argv.slice(2);
  let ssuObjectId = "0x0"; // placeholder

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ssu" && args[i + 1]) {
      ssuObjectId = args[i + 1];
    }
  }

  const client = getSuiClient();
  const adminKeypair = getAdminKeypair();

  console.log("Creating bulletin board...");
  console.log(`Admin: ${adminKeypair.toSuiAddress()}`);
  console.log(`SSU: ${ssuObjectId}`);

  const tx = new Transaction();

  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::bulletin_board::create_bulletin`,
    arguments: [tx.pure.address(ssuObjectId)],
  });

  const result = await signAndExecute(client, adminKeypair, tx);

  // Find the created BulletinConfig object
  const events = await client.queryEvents({
    query: { Transaction: result.digest },
  });

  for (const event of events.data) {
    if (event.type.includes("BulletinCreated")) {
      const data = event.parsedJson as any;
      console.log("\n=== Bulletin Board Created! ===");
      console.log(`SSU: ${data.ssu_object_id}`);
      console.log(`Admin: ${data.admin}`);
      console.log(
        "\nUpdate your .env with the BULLETIN_CONFIG_ID from the transaction object changes.",
      );
    }
  }
}

main().catch(console.error);
