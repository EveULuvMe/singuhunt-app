/// Start a new hunt by randomly selecting the configured number of gates from the on-chain gate pool.
/// Usage: pnpm start-hunt [-- --mode 1 --duration 30]
///   --mode: 1=Solo Race, 2=Team Race, 3=Deep Decrypt, 4=Large Arena, 5=Obstacle Run (default: 1)
///   --duration: game duration in minutes (default: 30)

import { randomInt } from "node:crypto";
import { Transaction } from "@mysten/sui/transactions";
import {
  getSuiClient,
  getAdminKeypair,
  SINGUHUNT_PACKAGE_ID,
  GAME_STATE_ID,
  ADMIN_CAP_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

type PoolGate = {
  index: number;
  gateId: string;
  name: string;
};

type PoolSnapshot = {
  requiredSinguCount: number;
  gates: PoolGate[];
};

function normalizeAddress(value: string) {
  return value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

function decodeMoveString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return Buffer.from(value).toString("utf8");
  }
  return String(value ?? "");
}

function shuffleInPlace<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function extractPoolGate(raw: any, index: number): PoolGate | null {
  const gate = raw?.fields ?? raw;
  if (!gate?.gate_id || gate.gate_id === "0x0") {
    return null;
  }

  return {
    index,
    gateId: normalizeAddress(gate.gate_id),
    name: decodeMoveString(gate.name) || `Gate #${index}`,
  };
}

async function fetchUniquePoolGates() {
  const client = getSuiClient();
  const gameState = await client.getObject({
    id: GAME_STATE_ID,
    options: { showContent: true },
  });

  if (!gameState.data?.content || gameState.data.content.dataType !== "moveObject") {
    throw new Error("Could not fetch GameState content");
  }

  const fields = (gameState.data.content as any).fields;
  const requiredSinguCount = Number(fields.required_singu_count || 0);
  const pool = Array.isArray(fields.gate_pool) ? fields.gate_pool : [];
  const uniqueGateIds = new Set<string>();
  const uniquePool: PoolGate[] = [];

  pool.forEach((raw: any, index: number) => {
    const gate = extractPoolGate(raw, index);
    if (!gate) {
      return;
    }

    if (uniqueGateIds.has(gate.gateId)) {
      return;
    }

    uniqueGateIds.add(gate.gateId);
    uniquePool.push(gate);
  });

  return {
    requiredSinguCount,
    gates: uniquePool,
  } satisfies PoolSnapshot;
}

const MODE_LABELS: Record<number, string> = {
  1: "Solo Race",
  2: "Team Race",
  3: "Deep Decrypt",
  4: "Large Arena",
  5: "Obstacle Run",
};

async function main() {
  const args = process.argv.slice(2);
  let mode = 1;
  let durationMin = 30;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mode" && args[i + 1]) mode = Number(args[i + 1]);
    if (args[i] === "--duration" && args[i + 1]) durationMin = Number(args[i + 1]);
  }
  if (mode < 1 || mode > 5) throw new Error(`Invalid mode: ${mode}. Must be 1-5.`);
  if (durationMin <= 0) throw new Error(`Invalid duration: ${durationMin}. Must be > 0.`);
  const durationMs = durationMin * 60 * 1000;

  const client = getSuiClient();
  const adminKeypair = getAdminKeypair();
  const { requiredSinguCount, gates } = await fetchUniquePoolGates();

  if (requiredSinguCount <= 0) {
    throw new Error("required_singu_count is not configured on-chain");
  }

  if (gates.length < requiredSinguCount) {
    throw new Error(
      `Need at least ${requiredSinguCount} unique gates in gate_pool before starting a hunt. Found ${gates.length}.`,
    );
  }

  shuffleInPlace(gates);
  const selected = gates.slice(0, requiredSinguCount);
  const selectedIndices = selected.map((gate) => gate.index);

  console.log("Starting new SinguHunt...");
  console.log(`Mode: ${mode} - ${MODE_LABELS[mode]}`);
  console.log(`Duration: ${durationMin} minutes`);
  console.log(`Admin: ${adminKeypair.toSuiAddress()}`);
  console.log(`Package: ${SINGUHUNT_PACKAGE_ID}`);
  console.log(`GameState: ${GAME_STATE_ID}`);
  console.log(`Required Singu Count: ${requiredSinguCount}`);
  console.log("\nSelected active gates:");
  selected.forEach((gate, index) => {
    console.log(`  ${index + 1}. [pool ${gate.index}] ${gate.name} (${gate.gateId})`);
  });

  const tx = new Transaction();
  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::start_hunt_with_selection`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(GAME_STATE_ID),
      tx.pure.vector("u64", selectedIndices),
      tx.pure.u8(mode),
      tx.pure.u64(durationMs),
      tx.object("0x6"),
    ],
  });

  const result = await signAndExecute(client, adminKeypair, tx);
  console.log(`\nHunt started in tx ${result.digest}`);
}

main().catch(console.error);
