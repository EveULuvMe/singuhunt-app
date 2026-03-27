/// Burn expired SinguShard tokens (cleanup)
/// Usage: pnpm burn-expired
///        pnpm burn-expired -- --owner <ADDRESS>

import { Transaction } from "@mysten/sui/transactions";
import {
  getSuiClient,
  getAdminKeypair,
  SINGUHUNT_PACKAGE_ID,
  SINGU_SHARD_TREASURY_ID,
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

  console.log(`Scanning expired SinguShards for: ${ownerAddress}`);

  let cursor: string | null | undefined = null;
  if (!SINGU_SHARD_TREASURY_ID) {
    throw new Error("Missing SINGU_SHARD_TREASURY_ID");
  }

  let allBalls: { objectId: string; expiresAt: number; epoch: number; shardIndex: number }[] = [];

  do {
    const result = await client.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: `${SINGUHUNT_PACKAGE_ID}::singuhunt::SinguShardRecord` },
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
          shardIndex: Number(fields.shard_index),
        });
      }
    }

    cursor = result.hasNextPage ? result.nextCursor : null;
  } while (cursor);

  const now = Date.now();
  const expired = allBalls.filter((b) => b.expiresAt < now);

  if (expired.length === 0) {
    console.log("No expired SinguShards found.");
    return;
  }

  console.log(`Found ${expired.length} expired SinguShard(s). Burning...`);

  const batchSize = 10;
  for (let i = 0; i < expired.length; i += batchSize) {
    const batch = expired.slice(i, i + batchSize);
    const tx = new Transaction();
    const shardTokenObjects = await client.getOwnedObjects({
      owner: ownerAddress,
      filter: {
        StructType: `0x2::token::Token<${SINGUHUNT_PACKAGE_ID}::singu_shard_token::SINGU_SHARD_TOKEN>`,
      },
      options: { showType: true },
      limit: batch.length,
    });

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      const ball = batch[batchIndex];
      const shardTokenId = shardTokenObjects.data[batchIndex]?.data?.objectId;
      if (!shardTokenId) {
        throw new Error("Not enough SinguShard token objects to burn expired records");
      }
      tx.moveCall({
        target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::burn_expired_singu_shard`,
        arguments: [
          tx.object(SINGU_SHARD_TREASURY_ID),
          tx.object(ball.objectId),
          tx.object(shardTokenId),
          tx.object("0x6"),
        ],
      });
    }

    const result = await signAndExecute(client, keypair, tx);
    console.log(
      `Burned batch ${Math.floor(i / batchSize) + 1}: ${batch.length} balls (epoch ${batch[0].epoch}). Digest: ${result.digest}`,
    );
  }

  console.log("Done! All expired SinguShards burned.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
