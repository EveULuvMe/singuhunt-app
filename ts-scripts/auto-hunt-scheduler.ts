/// Auto Hunt Scheduler - Multi-Mode
///
/// Daily schedule (UTC+8):
///   Mode 1 Solo Race:     reg 08:57-08:59, play 09:00-09:07
///   Mode 2 Team Race:     reg 09:57-09:59, play 10:00-10:07
///   Mode 3 Deep Decrypt:  reg 10:57-10:59, play 11:00-11:07
///   Mode 4 Large Arena:   reg 12:57-12:59, play 13:00-13:12
///   Mode 5 Obstacle Run:  reg 14:27-14:29, play 14:30-14:42
///
/// Runs as a long-lived process. Deploy with pm2, systemd, or similar.
/// Usage: pnpm auto-hunt

import { Transaction } from "@mysten/sui/transactions";
import { randomInt } from "node:crypto";
import {
  getSuiClient,
  getAdminKeypair,
  SINGUHUNT_PACKAGE_ID,
  GAME_STATE_ID,
  ADMIN_CAP_ID,
  SINGU_SHARD_TREASURY_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

// ---------- types ----------

type ModeSchedule = {
  mode: number;
  label: string;
  regStartUTC8: { h: number; m: number };
  regEndUTC8: { h: number; m: number };
  gameStartUTC8: { h: number; m: number };
  gameEndUTC8: { h: number; m: number };
};

// ---------- schedule config (UTC+8) ----------

const UTC8_OFFSET_H = 8;
const BURN_BATCH_SIZE = 10;

const SCHEDULE: ModeSchedule[] = [
  {
    mode: 1,
    label: "Solo Race",
    regStartUTC8: { h: 8, m: 57 },
    regEndUTC8: { h: 8, m: 59 },
    gameStartUTC8: { h: 9, m: 0 },
    gameEndUTC8: { h: 9, m: 7 },
  },
  {
    mode: 2,
    label: "Team Race",
    regStartUTC8: { h: 9, m: 57 },
    regEndUTC8: { h: 9, m: 59 },
    gameStartUTC8: { h: 10, m: 0 },
    gameEndUTC8: { h: 10, m: 7 },
  },
  {
    mode: 3,
    label: "Deep Decrypt",
    regStartUTC8: { h: 10, m: 57 },
    regEndUTC8: { h: 10, m: 59 },
    gameStartUTC8: { h: 11, m: 0 },
    gameEndUTC8: { h: 11, m: 7 },
  },
  {
    mode: 4,
    label: "Large Arena",
    regStartUTC8: { h: 12, m: 57 },
    regEndUTC8: { h: 12, m: 59 },
    gameStartUTC8: { h: 13, m: 0 },
    gameEndUTC8: { h: 13, m: 12 },
  },
  {
    mode: 5,
    label: "Obstacle Run",
    regStartUTC8: { h: 14, m: 27 },
    regEndUTC8: { h: 14, m: 29 },
    gameStartUTC8: { h: 14, m: 30 },
    gameEndUTC8: { h: 14, m: 42 },
  },
];

// ---------- helpers ----------

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function toUTC(h: number, m: number): { h: number; m: number } {
  let utcH = h - UTC8_OFFSET_H;
  let utcM = m;
  if (utcH < 0) utcH += 24;
  return { h: utcH, m: utcM };
}

function msUntilNextUTC(targetH: number, targetM: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(targetH, targetM, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.getTime() - now.getTime();
}

function formatMs(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

function gameDurationMs(sched: ModeSchedule): number {
  const startMin = sched.gameStartUTC8.h * 60 + sched.gameStartUTC8.m;
  const endMin = sched.gameEndUTC8.h * 60 + sched.gameEndUTC8.m;
  return (endMin - startMin) * 60 * 1000;
}

// ---------- on-chain actions ----------

async function isHuntActive(): Promise<boolean> {
  const client = getSuiClient();
  const obj = await client.getObject({ id: GAME_STATE_ID, options: { showContent: true } });
  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") return false;
  return Boolean((obj.data.content as any).fields.hunt_active);
}

async function openRegistration(
  mode: number,
  regEndTimeMs: number,
  gameStartTimeMs: number,
): Promise<void> {
  const client = getSuiClient();
  const admin = getAdminKeypair();

  const tx = new Transaction();
  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::open_registration`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(GAME_STATE_ID),
      tx.pure.u8(mode),
      tx.pure.u64(regEndTimeMs),
      tx.pure.u64(gameStartTimeMs),
      tx.object("0x6"),
    ],
  });

  const result = await signAndExecute(client, admin, tx);
  log(`Registration opened for mode ${mode}. Digest: ${result.digest}`);
}

async function finalizeTeamRegistration(randomSeed: number): Promise<void> {
  const client = getSuiClient();
  const admin = getAdminKeypair();

  const tx = new Transaction();
  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::finalize_team_registration`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(GAME_STATE_ID),
      tx.pure.u64(randomSeed),
      tx.object("0x6"),
    ],
  });

  const result = await signAndExecute(client, admin, tx);
  log(`Team registration finalized. Digest: ${result.digest}`);
}

