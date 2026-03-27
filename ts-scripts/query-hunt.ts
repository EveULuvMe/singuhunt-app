/// Query current hunt status, candidate gate pool, and today's active gates.

import { getSuiClient, GAME_STATE_ID } from "./utils/config.js";

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

function extractGate(raw: any) {
  const gate = raw?.fields ?? raw;
  return {
    gateId: normalizeAddress(gate.gate_id),
    name: decodeMoveString(gate.name),
    hasBall: Boolean(gate.has_ball),
    ballCollected: Boolean(gate.ball_collected),
    collector: gate.collector ? normalizeAddress(gate.collector) : "0x0",
    ballDelivered: Boolean(gate.ball_delivered),
    deliverer: gate.deliverer ? normalizeAddress(gate.deliverer) : "0x0",
  };
}

async function main() {
  const client = getSuiClient();

  console.log("Querying SinguHunt game state...\n");

  const gameState = await client.getObject({
    id: GAME_STATE_ID,
    options: { showContent: true },
  });

  if (!gameState.data?.content || gameState.data.content.dataType !== "moveObject") {
    throw new Error("Could not fetch GameState");
  }

  const fields = (gameState.data.content as any).fields;
  const gatePool = Array.isArray(fields.gate_pool) ? fields.gate_pool.map(extractGate) : [];
  const activeShardGates = Array.isArray(fields.shard_gates)
    ? fields.shard_gates.map(extractGate)
    : [];
  const deliveredCount = activeShardGates.filter(
    (gate: ReturnType<typeof extractGate>) => gate.ballDelivered,
  ).length;

  console.log("=== SinguHunt Status ===");
  console.log(`Current Epoch: ${fields.current_epoch}`);
  console.log(`Hunt Active: ${fields.hunt_active}`);
  console.log(`Total Hunts: ${fields.total_hunts}`);
  console.log(`Total Achievements: ${fields.total_achievements}`);
  console.log(`Required Singu Count: ${fields.required_singu_count}`);
  console.log(`Gate Pool Size: ${gatePool.length}`);
  console.log(`Delivered Count: ${deliveredCount}`);

  console.log(`\nStart Gate: ${decodeMoveString(fields.start_gate_name)} (${normalizeAddress(fields.start_gate)})`);
  console.log(`End Gate: ${decodeMoveString(fields.end_gate_name)} (${normalizeAddress(fields.end_gate)})`);

  if (fields.hunt_active) {
    const start = new Date(Number(fields.hunt_start_time));
    const end = new Date(Number(fields.hunt_end_time));
    console.log(`\nHunt Start: ${start.toISOString()}`);
    console.log(`Hunt End: ${end.toISOString()}`);
  }

  console.log("\nCandidate Gate Pool:");
  gatePool.forEach((gate: ReturnType<typeof extractGate>, index: number) => {
    console.log(`  [${index}] ${gate.name} (${gate.gateId})`);
  });

  console.log(`\nToday's Active ${fields.required_singu_count} Gates:`);
  activeShardGates.forEach((gate: ReturnType<typeof extractGate>, index: number) => {
    const status = gate.ballDelivered
      ? `DELIVERED by ${gate.deliverer}`
      : gate.ballCollected
        ? `COLLECTED by ${gate.collector}`
      : gate.hasBall
        ? "AVAILABLE"
        : "INACTIVE";
    console.log(`  [${index}] ${gate.name} (${gate.gateId}) - ${status}`);
  });
}

main().catch(console.error);
