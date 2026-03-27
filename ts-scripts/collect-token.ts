/// Collect a Singu token from an authorized gate using a backend-issued claim ticket.
/// Usage:
///   pnpm collect-token -- --index <active-index> --assembly <GATE_OBJECT_ID> [--player A|B] [--ticket-api http://localhost:8787]

import { Transaction } from "@mysten/sui/transactions";
import {
  getSuiClient,
  getAdminKeypair,
  getPlayerKeypair,
  SINGUHUNT_PACKAGE_ID,
  GAME_STATE_ID,
  SINGU_SHARD_TREASURY_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";
import {
  createDevContextSignature,
  normalizeAddress,
} from "./utils/claim-ticket.js";

type TicketResponse = {
  playerAddress: string;
  epoch: string | number;
  ballIndex: string | number;
  assemblyId: string;
  expiresAtMs: string | number;
  nonce: string | number;
  signature: string;
  signerAddress: string;
};

async function main() {
  const args = process.argv.slice(2);
  let shardIndex = 0;
  let playerKey: "A" | "B" = "A";
  let assemblyId = process.env.TRUSTED_ASSEMBLY_ID || "";
  let ticketApi = process.env.CLAIM_TICKET_API_URL || "http://localhost:8787";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--index" && args[i + 1]) {
      shardIndex = Number.parseInt(args[i + 1], 10);
    }
    if (args[i] === "--player" && args[i + 1]) {
      playerKey = args[i + 1] as "A" | "B";
    }
    if (args[i] === "--assembly" && args[i + 1]) {
      assemblyId = args[i + 1];
    }
    if (args[i] === "--ticket-api" && args[i + 1]) {
      ticketApi = args[i + 1];
    }
  }

  if (!assemblyId) {
    throw new Error("Missing --assembly <GATE_OBJECT_ID> or TRUSTED_ASSEMBLY_ID");
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

  if (
    !gameState.data?.content ||
    gameState.data.content.dataType !== "moveObject"
  ) {
    throw new Error("Could not fetch game state");
  }

  const fields = (gameState.data.content as any).fields;
  const epoch = BigInt(fields.current_epoch);
  const requiredSinguCount = Number(fields.required_singu_count || fields.shard_gates?.length || 0);
  const tenant = process.env.TRUSTED_TENANT || "your-tenant";
  const devSecret = process.env.DEV_CONTEXT_SECRET;

  if (!SINGU_SHARD_TREASURY_ID) {
    throw new Error("Missing SINGU_SHARD_TREASURY_ID");
  }

  if (shardIndex < 0 || shardIndex >= requiredSinguCount) {
    throw new Error(`Shard index must be between 0 and ${requiredSinguCount - 1}`);
  }

  const ticketRequestBody: Record<string, string | number> = {
    playerAddress,
    ballIndex: shardIndex,
    epoch: epoch.toString(),
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

  const ticketResponse = await fetch(`${ticketApi}/claim-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticketRequestBody),
  });

  if (!ticketResponse.ok) {
    throw new Error(await ticketResponse.text());
  }

  const ticket = (await ticketResponse.json()) as TicketResponse;

  console.log(`Collecting Singu #${shardIndex} from ${ticket.assemblyId}`);
  console.log(`Player: ${playerAddress}`);
  console.log(`Ticket signer: ${ticket.signerAddress}`);

  const tx = new Transaction();
  tx.moveCall({
      target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::collect_singu_shard`,
      arguments: [
        tx.object(GAME_STATE_ID),
        tx.object(SINGU_SHARD_TREASURY_ID),
        tx.pure.u64(shardIndex),
        tx.pure.address(ticket.assemblyId),
      tx.pure.u64(BigInt(ticket.expiresAtMs)),
      tx.pure.u64(BigInt(ticket.nonce)),
      tx.pure.vector("u8", Array.from(Buffer.from(ticket.signature, "base64"))),
      tx.object("0x6"),
    ],
  });

  const result = await signAndExecute(client, keypair, tx);
  await client.waitForTransaction({
    digest: result.digest,
  });

  try {
    const events = await client.queryEvents({
      query: { Transaction: result.digest },
    });

    for (const event of events.data) {
      if (event.type.includes("SinguShardCollected")) {
        const data = event.parsedJson as Record<string, string>;
        console.log("\n=== Singu Collected ===");
        console.log(`Epoch: ${data.epoch}`);
        console.log(`Index: ${data.shard_index}`);
        console.log(`Collector: ${data.collector}`);
        console.log(`Gate: ${data.gate_id}`);
      }
    }
  } catch (error) {
    console.warn("Collected successfully, but event lookup is not ready yet:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
