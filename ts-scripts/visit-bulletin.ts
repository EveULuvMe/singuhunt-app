/// Visit the bulletin board and check hunt status
/// Usage: pnpm visit-bulletin [--player A|B]

import { Transaction } from "@mysten/sui/transactions";
import {
  getSuiClient,
  getAdminKeypair,
  getPlayerKeypair,
  SINGUHUNT_PACKAGE_ID,
  GAME_STATE_ID,
  BULLETIN_CONFIG_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

async function main() {
  const args = process.argv.slice(2);
  let playerKey: "A" | "B" = "A";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--player" && args[i + 1]) {
      playerKey = args[i + 1] as "A" | "B";
    }
  }

  const client = getSuiClient();
  let keypair;
  try {
    keypair = getPlayerKeypair(playerKey);
  } catch {
    keypair = getAdminKeypair();
  }

  console.log(`Visiting bulletin board as: ${keypair.toSuiAddress()}`);

  if (!BULLETIN_CONFIG_ID) {
    console.log(
      "No BULLETIN_CONFIG_ID set. Run create-bulletin first.",
    );
    // Still query the game state
  } else {
    const tx = new Transaction();
    tx.moveCall({
      target: `${SINGUHUNT_PACKAGE_ID}::bulletin_board::visit_bulletin`,
      arguments: [tx.object(BULLETIN_CONFIG_ID), tx.object("0x6")],
    });
    await signAndExecute(client, keypair, tx);
    console.log("Visit recorded!\n");
  }

  // Query and display game state
  const gameState = await client.getObject({
    id: GAME_STATE_ID,
    options: { showContent: true },
  });

  if (
    gameState.data?.content &&
    gameState.data.content.dataType === "moveObject"
  ) {
    const fields = (gameState.data.content as any).fields;

    console.log("=== Bulletin Board ===");
    console.log(
      `Location: System ${fields.bulletin_solar_system} (${fields.bulletin_x}, ${fields.bulletin_y}, ${fields.bulletin_z})`,
    );
    console.log(`\nHunt Active: ${fields.hunt_active}`);
    console.log(`Current Epoch: ${fields.current_epoch}`);

    if (fields.hunt_active) {
      const end = new Date(Number(fields.hunt_end_time));
      const remaining = end.getTime() - Date.now();

      if (remaining > 0) {
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        console.log(`Time Remaining: ${hours}h ${minutes}m`);
      }

      console.log("\nSingularity Targets:");
      for (let i = 0; i < fields.singularity_coords.length; i++) {
        const s = fields.singularity_coords[i];
        const icon = s.collected ? "X" : "O";
        console.log(
          `  [${icon}] #${i}: System ${s.solar_system} (${s.x}, ${s.y}, ${s.z})`,
        );
      }
      console.log("\n  O = Available  X = Collected");
    } else {
      console.log("No active hunt. Check back later!");
    }
  }
}

main().catch(console.error);
