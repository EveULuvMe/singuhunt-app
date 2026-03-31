/// Set dApp URL on any Smart Assembly (Gate, SSU, Turret)
/// This bypasses the in-game F button - sets metadata URL directly on-chain
///
/// Usage: pnpm set-url -- --assembly <ASSEMBLY_OBJECT_ID> --character <CHARACTER_ID> --ownercap <OWNERCAP_ID>

import { Transaction } from "@mysten/sui/transactions";
import { getSuiClient, getAdminKeypair } from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

// World package: use published-at for function calls, original-id for struct types
const WORLD_PACKAGE_ID =
  "0x07e6b810c2dff6df56ea7fbad9ff32f4d84cbee53e496267515887b712924bd1";
const WORLD_ORIGINAL_ID =
  "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75";

const DAPP_URL = "https://your-dapp.example.com";

async function main() {
  const args = process.argv.slice(2);
  let assemblyId = "";
  let characterId = "";
  let ownerCapId = "";
  let url = DAPP_URL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--assembly" && args[i + 1]) assemblyId = args[i + 1];
    if (args[i] === "--character" && args[i + 1]) characterId = args[i + 1];
    if (args[i] === "--ownercap" && args[i + 1]) ownerCapId = args[i + 1];
    if (args[i] === "--url" && args[i + 1]) url = args[i + 1];
  }

  if (!assemblyId || !characterId || !ownerCapId) {
    console.log("Usage: pnpm set-url -- --assembly <ID> --character <ID> --ownercap <ID> [--url <URL>]");
    console.log("\nFirst, find your IDs by running: pnpm find-assemblies");
    process.exit(1);
  }

  const client = getSuiClient();
  const keypair = getAdminKeypair();

  console.log("Setting dApp URL on assembly...");
  console.log(`Assembly: ${assemblyId}`);
  console.log(`URL: ${url}`);

  const tx = new Transaction();

  // Step 1: Borrow OwnerCap from Character
  const [ownerCap, receipt] = tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
    typeArguments: [`${WORLD_ORIGINAL_ID}::assembly::Assembly`],
    arguments: [
      tx.object(characterId),
      tx.receivingRef({
        objectId: ownerCapId,
        version: "0", // will be resolved
        digest: "",
      }),
    ],
  });

  // Step 2: Update metadata URL
  tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::assembly::update_metadata_url`,
    arguments: [
      tx.object(assemblyId),
      ownerCap,
      tx.pure.string(url),
    ],
  });

  // Step 3: Return OwnerCap
  tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
    typeArguments: [`${WORLD_ORIGINAL_ID}::assembly::Assembly`],
    arguments: [tx.object(characterId), ownerCap, receipt],
  });

  try {
    const result = await signAndExecute(client, keypair, tx);
    console.log("\nURL set successfully!");
    console.log(`Players can now see SinguHunt at your assembly.`);
  } catch (err: any) {
    console.error("Failed:", err.message);
    console.log("\nIf this fails, the assembly type might need a different module.");
    console.log("Try with gate/storage_unit/turret specific update functions.");
  }
}

main().catch(console.error);
