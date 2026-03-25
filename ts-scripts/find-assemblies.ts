/// Find all your Smart Assemblies and Character on Configured Tenant
/// Usage: pnpm find-assemblies

import { getSuiClient } from "./utils/config.js";

// Configured Tenant world package: use published-at for function calls, original-id for struct types
const WORLD_PACKAGE_ID =
  "0x07e6b810c2dff6df56ea7fbad9ff32f4d84cbee53e496267515887b712924bd1";
const WORLD_ORIGINAL_ID =
  "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75";

async function main() {
  const client = getSuiClient();
  const address = process.env.ADMIN_ADDRESS!;

  console.log(`Scanning on-chain objects for: ${address}\n`);

  // Get all owned objects
  let cursor: string | null | undefined = null;
  let allObjects: any[] = [];

  do {
    const result = await client.getOwnedObjects({
      owner: address,
      options: { showType: true, showContent: true },
      cursor: cursor,
      limit: 50,
    });
    allObjects = allObjects.concat(result.data);
    cursor = result.hasNextPage ? result.nextCursor : null;
  } while (cursor);

  console.log(`Total owned objects: ${allObjects.length}\n`);

  // Filter for World package objects
  const worldObjects = allObjects.filter(
    (obj) =>
      obj.data?.type?.includes(WORLD_ORIGINAL_ID) ||
      obj.data?.type?.includes(WORLD_PACKAGE_ID) ||
      obj.data?.type?.includes("OwnerCap") ||
      obj.data?.type?.includes("Character") ||
      obj.data?.type?.includes("Assembly") ||
      obj.data?.type?.includes("Gate") ||
      obj.data?.type?.includes("StorageUnit") ||
      obj.data?.type?.includes("Turret") ||
      obj.data?.type?.includes("NetworkNode"),
  );

  if (worldObjects.length > 0) {
    console.log("=== EVE Frontier Objects ===");
    for (const obj of worldObjects) {
      console.log(`  ID: ${obj.data?.objectId}`);
      console.log(`  Type: ${obj.data?.type}`);
      console.log("");
    }
  }

  // Also search for SinguHunt objects
  const singuhuntObjects = allObjects.filter((obj) =>
    obj.data?.type?.includes("singuhunt"),
  );

  if (singuhuntObjects.length > 0) {
    console.log("=== SinguHunt Objects ===");
    for (const obj of singuhuntObjects) {
      console.log(`  ID: ${obj.data?.objectId}`);
      console.log(`  Type: ${obj.data?.type}`);
      console.log("");
    }
  }

  // Try World API for assemblies
  console.log("=== Querying Configured Tenant World API ===");
  try {
    const res = await fetch(
      `https://world-api.example.com/v2/smart-assemblies?limit=50`,
    );
    const data = await res.json();
    if (data && Array.isArray(data)) {
      const mine = data.filter(
        (a: any) =>
          a.ownerAddress?.toLowerCase() === address.toLowerCase() ||
          a.owner?.toLowerCase() === address.toLowerCase(),
      );
      if (mine.length > 0) {
        console.log(`Found ${mine.length} assemblies owned by you:`);
        for (const a of mine) {
          console.log(`  ID: ${a.id || a.objectId}`);
          console.log(`  Type: ${a.type || a.assemblyType}`);
          console.log(`  Name: ${a.name || "unnamed"}`);
          console.log(`  State: ${a.state || a.status}`);
          console.log("");
        }
      } else {
        console.log("No assemblies found for your address via World API.");
        console.log(
          "Note: Your in-game wallet address might differ from your Sui CLI address.",
        );
        console.log(
          "\nShowing first 5 assemblies from API for reference:",
        );
        for (const a of data.slice(0, 5)) {
          console.log(
            `  ${a.id || a.objectId} | ${a.type || a.assemblyType} | owner: ${a.ownerAddress || a.owner}`,
          );
        }
      }
    }
  } catch (err: any) {
    console.log("World API query failed:", err.message);
  }
}

main().catch(console.error);