async function startHunt(mode: number, durationMs: number): Promise<void> {
  const client = getSuiClient();
  const admin = getAdminKeypair();

  const obj = await client.getObject({ id: GAME_STATE_ID, options: { showContent: true } });
  const fields = (obj.data!.content as any).fields;
  const requiredCount = Number(fields.required_singu_count || 0);
  const pool: any[] = Array.isArray(fields.gate_pool) ? fields.gate_pool : [];

  const validGates: { index: number; gateId: string }[] = [];
  const seen = new Set<string>();
  pool.forEach((raw: any, i: number) => {
    const gate = raw?.fields ?? raw;
    const id = gate?.gate_id;
    if (!id || id === "0x0" || seen.has(id)) return;
    seen.add(id);
    validGates.push({ index: i, gateId: id });
  });

  if (validGates.length < requiredCount) {
    throw new Error(`Need ${requiredCount} unique gates, found ${validGates.length}`);
  }

  // Fisher-Yates shuffle
  for (let i = validGates.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [validGates[i], validGates[j]] = [validGates[j], validGates[i]];
  }

  const selected = validGates.slice(0, requiredCount);
  log(`Selected gates: ${selected.map((g) => `pool[${g.index}]`).join(", ")}`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::start_hunt_with_selection`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(GAME_STATE_ID),
      tx.pure.vector("u64", selected.map((g) => g.index)),
      tx.pure.u8(mode),
      tx.pure.u64(durationMs),
      tx.object("0x6"),
    ],
  });

  const result = await signAndExecute(client, admin, tx);
  log(`Hunt started (mode ${mode}, duration ${durationMs / 60000}min). Digest: ${result.digest}`);
}

async function expireHunt(): Promise<void> {
  const client = getSuiClient();
  const admin = getAdminKeypair();

  const tx = new Transaction();
  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::expire_hunt`,
    arguments: [tx.object(ADMIN_CAP_ID), tx.object(GAME_STATE_ID)],
  });

  const result = await signAndExecute(client, admin, tx);
  log(`Hunt expired. Digest: ${result.digest}`);
}

