/// Deliver a collected Singu token back to the home gate using a backend-issued deliver ticket.
/// Usage:
///   pnpm tsx ts-scripts/deliver-token.ts -- --assembly <HOME_GATE_ID> [--star-index <N>] [--player A|B] [--ticket-api https://.../api/gates/home]

import { Transaction } from "@mysten/sui/transactions";
import {
  getAdminKeypair,
  getPlayerKeypair,
  getSuiClient,
  GAME_STATE_ID,
  SINGUHUNT_PACKAGE_ID,
} from "./utils/config.js";
import { createDevContextSignature, normalizeAddress } from "./utils/claim-ticket.js";
import { signAndExecute } from "./utils/transaction.js";

type TicketResponse = {
  epoch: string | number;
  ballIndex: string | number;
  assemblyId: string;
  expiresAtMs: string | number;
  nonce: string | number;
  signature: string;
};

type OwnedSinguShard = {
  objectId: string;
  epoch: number;
  shardIndex: number;
  delivered: boolean;
};

async function main() {
  const args = process.argv.slice(2);
  let playerKey: "A" | "B" = "A";
  let assemblyId = process.env.END_GATE_ASSEMBLY_ID || process.env.TRUSTED_GATE_3_ASSEMBLY_ID || "";
  let ticketApi = process.env.DELIVER_TICKET_API_URL || process.env.CLAIM_TICKET_API_URL || "";
  let shardIndex: number | null = null;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--player" && args[i + 1]) {
      playerKey = args[i + 1] as "A" | "B";
    }
    if (args[i] === "--assembly" && args[i + 1]) {
      assemblyId = args[i + 1];
    }
    if (args[i] === "--ticket-api" && args[i + 1]) {
      ticketApi = args[i + 1];
    }
    if (args[i] === "--star-index" && args[i + 1]) {
      shardIndex = Number.parseInt(args[i + 1], 10);
    }
  }

  if (!assemblyId) {
    throw new Error("Missing --assembly <HOME_GATE_ID> or END_GATE_ASSEMBLY_ID");
  }
  if (!ticketApi) {
    throw new Error("Missing --ticket-api <.../api/gates/home> or DELIVER_TICKET_API_URL");
  }

  const client = getSuiClient();
  let keypair;
  try {
    keypair = getPlayerKeypair(playerKey);
  } catch {
    keypair = getAdminKeypair();
  }

  const playerAddress = normalizeAddress(keypair.toSuiAddress());
  const tenant = process.env.TRUSTED_TENANT || "your-tenant";
  const devSecret = process.env.DEV_CONTEXT_SECRET;
  const gameState = await client.getObject({
    id: GAME_STATE_ID,
    options: { showContent: true },
  });
  if (!gameState.data?.content || gameState.data.content.dataType !== "moveObject") {
    throw new Error("Could not fetch GameState");
  }

  const currentEpoch = Number((gameState.data.content as any).fields.current_epoch);
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
    })
    .filter((token) => token.epoch === currentEpoch && !token.delivered)
    .sort((a, b) => a.shardIndex - b.shardIndex);

  const shardTokenId = shardTokenObjects.data[0]?.data?.objectId;
  if (!shardTokenId) {
    throw new Error("No SinguShard token object found for the current wallet");
  }

  const token =
    shardIndex == null
      ? tokens[0]
      : tokens.find((candidate) => candidate.shardIndex === shardIndex);

  if (!token) {
    throw new Error("No matching undelivered SinguShard token found for the current epoch");
  }

  const ticketRequestBody: Record<string, string | number> = {
    playerAddress,
    ballIndex: token.shardIndex,
    epoch: currentEpoch,
    assemblyId: normalizeAddress(assemblyId),
    tenant,
  };

  if (devSecret) {
    ticketRequestBody.contextSignature = createDevContextSignature(
      {
        tenant,
        assemblyId: normalizeAddress(assemblyId),
        playerAddress,
      },
      devSecret,
    );
  }

  const ticketResponse = await fetch(`${ticketApi}/deliver-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticketRequestBody),
  });

  if (!ticketResponse.ok) {
    throw new Error(await ticketResponse.text());
  }

  const ticket = (await ticketResponse.json()) as TicketResponse;
  const tx = new Transaction();
  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::deliver_singu_shard`,
    arguments: [
      tx.object(GAME_STATE_ID),
      tx.object(token.objectId),
      tx.object(shardTokenId),
      tx.pure.address(ticket.assemblyId),
      tx.pure.u64(BigInt(ticket.expiresAtMs)),
      tx.pure.u64(BigInt(ticket.nonce)),
      tx.pure.vector("u8", Array.from(Buffer.from(ticket.signature, "base64"))),
      tx.object("0x6"),
    ],
  });

  const result = await signAndExecute(client, keypair, tx);
  console.log(`Delivered shard ${token.shardIndex} in tx ${result.digest}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
