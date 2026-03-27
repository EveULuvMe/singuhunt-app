import { Transaction } from "@mysten/sui/transactions";
import {
  getSuiClient,
  getAdminKeypair,
  SINGUHUNT_PACKAGE_ID,
  GAME_STATE_ID,
  ADMIN_CAP_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

const REGISTRATION_MINUTES = 2;
const START_DELAY_MINUTES = 3;
const GAME_DURATION_MINUTES = 7;

function formatCst(ms: number) {
  return new Date(ms).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
}

async function main() {
  const client = getSuiClient();
  const admin = getAdminKeypair();

  const now = Date.now();
  const regEnd = now + REGISTRATION_MINUTES * 60_000;
  const gameStart = now + START_DELAY_MINUTES * 60_000;
  const gameDurationMs = GAME_DURATION_MINUTES * 60_000;

  const openTx = new Transaction();
  openTx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::open_registration`,
    arguments: [
      openTx.object(ADMIN_CAP_ID),
      openTx.object(GAME_STATE_ID),
      openTx.pure.u8(1),
      openTx.pure.u64(regEnd),
      openTx.pure.u64(gameStart),
      openTx.object("0x6"),
    ],
  });

  console.log("Opening Solo Race registration now.");
  console.log(`Registration closes: ${formatCst(regEnd)}`);
  console.log(`Game starts: ${formatCst(gameStart)}`);
  const openResult = await signAndExecute(client, admin, openTx);
  console.log(`Registration opened. Digest: ${openResult.digest}`);

  const waitMs = Math.max(0, gameStart - Date.now());
  console.log(`Waiting ${waitMs} ms until game start...`);
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  const state = await client.getObject({
    id: GAME_STATE_ID,
    options: { showContent: true },
  });
  if (!state.data?.content || state.data.content.dataType !== "moveObject") {
    throw new Error("Could not fetch GameState content");
  }

  const fields = (state.data.content as any).fields;
  const requiredCount = Number(fields.required_singu_count || 0);
  const pool = Array.isArray(fields.gate_pool) ? fields.gate_pool : [];
  const selected: number[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < pool.length && selected.length < requiredCount; i += 1) {
    const gate = pool[i]?.fields ?? pool[i];
    const gateId = String(gate?.gate_id || "");
    if (!gateId || gateId === "0x0" || seen.has(gateId)) {
      continue;
    }
    seen.add(gateId);
    selected.push(i);
  }

  if (selected.length < requiredCount) {
    throw new Error(`Need ${requiredCount} unique gates, found ${selected.length}`);
  }

  const startTx = new Transaction();
  startTx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::start_hunt_with_selection`,
    arguments: [
      startTx.object(ADMIN_CAP_ID),
      startTx.object(GAME_STATE_ID),
      startTx.pure.vector("u64", selected),
      startTx.pure.u8(1),
      startTx.pure.u64(gameDurationMs),
      startTx.object("0x6"),
    ],
  });

  console.log(`Starting Solo Race with pool indices: ${selected.join(", ")}`);
  const startResult = await signAndExecute(client, admin, startTx);
  console.log(`Solo Race started. Digest: ${startResult.digest}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