async function burnAllExpiredBalls(): Promise<number> {
  const client = getSuiClient();
  const admin = getAdminKeypair();
  const adminAddress = admin.toSuiAddress();
  if (!SINGU_SHARD_TREASURY_ID) {
    throw new Error("Missing SINGU_SHARD_TREASURY_ID");
  }

  let cursor: string | null | undefined = null;
  let allBalls: { objectId: string; expiresAt: number }[] = [];

  do {
    const result = await client.getOwnedObjects({
      owner: adminAddress,
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
        });
      }
    }

    cursor = result.hasNextPage ? result.nextCursor : null;
  } while (cursor);

  const now = Date.now();
  const expired = allBalls.filter((b) => b.expiresAt < now);

  if (expired.length === 0) {
    log("No expired SinguShards to burn.");
    return 0;
  }

  log(`Found ${expired.length} expired SinguShard(s). Burning...`);

  for (let i = 0; i < expired.length; i += BURN_BATCH_SIZE) {
    const batch = expired.slice(i, i + BURN_BATCH_SIZE);
    const tx = new Transaction();
    const shardTokenObjects = await client.getOwnedObjects({
      owner: adminAddress,
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

    const result = await signAndExecute(client, admin, tx);
    log(`Burned batch ${Math.floor(i / BURN_BATCH_SIZE) + 1}: ${batch.length} balls. Digest: ${result.digest}`);
  }

  return expired.length;
}

// ---------- per-mode sequence ----------

async function runModeSession(sched: ModeSchedule): Promise<void> {
  log(`=== MODE ${sched.mode}: ${sched.label.toUpperCase()} ===`);

  // Step 1: Open registration
  const regEndUTC = toUTC(sched.regEndUTC8.h, sched.regEndUTC8.m);
  const regEndDate = new Date();
  regEndDate.setUTCHours(regEndUTC.h, regEndUTC.m, 0, 0);
  // If the calculated time is in the past (shouldn't happen in normal flow), use now + 1min
  if (regEndDate.getTime() <= Date.now()) {
    regEndDate.setTime(Date.now() + 60_000);
  }

  const gameStartUTC = toUTC(sched.gameStartUTC8.h, sched.gameStartUTC8.m);
  const gameStartDate = new Date(regEndDate);
  gameStartDate.setUTCHours(gameStartUTC.h, gameStartUTC.m, 0, 0);
  if (gameStartDate.getTime() <= regEndDate.getTime()) {
    gameStartDate.setUTCDate(gameStartDate.getUTCDate() + 1);
  }

  try {
    await openRegistration(sched.mode, regEndDate.getTime(), gameStartDate.getTime());
  } catch (err) {
    log(`ERROR opening registration: ${err}`);
    return;
  }

  // Step 2: Wait until registration ends, then finalize team grouping if needed
  const waitToRegEndMs = regEndDate.getTime() - Date.now();
  if (waitToRegEndMs > 0) {
    log(`Waiting ${formatMs(waitToRegEndMs)} until registration closes...`);
    await new Promise((resolve) => setTimeout(resolve, waitToRegEndMs));
  }

  if (sched.mode === 2) {
    try {
      await finalizeTeamRegistration(randomInt(2 ** 31));
    } catch (err) {
      log(`ERROR finalizing team registration: ${err}`);
      return;
    }
  }

  // Step 3: Wait until game start time
  const waitMs = gameStartDate.getTime() - Date.now();
  // Only wait if it's less than 15 minutes (sanity check)
  if (waitMs > 0 && waitMs < 15 * 60 * 1000) {
    log(`Waiting ${formatMs(waitMs)} until game start...`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // Step 4: Expire previous hunt if still active, then start new hunt
  if (await isHuntActive()) {
    log("Previous hunt still active, expiring...");
    await expireHunt();
  }

  const durationMs = gameDurationMs(sched);
  try {
    await startHunt(sched.mode, durationMs);
  } catch (err) {
    log(`ERROR starting hunt: ${err}`);
    return;
  }

  // Step 5: Wait until game end time, then expire + burn
  log(`Game running for ${durationMs / 60000} minutes...`);
  await new Promise((resolve) => setTimeout(resolve, durationMs));

  try {
    if (await isHuntActive()) {
      await expireHunt();
    }
    await burnAllExpiredBalls();
  } catch (err) {
    log(`ERROR during expire/burn: ${err}`);
  }

  log(`=== MODE ${sched.mode}: ${sched.label.toUpperCase()} COMPLETE ===\n`);
}

// ---------- daily scheduler ----------

function scheduleDailyAt(utcH: number, utcM: number, label: string, action: () => Promise<void>) {
  const schedule = () => {
    const delay = msUntilNextUTC(utcH, utcM);
    log(`Next ${label} in ${formatMs(delay)}`);

    setTimeout(async () => {
      try {
        await action();
      } catch (err) {
        log(`ERROR during ${label}: ${err}`);
      }
      schedule();
    }, delay);
  };

  schedule();
}

async function main() {
  console.log("=== SinguHunt Multi-Mode Auto Scheduler ===\n");
  console.log("Daily schedule (UTC+8):");

  for (const sched of SCHEDULE) {
    const regStart = `${String(sched.regStartUTC8.h).padStart(2, "0")}:${String(sched.regStartUTC8.m).padStart(2, "0")}`;
    const regEnd = `${String(sched.regEndUTC8.h).padStart(2, "0")}:${String(sched.regEndUTC8.m).padStart(2, "0")}`;
    const gameStart = `${String(sched.gameStartUTC8.h).padStart(2, "0")}:${String(sched.gameStartUTC8.m).padStart(2, "0")}`;
    const gameEnd = `${String(sched.gameEndUTC8.h).padStart(2, "0")}:${String(sched.gameEndUTC8.m).padStart(2, "0")}`;
    console.log(`  Mode ${sched.mode} ${sched.label.padEnd(14)} reg ${regStart}-${regEnd}  play ${gameStart}-${gameEnd}`);
  }
  console.log("");

  const active = await isHuntActive();
  log(`Current hunt state: ${active ? "ACTIVE" : "INACTIVE"}`);

  // Schedule each mode's registration open time as the trigger for the full session
  for (const sched of SCHEDULE) {
    const regStartUTC = toUTC(sched.regStartUTC8.h, sched.regStartUTC8.m);
    scheduleDailyAt(
      regStartUTC.h,
      regStartUTC.m,
      `Mode ${sched.mode} ${sched.label}`,
      () => runModeSession(sched),
    );
  }

  log("Scheduler running. Press Ctrl+C to stop.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
