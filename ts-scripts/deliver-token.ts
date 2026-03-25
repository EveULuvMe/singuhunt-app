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
import { normalizeAddress } from "./utils/claim-ticket.js";
import { signAndExecute } from "./utils/transaction.js";

type TicketResponse = {
  epoch: string | number;
  ballIndex: string | number;
  assemblyId: string;
  expiresAtMs: string | number;
  nonce: string | number;
  signature: string;
};

type OwnedDragonBall = {
  objectId: string;
  epoch: number;
  starIndex: number;
  delivered: boolean;
};

async function main() {
  const args = process.argv.slice(2);
  let playerKey: "A" | "B" = "A";
  let assemblyId = process.env.END_GATE_ASSEMBLY_ID || process.env.TRUSTED_GATE_3_ASSEMBLY_ID || "";
  let ticketApi = process.env.DELIVER_TICKET_API_URL || process.env.CLAIM_TICKET_API_URL || "";
  let starIndex: number | null = null;

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
      starIndex = Number.parseInt(args[i + 1], 10);
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
  const gameState = await client.getObject({
    id: GAME_STATE_ID,
    options: { showContent: true },
  });
  if (!gameState.data?.content || gameState.data.content.dataType !== "moveObject") {
    throw new Error("Could not fetch GameState");
  }

  const currentEpoch = Number((gameState.data.content as any).fields.current_epoch);
  const ownedObjects = await client.getOwnedObjects({
    owner: playerAddress,
    filter: {
      StructType: `${SINGUHUNT_PACKAGE_ID}::singuhunt::DragonBall`,
    },
    options: { showContent: true },
  });

  const tokens: OwnedDragonBall[] = ownedObjects.data
    .filter((obj) => obj.data?.content?.dataType === "moveObject")
    .map((obj) => {
      const fields = (obj.data!.content as any).fields;
      return {
        objectId: obj.data!.objectId,
        epoch: Number(fields.epoch),
        starIndex: Number(fields.star_index),
        delivered: Boolean(fields.delivered),
      };
    })
    .filter((token) => token.epoch === currentEpoch && !token.delivered)
    .sort((a, b) => a.starIndex - b.starIndex);

  const token =
    starIndex == null
      ? tokens[0]
      : tokens.find((candidate) => candidate.starIndex === starIndex);

  if (!token) {
    throw new Error("No matching undelivered DragonBall token found for the current epoch");
  }

  const ticketResponse = await fetch(`${ticketApi}/deliver-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerAddress,
      ballIndex: token.starIndex,
      epoch: currentEpoch,
    }),
  });

  if (!ticketResponse.ok) {
    throw new Error(await ticketResponse.text());
  }

  const ticket = (await ticketResponse.json()) as TicketResponse;
  const tx = new Transaction();
  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::deliver_ball`,
    arguments: [
      tx.object(GAME_STATE_ID),
      tx.object(token.objectId),
      tx.pure.address(ticket.assemblyId),
      tx.pure.u64(BigInt(ticket.expiresAtMs)),
      tx.pure.u64(BigInt(ticket.nonce)),
      tx.pure.vector("u8", Array.from(Buffer.from(ticket.signature, "base64"))),
      tx.object("0x6"),
    ],
  });

  const result = await signAndExecute(client, keypair, tx);
  console.log(`Delivered star ${token.starIndex} in tx ${result.digest}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
