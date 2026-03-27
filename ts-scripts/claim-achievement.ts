/// Claim the permanent achievement NFT by burning the required number of SinguShard tokens.
/// Usage: pnpm claim-achievement [--player A|B]

import { Transaction } from "@mysten/sui/transactions";
import {
  getSuiClient,
  getAdminKeypair,
  getPlayerKeypair,
  SINGUHUNT_PACKAGE_ID,
  GAME_STATE_ID,
  SINGU_SHARD_TREASURY_ID,
  ACHIEVEMENT_TREASURY_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

type OwnedSinguShard = {
  objectId: string;
  epoch: number;
  shardIndex: number;
  delivered: boolean;
};

async function main() {
  const args = process.argv.slice(2);
  let playerKey: "A" | "B" = "A";

  for (let i = 0; i < args.length; i += 1) {
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

  const playerAddress = keypair.toSuiAddress();
  console.log(`Claiming achievement for player: ${playerAddress}`);

  const gameState = await client.getObject({
    id: GAME_STATE_ID,
    options: { showContent: true },
  });

  if (!gameState.data?.content || gameState.data.content.dataType !== "moveObject") {
    throw new Error("Could not fetch GameState");
  }

  const gameFields = (gameState.data.content as any).fields;
  const currentEpoch = Number(gameFields.current_epoch);
  const requiredSinguCount = Number(gameFields.required_singu_count);
  if (!SINGU_SHARD_TREASURY_ID || !ACHIEVEMENT_TREASURY_ID) {
    throw new Error("Missing SINGU_SHARD_TREASURY_ID or ACHIEVEMENT_TREASURY_ID");
  }

  const [ownedObjects, shardTokenObjects] = await Promise.all([
    client.getOwnedObjects({
      owner: playerAddress,
      filter: {
        StructType: `${SINGUHUNT_PACKAGE_ID}::singuhunt::SinguShardRecord`,
      },
      options: { showContent: true },
    }),
    client.getOwnedObjects({
      owner: playerAddress,
      filter: {
        StructType: `0x2::token::Token<${SINGUHUNT_PACKAGE_ID}::singu_shard_token::SINGU_SHARD_TOKEN>`,
      },
      options: { showType: true },
    }),
  ]);

  const tokens: OwnedSinguShard[] = ownedObjects.data
    .filter((obj) => obj.data?.content?.dataType === "moveObject")
    .map((obj) => {
      const fields = (obj.data!.content as any).fields;
      return {
        objectId: obj.data!.objectId,
        epoch: Number(fields.epoch),
        shardIndex: Number(fields.shard_index),
        delivered: Boolean(fields.delivered),
      };
    });

  console.log(`Found ${tokens.length} SinguShard tokens`);

  const epochTokens = tokens
    .filter((token) => token.epoch === currentEpoch && token.delivered)
    .sort((a, b) => a.shardIndex - b.shardIndex);
  const uniqueIndices = new Set(epochTokens.map((token) => token.shardIndex));

  if (uniqueIndices.size < requiredSinguCount) {
    console.error(
      `Need ${requiredSinguCount} unique delivered tokens for epoch ${currentEpoch}. Found ${uniqueIndices.size}.`,
    );
    console.log("Collected indices:", [...uniqueIndices].sort((a, b) => a - b));
    process.exit(1);
  }

  const selectedTokens: OwnedSinguShard[] = [];
  for (const token of epochTokens) {
    if (selectedTokens.some((selected) => selected.shardIndex === token.shardIndex)) {
      continue;
    }
    selectedTokens.push(token);
    if (selectedTokens.length === requiredSinguCount) {
      break;
    }
  }

  console.log(
    `\nBurning ${requiredSinguCount} tokens from epoch ${currentEpoch} to claim achievement...`,
  );

  const tx = new Transaction();
  const shardRecordVec = tx.makeMoveVec({
    elements: selectedTokens.map((token) => tx.object(token.objectId)),
  });
  const shardTokenVec = tx.makeMoveVec({
    elements: shardTokenObjects.data.slice(0, requiredSinguCount).map((token) => tx.object(token.data!.objectId)),
  });

  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::claim_achievement`,
    arguments: [
      tx.object(GAME_STATE_ID),
      tx.object(SINGU_SHARD_TREASURY_ID),
      tx.object(ACHIEVEMENT_TREASURY_ID),
      shardRecordVec,
      shardTokenVec,
      tx.object("0x6"),
    ],
  });

  const result = await signAndExecute(client, keypair, tx);
  const events = await client.queryEvents({
    query: { Transaction: result.digest },
  });

  for (const event of events.data) {
    if (event.type.includes("AchievementEarned")) {
      const data = event.parsedJson as any;
      console.log("\n=== ACHIEVEMENT UNLOCKED! ===");
      console.log(`Epoch: ${data.epoch}`);
      console.log(`Player: ${data.player}`);
      console.log(`Achievement #${data.achievement_number}`);
    }
  }
}

main().catch(console.error);
