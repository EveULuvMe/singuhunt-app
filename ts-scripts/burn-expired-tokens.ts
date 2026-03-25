/// Burn expired DragonBall tokens (cleanup)
/// Usage: pnpm burn-expired
///        pnpm burn-expired -- --owner <ADDRESS>

import { Transaction } from "@mysten/sui/transactions";
import {
  getSuiClient,
  getAdminKeypair,
  SINGUHUNT_PACKAGE_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

async function main() {
  const args = process.argv.slice(2);
  const client = getSuiClient();
  const keypair = getAdminKeypair();

  let ownerAddress = keypair.toSuiAddress();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--owner" && args[i + 1]) {
      ownerAddress = args[i + 1];
    }
  }

  console.log(`Scanning expired DragonBalls for: ${ownerAddress}`);

  let cursor: string | null | undefined = null;
  let allBalls: { objectId: string; expiresAt: number; epoch: number; starIndex: number }[] = [];

  do {
    const result = await client.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: `${SINGUHUNT_PACKAGE_ID}::singuhunt::DragonBall` },
      options: { showContent: true },
      cursor: cursor ?? undefined,
      limit: 50,
    });

    for (const record of result.data) {
      const fields = (record.data?.content as any)?.fields;
      if (fields) {
        allBalls.push({
          objectId: record.data!.objectId,
          expiresAt: Number(fields.expires_at),
          epoch: Number(fields.epoch),
          starIndex: Number(fields.star_index),
        });
      }
    }

    cursor = result.hasNextPage ? result.nextCursor : null;
  } while (cursor);

  const now = Date.now();
  const expired = allBalls.filter((b) => b.expiresAt < now);

  if (expired.length === 0) {
    console.log("No expired DragonBalls found.");
    return;
  }

  console.log(`Found ${expired.length} expired DragonBall(s). Burning...`);

  const batchSize = 10;
  for (let i = 0; i < expired.length; i += batchSize) {
    const batch = expired.slice(i, i + batchSize);
    const tx = new Transaction();

    for (const ball of batch) {
      tx.moveCall({
        target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::burn_expired_ball`,
        arguments: [tx.object(ball.objectId), tx.object("0x6")],
      });
    }

    const result = await signAndExecute(client, keypair, tx);
    console.log(
      `Burned batch ${Math.floor(i / batchSize) + 1}: ${batch.length} balls (epoch ${batch[0].epoch}). Digest: ${result.digest}`,
    );
  }

  console.log("Done! All expired DragonBalls burned.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
