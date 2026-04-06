/// Temporary script: open registration for testing a specific mode
/// Usage: npx tsx ts-scripts/open-test-registration.ts [mode] [regMinutes]
///   mode: 1-5 (default 1)
///   regMinutes: registration window in minutes (default 3)

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
  const mode = Number(process.argv[2] || 1);
  const regMinutes = Number(process.argv[3] || 3);

  if (mode < 1 || mode > 5) throw new Error(`Invalid mode: ${mode}`);

  const now = Date.now();
  const regEnd = now + regMinutes * 60 * 1000;
  const gameStart = regEnd + 5 * 1000; // 5s after reg closes

  const client = getSuiClient();
  const admin = getAdminKeypair();

  const tx = new Transaction();
  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::open_registration`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(GAME_STATE_ID),
      tx.pure.u8(mode),
      tx.pure.u64(regEnd),
      tx.pure.u64(gameStart),
      tx.object("0x6"),
    ],
  });

  const result = await signAndExecute(client, admin, tx);
  const MODE_LABELS: Record<number, string> = {
    1: "Solo Race",
    2: "Team Race",
    3: "Deep Decrypt",
    4: "Large Arena",
    5: "Obstacle Run",
  };
  console.log(`Registration opened for Mode ${mode} (${MODE_LABELS[mode]})`);
  console.log(`Digest: ${result.digest}`);
  console.log(`Reg window: ${regMinutes} min (ends at ${new Date(regEnd).toLocaleTimeString()})`);
  console.log(`Game starts at: ${new Date(gameStart).toLocaleTimeString()}`);
}

main().catch(console.error);
