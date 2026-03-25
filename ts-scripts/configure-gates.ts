/// Configure SinguHunt gates
/// Writes the start gate, end gate, and candidate gate pool to chain.
/// Default config path: config/gates.json

import { Transaction } from "@mysten/sui/transactions";
import {
  getSuiClient,
  getAdminKeypair,
  SINGUHUNT_PACKAGE_ID,
  GAME_STATE_ID,
  ADMIN_CAP_ID,
} from "./utils/config.js";
import { loadGateConfig, getGateConfigPath } from "./utils/gate-config.js";
import { signAndExecute } from "./utils/transaction.js";

async function main() {
  const client = getSuiClient();
  const keypair = getAdminKeypair();
  const gateConfig = loadGateConfig();

  console.log("Configuring SinguHunt gates...");
  console.log(`Config source: ${getGateConfigPath()}`);
  console.log(`Start gate: ${gateConfig.start.name} (${gateConfig.start.id})`);
  console.log(`End gate: ${gateConfig.end.name} (${gateConfig.end.id})`);
  console.log(`Required Singu Count: ${gateConfig.requiredSinguCount}`);
  console.log(`Pool size: ${gateConfig.pool.length}`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::set_start_gate`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(GAME_STATE_ID),
      tx.pure.address(gateConfig.start.id),
      tx.pure.string(gateConfig.start.name),
    ],
  });

  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::set_end_gate`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(GAME_STATE_ID),
      tx.pure.address(gateConfig.end.id),
      tx.pure.string(gateConfig.end.name),
    ],
  });

  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::set_required_singu_count`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(GAME_STATE_ID),
      tx.pure.u64(gateConfig.requiredSinguCount),
    ],
  });

  gateConfig.pool.forEach((gate, index) => {
    tx.moveCall({
      target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::set_pool_gate`,
      arguments: [
        tx.object(ADMIN_CAP_ID),
        tx.object(GAME_STATE_ID),
        tx.pure.u64(index),
        tx.pure.address(gate.id),
        tx.pure.string(gate.name),
      ],
    });
  });

  await signAndExecute(client, keypair, tx);

  console.log("Gate configuration complete.");
  console.log("Next step: run `pnpm start-hunt` to randomly activate the configured number of gates.");
}

main().catch(console.error);
