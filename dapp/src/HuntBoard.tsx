import { useEffect, useState } from "react";
import { useConnection, useSmartObject } from "@evefrontier/dapp-kit";
import { useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";

const GAME_STATE_ID =
  import.meta.env.VITE_GAME_STATE_ID ||
  "0x3164b8a46471bc82f9e781391540802431de8e6000b4bb68a7ada6bbe07dd833";
const PACKAGE_ID =
  import.meta.env.VITE_SINGUHUNT_PACKAGE_ID ||
  "0xbce47d3e624f2478bdd77a114931b1af541929032da3db01cb6b6d4378aba1ab";
const EVE_COIN_TYPE =
  import.meta.env.VITE_EVE_COIN_TYPE ||
  "0xf0446b93345c1118f21239d7ac58fb82d005219b2016e100f074e4d17162a465::EVE::EVE";
const SINGU_SHARD_TREASURY_ID = import.meta.env.VITE_SINGU_SHARD_TREASURY_ID || "";
const ACHIEVEMENT_TREASURY_ID = import.meta.env.VITE_ACHIEVEMENT_TREASURY_ID || "";
const SINGU_SHARD_TOKEN_TYPE = `0x2::token::Token<${PACKAGE_ID}::singu_shard_token::SINGU_SHARD_TOKEN>`;
const REGISTRATION_PASS_TYPE = `${PACKAGE_ID}::singuhunt::RegistrationPass`;
const RPC_URL =
  import.meta.env.VITE_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";
const TICKET_API_URL = import.meta.env.VITE_TICKET_API_URL || "/api/gates";
const CACHE_VERSION = import.meta.env.VITE_CACHE_VERSION || "2";
const EVE_DECIMALS = 9;

const MODE_LABELS: Record<number, string> = {
  1: "SOLO RACE",
  2: "TEAM RACE",
  3: "DEEP DECRYPT",
  4: "LARGE ARENA",
  5: "OBSTACLE RUN",
};

// Daily schedule in UTC+8 — used for "next session" display
const DAILY_SCHEDULE = [
  { mode: 1, label: "SOLO RACE",     regH: 8,  regM: 57, gameH: 9,  gameM: 0,  durationMin: 7 },
  { mode: 2, label: "TEAM RACE",     regH: 9,  regM: 57, gameH: 10, gameM: 0,  durationMin: 7 },
  { mode: 3, label: "DEEP DECRYPT",  regH: 10, regM: 57, gameH: 11, gameM: 0,  durationMin: 7 },
  { mode: 4, label: "LARGE ARENA",   regH: 12, regM: 57, gameH: 13, gameM: 0,  durationMin: 12 },
  { mode: 5, label: "OBSTACLE RUN",  regH: 14, regM: 27, gameH: 14, gameM: 30, durationMin: 12 },
];

function getNextSession(): { mode: number; label: string; regTime: Date; gameTime: Date; durationMin: number } | null {
  const now = new Date();
  // Convert now to UTC+8 for comparison
  const utc8Now = new Date(now.getTime() + 8 * 3600_000);
  const todayH = utc8Now.getUTCHours();
  const todayM = utc8Now.getUTCMinutes();
  const todayMinutes = todayH * 60 + todayM;

  for (const s of DAILY_SCHEDULE) {
    const gameEndMinutes = s.gameH * 60 + s.gameM + s.durationMin;
    if (todayMinutes < gameEndMinutes) {
      // This session hasn't ended yet — it's the next (or current) one
      const base = new Date(utc8Now);
      base.setUTCHours(s.regH, s.regM, 0, 0);
      const regTime = new Date(base.getTime() - 8 * 3600_000); // convert back to local
      base.setUTCHours(s.gameH, s.gameM, 0, 0);
      const gameTime = new Date(base.getTime() - 8 * 3600_000);
      return { mode: s.mode, label: s.label, regTime, gameTime, durationMin: s.durationMin };
    }
  }
  // All sessions today are done — next is tomorrow's first session
  const s = DAILY_SCHEDULE[0];
  const tomorrow = new Date(utc8Now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(s.regH, s.regM, 0, 0);
  const regTime = new Date(tomorrow.getTime() - 8 * 3600_000);
  tomorrow.setUTCHours(s.gameH, s.gameM, 0, 0);
  const gameTime = new Date(tomorrow.getTime() - 8 * 3600_000);
  return { mode: s.mode, label: s.label, regTime, gameTime, durationMin: s.durationMin };
}

function useNextSession(enabled: boolean) {
  const [next, setNext] = useState(() => enabled ? getNextSession() : null);
  useEffect(() => {
    if (!enabled) { setNext(null); return; }
    setNext(getNextSession());
    const id = setInterval(() => setNext(getNextSession()), 30_000);
    return () => clearInterval(id);
  }, [enabled]);
  return next;
}

function useCountdownTo(target: Date | null): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!target) { setText(""); return; }
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setText("NOW"); return; }
      const h = Math.floor(diff / 3600_000);
      const m = Math.floor((diff % 3600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setText(`${h > 0 ? `${h}h ` : ""}${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return text;
}

const MODE_REGISTRATION_FEE_EVE: Record<number, bigint> = {
  1: 1_000_000_000n,
  2: 1_000_000_000n,
  3: 1_000_000_000n,
  4: 1_000_000_000n,
  5: 1_000_000_000n,
};

type ShardGate = {
  gate_id: string;
  name: string;
  has_ball: boolean;
  ball_collected: boolean;
  collector: string;
  ball_delivered: boolean;
  deliverer: string;
};

type GameState = {
  current_epoch: string;
  hunt_active: boolean;
  hunt_mode: number;
  hunt_start_time: string;
  hunt_end_time: string;
  required_singu_count: string;
  total_hunts: string;
  total_achievements: string;
  start_gate: string;
  start_gate_name: string;
  end_gate: string;
  end_gate_name: string;
  ticket_signer: string;
  shard_gates: ShardGate[];
  epoch_winner: string | null; // address of winner, or null if no winner yet
};

type ClaimTicket = {
  playerAddress: string;
  epoch: string | number;
  ballIndex: string | number;
  assemblyId: string;
  signerAddress: string;
  expiresAtMs: string | number;
  nonce: string | number;
  signature: string;
};

type OwnedSinguShard = {
  objectId: string;
  epoch: number;
  shardIndex: number;
  gateId: string;
  gateName: string;
  collector: string;
  delivered: boolean;
  deliveredAt: number;
};

type OwnedSinguShardToken = {
  objectId: string;
};

type OwnedRegistrationPass = {
  objectId: string;
  epoch: number;
  mode: number;
  feePaidLux: number;
  issuedAt: number;
};

type TeamAssignmentState = {
  registration_index: number;
  team_id: number;
  slot: number;
  active: boolean;
  reveal_at: number;
};

type TeamRosterState = {
  team_id: number;
  member_1: string;
  member_2: string;
  member_3: string;
  completed_count: number;
  finished: boolean;
  winner_rank: number;
  finished_at: number;
  reveal_at: number;
};

type RegistrationState = {
  isOpen: boolean;
  mode: number | null;
  regEndTime: number | null;
  gameStartTime: number | null;
  nextEpoch: number;
  regCount: number;
  successfulRegCount: number;
  teamCount: number;
  teamFinalized: boolean;
  playerRegistered: boolean;
  playerPosition: number | null;
  assignment: TeamAssignmentState | null;
  roster: TeamRosterState | null;
};

function normalizeAddress(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.startsWith("0x") ? value.slice(2) : value;
  return `0x${trimmed.toLowerCase().padStart(64, "0")}`;
}

function decodeMoveString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return new TextDecoder().decode(Uint8Array.from(value));
  }
  return String(value ?? "");
}

function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function formatBalance(raw: string | number | bigint, decimals = EVE_DECIMALS): string {
  const digits = String(raw).replace("-", "");
  const padded = digits.padStart(decimals + 1, "0");
  const integer = padded.slice(0, padded.length - decimals) || "0";
  const fraction = padded.slice(padded.length - decimals, padded.length - decimals + 2);
  const prefix = String(raw).startsWith("-") ? "-" : "";
  return `${prefix}${Number(integer).toLocaleString()}.${fraction}`;
}

function decodeDynamicFieldValue<T>(payload: any): T | null {
  const value = payload?.result?.data?.content?.fields?.value;
  if (!value) return null;
  return (value.fields ?? value) as T;
}

async function fetchDynamicFieldValue<T>(
  keyType: string,
  value: Record<string, unknown>,
): Promise<T | null> {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getDynamicFieldObject",
        params: [GAME_STATE_ID, { type: keyType, value }],
      }),
    });
    return decodeDynamicFieldValue<T>(await response.json());
  } catch {
    return null;
  }
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || `${method} failed`);
  }
  return json.result as T;
}

/** Slug → assembly ID mapping (matches Cloudflare proxy TRUSTED_GATE_MAP). */
const SLUG_ASSEMBLY_MAP: Record<string, string> = {
  "singu-home": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "home": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "bulletin": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "singu-mini-001": "0x2222222222222222222222222222222222222222222222222222222222222222",
  "singu-mini-002": "0x3333333333333333333333333333333333333333333333333333333333333333",
  "singu-mini-003": "0x0000000000000000000000000000000000000000000000000000000000000000", // TBD
  "singu-ssu-001": "0x4444444444444444444444444444444444444444444444444444444444444444",
  "singu-ssu-002": "0x5555555555555555555555555555555555555555555555555555555555555555",
  "singu-ssu-003": "0x6666666666666666666666666666666666666666666666666666666666666666",
  "singu-heavy-001": "0x7777777777777777777777777777777777777777777777777777777777777777",
  "singu-heavy-002": "0x8888888888888888888888888888888888888888888888888888888888888888",
  "singu-heavy-003": "0x9999999999999999999999999999999999999999999999999999999999999999"
};

/**
 * Gate metadata: maps assembly ID → solar system name + coordinates.
 * Update this mapping when deploying new SSUs or Smart Gates.
 * Coordinates are in-game solar system coordinates (x, y, z).
 */
type GateMetadata = {
  solarSystem: string;
  coordinates: { x: number; y: number; z: number };
};

const GATE_METADATA: Record<string, GateMetadata> = {
  "0x1111111111111111111111111111111111111111111111111111111111111111": {
    solarSystem: "Configured System A",
    coordinates: { x: 0, y: 0, z: 0 },
  },
  "0x2222222222222222222222222222222222222222222222222222222222222222": {
    solarSystem: "Configured System B",
    coordinates: { x: 0, y: 0, z: 0 },
  },
  "0x3333333333333333333333333333333333333333333333333333333333333333": {
    solarSystem: "Configured System C",
    coordinates: { x: 0, y: 0, z: 0 },
  },
  // Add more gates here as you deploy them:
  // "0x...": { solarSystem: "System Name", coordinates: { x: 0, y: 0, z: 0 } },
};

function getGateMetadata(gateId: string): GateMetadata | null {
  return GATE_METADATA[normalizeAddress(gateId)] || GATE_METADATA[gateId] || null;
}

/** Assembly type label per mode */
const MODE_ASSEMBLY_TYPE: Record<number, string> = {
  1: "Mini Gate",
  2: "Mini Gate",
  3: "SSU",
  4: "Heavy Gate",
  5: "Mini Gate",
};

/** Mode intro modal content for all 5 modes — English only. */
const MODE_INTRO: Record<number, { title: string; assembly: string; steps: string[] }> = {
  1: {
    title: "SOLO RACE",
    assembly: "Mini Gate",
    steps: [
      "1. REGISTER — Sign up during the registration window",
      "2. LAUNCH — Hunt begins, Singu Shards scatter across Mini Gates",
      "3. FLY — Warp to the Mini Gate coordinates shown on the HuntBoard",
      "4. CLAIM — Collect a Singu Shard at the Mini Gate (first come, first served)",
      "5. COLLECT — Gather the required number of Singu Shards",
      "6. RETURN — Deliver all Singu Shards back to the Home gate",
      "7. WIN — Top 5% of finishers earn an Achievement NFT",
    ],
  },
  2: {
    title: "TEAM RACE",
    assembly: "Mini Gate",
    steps: [
      "1. REGISTER — Sign up (teams of 3, auto-assigned after registration closes)",
      "2. TRIM — If total registrations aren't divisible by 3, last few are dropped",
      "3. SHUFFLE — System randomly assigns players into squads of 3",
      "4. REVEAL — Teammates are revealed on the bulletin board at game start",
      "5. SPLIT — Squad members split up to claim Singu Shards at different Mini Gates",
      "6. RETURN — Once all checkpoints are cleared, any member returns to base to finalize",
      "7. WIN — Top 5% of teams earn the Team Race Achievement NFT",
    ],
  },
  3: {
    title: "DEEP DECRYPT",
    assembly: "SSU",
    steps: [
      "1. REGISTER — Sign up for the decryption challenge",
      "2. LAUNCH — Hunt begins and the daily puzzle question appears",
      "3. READ — Study the question and the official reference links for clues",
      "4. ANSWER — Submit your answer at the SSU terminal",
      "5. CLAIM — Correct answer automatically issues a signed on-chain ticket",
      "6. MINT — Use the ticket to claim your Achievement NFT on-chain",
      "7. WIN — Top 5% of correct responders earn the award",
    ],
  },
  4: {
    title: "LARGE ARENA",
    assembly: "Heavy Gate",
    steps: [
      "1. REGISTER — Sign up for the arena event",
      "2. ENTER — Warp through Heavy Gates into the arena zone",
      "3. HUNT — Race to multiple Heavy Gate nodes to seize Singu Shards",
      "4. CLAIM — Each node's Singu Shard is first come, first served",
      "5. DELIVER — Fly back through the Heavy Gate to return Singu Shards to base",
      "6. SURVIVE — Watch out for other players who may intercept you",
      "7. WIN — Top 5% of finishers earn an Achievement NFT",
    ],
  },
  5: {
    title: "OBSTACLE RUN",
    assembly: "Mini Gate",
    steps: [
      "1. REGISTER — Sign up for the obstacle course",
      "2. LAUNCH — Hunt begins and the course route is revealed",
      "3. GATE 1 — Clear the first Mini Gate checkpoint",
      "4. GATE 2+ — Proceed through each Mini Gate checkpoint in sequence",
      "5. CLAIM — Collect a Singu Shard after clearing each checkpoint",
      "6. FINISH — Pass through the final Mini Gate and return to the start",
      "7. WIN — Top 5% of finishers earn an Achievement NFT",
    ],
  },
};

const MODE_ORDER = [1, 2, 3, 4, 5] as const;

function GameGuideModal({
  initialMode,
  onClose,
}: {
  initialMode: number;
  onClose: () => void;
}) {
  const [activeMode, setActiveMode] = useState(initialMode);
  const intro = MODE_INTRO[activeMode];
  if (!intro) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>GAME GUIDE</h3>
        <div className="modal-tabs">
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              className={`modal-tab ${m === activeMode ? "active" : ""}`}
              onClick={() => setActiveMode(m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="modal-assembly">
          Assembly: {intro.assembly}
        </div>
        <div className="modal-steps">
          {intro.steps.map((step, i) => (
            <div key={i} className="modal-step">{step}</div>
          ))}
        </div>
        <button className="claim-btn modal-close" onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

function getGateSlugFromPath(): string | null {
  const parts = window.location.pathname.split("/").filter(Boolean);
  // New root-level route: /singu-xxx-NNN
  if (parts.length === 1 && parts[0].startsWith("singu-")) {
    return parts[0];
  }
  // Legacy route: /gates/slug
  if (parts[0] === "gates" && parts[1]) {
    return parts[1];
  }
  return null;
}

function isHomeSlug(slug: string | null) {
  return slug === "singu-home" || slug === "home" || slug === "bulletin";
}

async function fetchHuntMode(): Promise<number> {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getDynamicFieldObject",
        params: [
          GAME_STATE_ID,
          { type: `${PACKAGE_ID}::singuhunt::HuntModeKey`, value: { dummy_field: false } },
        ],
      }),
    });
    const json = await response.json();
    const value = json.result?.data?.content?.fields?.value;
    return value != null ? Number(value) : 1;
  } catch {
    return 1; // default: Solo Race
  }
}

async function fetchRegistrationState(
  currentEpoch: number,
  player?: string | null,
): Promise<RegistrationState> {
  const nextEpoch = currentEpoch + 1;
  const [isOpen, regEnd, regMode, gameStart] = await Promise.all([
    fetchDynamicFieldValue<boolean>(
      `${PACKAGE_ID}::singuhunt::RegPhaseKey`,
      { dummy_field: false },
    ),
    fetchDynamicFieldValue<string | number>(
      `${PACKAGE_ID}::singuhunt::RegEndTimeKey`,
      { dummy_field: false },
    ),
    fetchDynamicFieldValue<string | number>(
      `${PACKAGE_ID}::singuhunt::RegModeKey`,
      { dummy_field: false },
    ),
    fetchDynamicFieldValue<string | number>(
      `${PACKAGE_ID}::singuhunt::RegGameStartTimeKey`,
      { dummy_field: false },
    ),
  ]);

  const mode = regMode != null ? Number(regMode) : null;
  const base: RegistrationState = {
    isOpen: Boolean(isOpen),
    mode,
    regEndTime: regEnd != null ? Number(regEnd) : null,
    gameStartTime: gameStart != null ? Number(gameStart) : null,
    nextEpoch,
    regCount: 0,
    successfulRegCount: 0,
    teamCount: 0,
    teamFinalized: false,
    playerRegistered: false,
    playerPosition: null,
    assignment: null,
    roster: null,
  };

  if (mode == null) {
    return base;
  }

  const playerAddress = player ? normalizeAddress(player) : "";
  const [
    regCount,
    successfulRegCount,
    teamCount,
    teamFinalized,
    playerRegistered,
    playerPosition,
    assignment,
  ] = await Promise.all([
    fetchDynamicFieldValue<string | number>(
      `${PACKAGE_ID}::singuhunt::RegCountKey`,
      { epoch: String(nextEpoch) },
    ),
    fetchDynamicFieldValue<string | number>(
      `${PACKAGE_ID}::singuhunt::SuccessfulRegCountKey`,
      { epoch: String(nextEpoch) },
    ),
    fetchDynamicFieldValue<string | number>(
      `${PACKAGE_ID}::singuhunt::TeamCountKey`,
      { epoch: String(nextEpoch) },
    ),
    fetchDynamicFieldValue<boolean>(
      `${PACKAGE_ID}::singuhunt::TeamRegistrationFinalizedKey`,
      { epoch: String(nextEpoch) },
    ),
    playerAddress
      ? fetchDynamicFieldValue<boolean>(
          `${PACKAGE_ID}::singuhunt::RegPlayerKey`,
          { epoch: String(nextEpoch), player: playerAddress },
        )
      : Promise.resolve(null),
    playerAddress
      ? fetchDynamicFieldValue<string | number>(
          `${PACKAGE_ID}::singuhunt::RegPositionKey`,
          { epoch: String(nextEpoch), player: playerAddress },
        )
      : Promise.resolve(null),
    playerAddress && mode === 2
      ? fetchDynamicFieldValue<TeamAssignmentState>(
          `${PACKAGE_ID}::singuhunt::TeamAssignmentKey`,
          { epoch: String(nextEpoch), player: playerAddress },
        )
      : Promise.resolve(null),
  ]);

  let roster: TeamRosterState | null = null;
  if (
    mode === 2 &&
    assignment?.active &&
    assignment.team_id > 0 &&
    assignment.reveal_at <= Date.now()
  ) {
    roster = await fetchDynamicFieldValue<TeamRosterState>(
      `${PACKAGE_ID}::singuhunt::TeamRosterKey`,
      { epoch: String(nextEpoch), team_id: String(assignment.team_id) },
    );
  }

  return {
    ...base,
    regCount: regCount != null ? Number(regCount) : 0,
    successfulRegCount: successfulRegCount != null ? Number(successfulRegCount) : 0,
    teamCount: teamCount != null ? Number(teamCount) : 0,
    teamFinalized: Boolean(teamFinalized),
    playerRegistered: Boolean(playerRegistered),
    playerPosition: playerPosition != null ? Number(playerPosition) : null,
    assignment: assignment
      ? {
          ...assignment,
          registration_index: Number(assignment.registration_index),
          team_id: Number(assignment.team_id),
          slot: Number(assignment.slot),
          reveal_at: Number(assignment.reveal_at),
        }
      : null,
    roster: roster
      ? {
          ...roster,
          team_id: Number(roster.team_id),
          completed_count: Number(roster.completed_count),
          winner_rank: Number(roster.winner_rank),
          finished_at: Number(roster.finished_at),
          reveal_at: Number(roster.reveal_at),
          member_1: normalizeAddress(roster.member_1),
          member_2: normalizeAddress(roster.member_2),
          member_3: normalizeAddress(roster.member_3),
        }
      : null,
  };
}

async function fetchActiveTeamRaceState(
  epoch: number,
  ballGateCount: number,
  player?: string | null,
): Promise<{ assignment: TeamAssignmentState | null; roster: TeamRosterState | null; claimedIndices: number[] }> {
  const playerAddress = player ? normalizeAddress(player) : "";
  if (!playerAddress) {
    return { assignment: null, roster: null, claimedIndices: [] };
  }

  const assignment = await fetchDynamicFieldValue<TeamAssignmentState>(
    `${PACKAGE_ID}::singuhunt::TeamAssignmentKey`,
    { epoch: String(epoch), player: playerAddress },
  );
  if (!assignment?.active || Number(assignment.team_id) <= 0) {
    return { assignment: null, roster: null, claimedIndices: [] };
  }

  const normalizedAssignment = {
    ...assignment,
    registration_index: Number(assignment.registration_index),
    team_id: Number(assignment.team_id),
    slot: Number(assignment.slot),
    reveal_at: Number(assignment.reveal_at),
  };

  const roster = await fetchDynamicFieldValue<TeamRosterState>(
    `${PACKAGE_ID}::singuhunt::TeamRosterKey`,
    { epoch: String(epoch), team_id: String(normalizedAssignment.team_id) },
  );

  const results = await Promise.all(
    Array.from({ length: ballGateCount }, (_, index) =>
      fetchDynamicFieldValue<string>(
        `${PACKAGE_ID}::singuhunt::TeamGateClaimKey`,
        {
          epoch: String(epoch),
          team_id: String(normalizedAssignment.team_id),
          ball_index: String(index),
        },
      ),
    ),
  );

  return {
    assignment: normalizedAssignment,
    roster: roster
      ? {
          ...roster,
          team_id: Number(roster.team_id),
          completed_count: Number(roster.completed_count),
          winner_rank: Number(roster.winner_rank),
          finished_at: Number(roster.finished_at),
          reveal_at: Number(roster.reveal_at),
          member_1: normalizeAddress(roster.member_1),
          member_2: normalizeAddress(roster.member_2),
          member_3: normalizeAddress(roster.member_3),
        }
      : null,
    claimedIndices: results
      .map((value, index) => (value ? index : -1))
      .filter((index) => index >= 0),
  };
}

async function fetchEpochWinner(epoch: number): Promise<string | null> {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getDynamicFieldObject",
        params: [
          GAME_STATE_ID,
          { type: `${PACKAGE_ID}::singuhunt::EpochWinnerKey`, value: { epoch: String(epoch) } },
        ],
      }),
    });
    const json = await response.json();
    const value = json.result?.data?.content?.fields?.value;
    return value ? normalizeAddress(String(value)) : null;
  } catch {
    return null;
  }
}

async function fetchGameState(): Promise<GameState | null> {
  const [stateResponse, huntMode] = await Promise.all([
    fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sui_getObject",
        params: [GAME_STATE_ID, { showContent: true }],
      }),
    }),
    fetchHuntMode(),
  ]);

  const json = await stateResponse.json();
  const fields = json.result?.data?.content?.fields;
  if (!fields) return null;

  const shardGates = (fields.shard_gates || []).map((raw: any) => {
    const gate = raw.fields ?? raw;
    return {
      gate_id: normalizeAddress(gate.gate_id),
      name: decodeMoveString(gate.name),
      has_ball: Boolean(gate.has_ball),
      ball_collected: Boolean(gate.ball_collected),
      collector: normalizeAddress(gate.collector),
      ball_delivered: Boolean(gate.ball_delivered),
      deliverer: normalizeAddress(gate.deliverer),
    };
  });

  return {
    current_epoch: fields.current_epoch,
    hunt_active: fields.hunt_active,
    hunt_mode: huntMode,
    hunt_start_time: fields.hunt_start_time,
    hunt_end_time: fields.hunt_end_time,
    required_singu_count: fields.required_singu_count,
    total_hunts: fields.total_hunts,
    total_achievements: fields.total_achievements,
    start_gate: normalizeAddress(fields.start_gate),
    start_gate_name: decodeMoveString(fields.start_gate_name),
    end_gate: normalizeAddress(fields.end_gate),
    end_gate_name: decodeMoveString(fields.end_gate_name),
    ticket_signer: normalizeAddress(fields.ticket_signer),
    shard_gates: shardGates,
    epoch_winner: await fetchEpochWinner(Number(fields.current_epoch)),
  };
}

async function fetchOwnedSinguShards(owner: string): Promise<OwnedSinguShard[]> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "suix_getOwnedObjects",
      params: [
        normalizeAddress(owner),
        {
          filter: {
            StructType: `${PACKAGE_ID}::singuhunt::SinguShardRecord`,
          },
          options: {
            showContent: true,
          },
        },
      ],
    }),
  });

  const json = await response.json();
  const records = json.result?.data || [];
  return records
    .map((record: any) => {
      const data = record.data;
      const fields = data?.content?.fields;
      if (!data?.objectId || !fields) {
        return null;
      }
      return {
        objectId: data.objectId,
        epoch: Number(fields.epoch),
        shardIndex: Number(fields.shard_index),
        gateId: normalizeAddress(fields.gate_id),
        gateName: decodeMoveString(fields.gate_name),
        collector: normalizeAddress(fields.collector),
        delivered: Boolean(fields.delivered),
        deliveredAt: Number(fields.delivered_at || 0),
      } satisfies OwnedSinguShard;
    })
    .filter(Boolean);
}

async function fetchOwnedSinguShardTokens(owner: string): Promise<OwnedSinguShardToken[]> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "suix_getOwnedObjects",
      params: [
        normalizeAddress(owner),
        {
          filter: {
            StructType: SINGU_SHARD_TOKEN_TYPE,
          },
          options: {
            showType: true,
          },
        },
      ],
    }),
  });

  const json = await response.json();
  const records = json.result?.data || [];
  return records
    .map((record: any) => {
      const data = record.data;
      if (!data?.objectId) {
        return null;
      }
      return { objectId: data.objectId } satisfies OwnedSinguShardToken;
    })
    .filter(Boolean);
}

async function fetchOwnedRegistrationPasses(owner: string): Promise<OwnedRegistrationPass[]> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "suix_getOwnedObjects",
      params: [
        normalizeAddress(owner),
        {
          filter: {
            StructType: REGISTRATION_PASS_TYPE,
          },
          options: {
            showContent: true,
          },
        },
      ],
    }),
  });

  const json = await response.json();
  const records = json.result?.data || [];
  return records
    .map((record: any) => {
      const data = record.data;
      const fields = data?.content?.fields;
      if (!data?.objectId || !fields) {
        return null;
      }
      return {
        objectId: data.objectId,
        epoch: Number(fields.epoch),
        mode: Number(fields.mode),
        feePaidLux: Number(fields.fee_paid_lux),
        issuedAt: Number(fields.issued_at),
      } satisfies OwnedRegistrationPass;
    })
    .filter(Boolean);
}

function useCountdown(endTime?: string) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!endTime) return;

    const update = () => {
      const diff = Number(endTime) - Date.now();
      if (diff <= 0) {
        setRemaining("EXPIRED");
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemaining(
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  return remaining;
}

export function HuntBoard() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<ClaimTicket | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimDigest, setClaimDigest] = useState<string | null>(null);
  const [ownedBalls, setOwnedBalls] = useState<OwnedSinguShard[]>([]);
  const [ownedShardTokens, setOwnedShardTokens] = useState<OwnedSinguShardToken[]>([]);
  const [ownedRegistrationPasses, setOwnedRegistrationPasses] = useState<OwnedRegistrationPass[]>([]);
  const [ownedBallLoading, setOwnedBallLoading] = useState(false);
  const [deliverLoadingIndex, setDeliverLoadingIndex] = useState<number | null>(null);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [deliverDigest, setDeliverDigest] = useState<string | null>(null);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completeDigest, setCompleteDigest] = useState<string | null>(null);
  const [showModeIntro, setShowModeIntro] = useState<number | null>(null);

  // Deep Decrypt state
  const [decryptQuestion, setDecryptQuestion] = useState<{
    prompt: string;
    sourceUrl: string;
    epoch: string;
  } | null>(null);
  const [decryptAnswer, setDecryptAnswer] = useState("");
  const [decryptLoading, setDecryptLoading] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decryptTicket, setDecryptTicket] = useState<{
    expiresAtMs: string;
    nonce: string;
    signature: string;
  } | null>(null);
  const [decryptClaimLoading, setDecryptClaimLoading] = useState(false);
  const [decryptClaimError, setDecryptClaimError] = useState<string | null>(null);
  const [decryptClaimDigest, setDecryptClaimDigest] = useState<string | null>(null);
  const [decryptWinnerInfo, setDecryptWinnerInfo] = useState<{
    slots: number;
    count: number;
  } | null>(null);
  const [registrationState, setRegistrationState] = useState<RegistrationState | null>(null);
  const [activeTeamState, setActiveTeamState] = useState<{
    assignment: TeamAssignmentState | null;
    roster: TeamRosterState | null;
    claimedIndices: number[];
  }>({ assignment: null, roster: null, claimedIndices: [] });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerDigest, setRegisterDigest] = useState<string | null>(null);
  const [registerSuccessLabel, setRegisterSuccessLabel] = useState<string | null>(null);

  const { isConnected, walletAddress, handleConnect } = useConnection();
  const { assembly, loading: assemblyLoading } = useSmartObject();
  const dAppKit = useDAppKit();
  const gateSlug = getGateSlugFromPath();
  const homeRoute = isHomeSlug(gateSlug);
  const smartObjectId = normalizeAddress((assembly as any)?.item_id);
  const assemblyId = smartObjectId || (gateSlug ? normalizeAddress(SLUG_ASSEMBLY_MAP[gateSlug]) : "");
  const assemblyName = (assembly as any)?.name || (gateSlug ? `Gate ${gateSlug}` : "Unknown assembly");

  async function refetchGameState() {
    try {
      const state = await fetchGameState();
      setGameState(state);
      setError(null);
      if (state) {
        const shouldLoadRegistration = homeRoute;
        const shouldLoadTeamState = state.hunt_mode === 2 && Boolean(walletAddress);
        const [registration, teamState] = await Promise.all([
          shouldLoadRegistration
            ? fetchRegistrationState(Number(state.current_epoch), walletAddress)
            : Promise.resolve(null),
          shouldLoadTeamState
            ? fetchActiveTeamRaceState(
                Number(state.current_epoch),
                state.shard_gates.length,
                walletAddress,
              )
            : Promise.resolve({
                assignment: null,
                roster: null,
                claimedIndices: [],
              }),
        ]);
        setRegistrationState(registration);
        setActiveTeamState(teamState);
      } else {
        setRegistrationState(null);
        setActiveTeamState({
          assignment: null,
          roster: null,
          claimedIndices: [],
        });
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      await refetchGameState();
    };

    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [homeRoute, walletAddress]);

  useEffect(() => {
    let cancelled = false;

    async function loadOwnedBalls() {
      if (!walletAddress || !isConnected || !homeRoute) {
        setOwnedBalls([]);
        setOwnedShardTokens([]);
        setOwnedRegistrationPasses([]);
        return;
      }

      setOwnedBallLoading(true);
      try {
        const [balls, shardTokens, registrationPasses] = await Promise.all([
          fetchOwnedSinguShards(walletAddress),
          fetchOwnedSinguShardTokens(walletAddress),
          fetchOwnedRegistrationPasses(walletAddress),
        ]);
        if (!cancelled) {
          setOwnedBalls(balls);
          setOwnedShardTokens(shardTokens);
          setOwnedRegistrationPasses(registrationPasses);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setOwnedBalls([]);
          setOwnedShardTokens([]);
          setOwnedRegistrationPasses([]);
        }
      } finally {
        if (!cancelled) {
          setOwnedBallLoading(false);
        }
      }
    }

    void loadOwnedBalls();
    return () => {
      cancelled = true;
    };
  }, [homeRoute, isConnected, walletAddress, claimDigest, deliverDigest, gameState?.current_epoch]);

  const huntCountdown = useCountdown(gameState?.hunt_end_time);
  const registrationCountdown = useCountdown(
    registrationState?.regEndTime != null ? String(registrationState.regEndTime) : undefined,
  );
  const timeExpired = huntCountdown === "EXPIRED";
  const registrationOpen =
    Boolean(registrationState?.isOpen) &&
    (registrationState?.regEndTime == null || Number(registrationState.regEndTime) > Date.now());
  const effectivelyActive = !!gameState?.hunt_active && !timeExpired;
  const countdown = registrationOpen ? registrationCountdown || "REGISTRATION OPEN" : huntCountdown;
  const nextSession = useNextSession(!effectivelyActive && !registrationOpen);
  const nextRegCountdown = useCountdownTo(nextSession?.regTime ?? null);
  const collectedCount =
    gameState?.shard_gates.filter((gate) => gate.ball_collected).length || 0;
  const deliveredCount =
    gameState?.shard_gates.filter((gate) => gate.ball_delivered).length || 0;
  const requiredSinguCount = Number(gameState?.required_singu_count || 0);
  const teamClaimedIndices = new Set(activeTeamState.claimedIndices);
  const activeIndex =
    gameState?.hunt_mode === 2
      ? gameState?.shard_gates.findIndex((gate) => gate.gate_id === assemblyId) ?? -1
      : gameState?.shard_gates.findIndex(
            (gate) => gate.gate_id === assemblyId && !gate.ball_collected,
          ) ?? -1;
  const activeGate = activeIndex >= 0 ? gameState?.shard_gates[activeIndex] : null;
  const matchedGateIndex =
    gameState?.shard_gates.findIndex((gate) => gate.gate_id === assemblyId) ?? -1;
  const matchedGate = matchedGateIndex >= 0 ? gameState?.shard_gates[matchedGateIndex] : null;
  const homeGateMatched =
    assemblyId &&
    (!!gameState &&
      (assemblyId === gameState.start_gate || assemblyId === gameState.end_gate));
  const normalizedWallet = walletAddress ? normalizeAddress(walletAddress) : "";
  const allCollected =
    requiredSinguCount > 0 && collectedCount >= requiredSinguCount;
  const allDelivered =
    requiredSinguCount > 0 && deliveredCount >= requiredSinguCount;
  const currentEpoch = Number(gameState?.current_epoch || 0);
  const playerRegistrationPass =
    registrationState == null
      ? null
      : ownedRegistrationPasses.find(
          (pass) =>
            pass.epoch === registrationState.nextEpoch &&
            pass.mode === registrationState.mode,
        ) ?? null;
  const deliverableBalls = ownedBalls
    .filter(
      (ball) =>
        ball.epoch === currentEpoch &&
        !ball.delivered &&
        normalizeAddress(ball.collector) === normalizedWallet,
    )
    .sort((a, b) => a.shardIndex - b.shardIndex);
  const completableBalls = ownedBalls
    .filter(
      (ball) =>
        ball.epoch === currentEpoch &&
        ball.delivered &&
        normalizeAddress(ball.collector) === normalizedWallet,
    )
    .sort((a, b) => a.shardIndex - b.shardIndex);
  const canComplete =
    requiredSinguCount > 0 &&
    completableBalls.length >= requiredSinguCount &&
    ownedShardTokens.length >= requiredSinguCount &&
    !completeDigest;
  const activeTeamCompleted = activeIndex >= 0 && teamClaimedIndices.has(activeIndex);
  const activeTeamRosterVisible =
    !!activeTeamState.roster && activeTeamState.roster.reveal_at <= Date.now();
  const teamMembers = activeTeamState.roster
    ? [
        activeTeamState.roster.member_1,
        activeTeamState.roster.member_2,
        activeTeamState.roster.member_3,
      ]
    : [];
  const canFinishTeamRace =
    gameState?.hunt_mode === 2 &&
    isConnected &&
    homeRoute &&
    homeGateMatched &&
    !!activeTeamState.assignment?.active &&
    !!activeTeamState.roster &&
    activeTeamState.roster.completed_count >= requiredSinguCount &&
    !activeTeamState.roster.finished;

  async function requestTicket(): Promise<ClaimTicket | null> {
    if (!TICKET_API_URL) {
      setTicketError("Missing VITE_TICKET_API_URL");
      return null;
    }
    if (!gateSlug) {
      setTicketError("Missing gate slug in URL. Expected /singu-xxx-NNN?v=2");
      return null;
    }
    if (!walletAddress || !gameState || activeIndex < 0) {
      setTicketError("Wallet or active gate context is missing");
      return null;
    }

    setTicketLoading(true);
    setTicketError(null);

    try {
      const response = await fetch(`${TICKET_API_URL}/${gateSlug}/claim-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerAddress: walletAddress,
          ballIndex: activeIndex,
          epoch: gameState.current_epoch,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Ticket request failed");
      }

      const claimTicket = body as ClaimTicket;
      setTicket(claimTicket);
      return claimTicket;
    } catch (err: any) {
      setTicketError(err.message || String(err));
      return null;
    } finally {
      setTicketLoading(false);
    }
  }

  async function requestDeliverTicket(ballIndex: number): Promise<ClaimTicket | null> {
    if (!TICKET_API_URL) {
      setDeliverError("Missing VITE_TICKET_API_URL");
      return null;
    }
    if (!walletAddress || !gameState) {
      setDeliverError("Wallet or home gate context is missing");
      return null;
    }
    if (!gateSlug) {
      setDeliverError("Missing home gate slug in URL. Expected /singu-home?v=2");
      return null;
    }

    try {
      const response = await fetch(`${TICKET_API_URL}/${gateSlug}/deliver-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerAddress: walletAddress,
          ballIndex,
          epoch: gameState.current_epoch,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Deliver ticket request failed");
      }

      return body as ClaimTicket;
    } catch (err: any) {
      setDeliverError(err.message || String(err));
      return null;
    }
  }

  async function registerForHunt() {
    if (!isConnected || !gameState || !walletAddress) {
      setRegisterError("Connect wallet first");
      return;
    }
    if (!registrationState?.mode) {
      setRegisterError("Registration mode is unavailable");
      return;
    }
    if (EVE_COIN_TYPE.startsWith("0x0::")) {
      setRegisterError("Missing VITE_EVE_COIN_TYPE");
      return;
    }

    setRegisterLoading(true);
    setRegisterError(null);
    setRegisterDigest(null);
    setRegisterSuccessLabel(null);
    try {
      const tx = new Transaction();
      let successLabel = "Registration Activated";

      if (playerRegistrationPass) {
        tx.moveCall({
          target: `${PACKAGE_ID}::singuhunt::activate_registration`,
          arguments: [
            tx.object(GAME_STATE_ID),
            tx.object(playerRegistrationPass.objectId),
            tx.object("0x6"),
          ],
        });
      } else {
        const requiredFee = MODE_REGISTRATION_FEE_EVE[registrationState.mode];
        const coins = await rpcCall<{ data?: { coinObjectId: string; balance: string }[] }>(
          "suix_getCoins",
          [walletAddress, EVE_COIN_TYPE, null, 50],
        );
        const eveCoins = coins?.data ?? [];
        if (eveCoins.length === 0) {
          throw new Error("No EVE coins found in this wallet");
        }

        const available = eveCoins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
        if (available < requiredFee) {
          throw new Error(
            `Insufficient EVE. Need ${formatBalance(requiredFee)} EVE, wallet has ${formatBalance(available)} EVE`,
          );
        }

        const primaryCoin = tx.object(eveCoins[0].coinObjectId);
        if (eveCoins.length > 1) {
          tx.mergeCoins(
            primaryCoin,
            eveCoins.slice(1).map((coin) => tx.object(coin.coinObjectId)),
          );
        }

        const [feeCoin] = tx.splitCoins(primaryCoin, [requiredFee]);
        tx.moveCall({
          target: `${PACKAGE_ID}::singuhunt::buy_registration_pass_eve`,
          typeArguments: [EVE_COIN_TYPE],
          arguments: [
            tx.object(GAME_STATE_ID),
            feeCoin,
            tx.object("0x6"),
          ],
        });
        successLabel = "Registration Pass Purchased";
      }

      const result = (await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      })) as any;

      setRegisterDigest(result.digest ?? result?.Transaction?.digest ?? null);
      setRegisterSuccessLabel(successLabel);
      await refetchGameState();
    } catch (err: any) {
      setRegisterError(err.message || String(err));
    } finally {
      setRegisterLoading(false);
    }
  }

  async function claimCurrentGate() {
    if (!gameState || activeIndex < 0 || !isConnected || !gateSlug) {
      setClaimError("Missing connected wallet or active gate context");
      return;
    }
    if (!SINGU_SHARD_TREASURY_ID) {
      setClaimError("Missing VITE_SINGU_SHARD_TREASURY_ID");
      return;
    }

    setClaimLoading(true);
    setClaimError(null);
    setClaimDigest(null);
    try {
      const claimTicket = await requestTicket();
      if (!claimTicket) {
        return;
      }

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::singuhunt::collect_singu_shard`,
        arguments: [
          tx.object(GAME_STATE_ID),
          tx.object(SINGU_SHARD_TREASURY_ID),
          tx.pure.u64(activeIndex),
          tx.pure.address(claimTicket.assemblyId),
          tx.pure.u64(BigInt(claimTicket.expiresAtMs)),
          tx.pure.u64(BigInt(claimTicket.nonce)),
          tx.pure.vector("u8", Array.from(base64ToBytes(claimTicket.signature))),
          tx.object("0x6"),
        ],
      });

      const result = (await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      })) as any;

      setClaimDigest(result.digest ?? result?.Transaction?.digest ?? null);
      await refetchGameState();
      if (walletAddress) {
        const [balls, shardTokens] = await Promise.all([
          fetchOwnedSinguShards(walletAddress),
          fetchOwnedSinguShardTokens(walletAddress),
        ]);
        setOwnedBalls(balls);
        setOwnedShardTokens(shardTokens);
      }
    } catch (err: any) {
      setClaimError(err.message || String(err));
    } finally {
      setClaimLoading(false);
    }
  }

  async function deliverSinguShard(ball: OwnedSinguShard) {
    if (!homeRoute || !homeGateMatched || !isConnected) {
      setDeliverError("Open the home gate route from the configured start/end gate");
      return;
    }

    if (ownedShardTokens.length === 0) {
      setDeliverError("No SinguShard token found in this wallet");
      return;
    }

    setDeliverLoadingIndex(ball.shardIndex);
    setDeliverError(null);
    setDeliverDigest(null);
    try {
      const deliverTicket = await requestDeliverTicket(ball.shardIndex);
      if (!deliverTicket) {
        return;
      }

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::singuhunt::deliver_singu_shard`,
        arguments: [
          tx.object(GAME_STATE_ID),
          tx.object(ball.objectId),
          tx.object(ownedShardTokens[0].objectId),
          tx.pure.address(deliverTicket.assemblyId),
          tx.pure.u64(BigInt(deliverTicket.expiresAtMs)),
          tx.pure.u64(BigInt(deliverTicket.nonce)),
          tx.pure.vector("u8", Array.from(base64ToBytes(deliverTicket.signature))),
          tx.object("0x6"),
        ],
      });

      const result = (await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      })) as any;

      setDeliverDigest(result.digest ?? result?.Transaction?.digest ?? null);
      await refetchGameState();
      if (walletAddress) {
        const [balls, shardTokens] = await Promise.all([
          fetchOwnedSinguShards(walletAddress),
          fetchOwnedSinguShardTokens(walletAddress),
        ]);
        setOwnedBalls(balls);
        setOwnedShardTokens(shardTokens);
      }
    } catch (err: any) {
      setDeliverError(err.message || String(err));
    } finally {
      setDeliverLoadingIndex(null);
    }
  }

  async function completeHunt() {
    if (!isConnected || !gameState || !canComplete) {
      setCompleteError("Cannot complete: missing requirements");
      return;
    }

    if (!SINGU_SHARD_TREASURY_ID || !ACHIEVEMENT_TREASURY_ID) {
      setCompleteError("Missing treasury object IDs for shard or achievement");
      return;
    }

    setCompleteLoading(true);
    setCompleteError(null);
    setCompleteDigest(null);
    try {
      const tx = new Transaction();
      const shardRecordArgs = completableBalls
        .slice(0, requiredSinguCount)
        .map((ball) => tx.object(ball.objectId));
      const shardTokenArgs = ownedShardTokens
        .slice(0, requiredSinguCount)
        .map((token) => tx.object(token.objectId));
      tx.moveCall({
        target: `${PACKAGE_ID}::singuhunt::claim_achievement`,
        arguments: [
          tx.object(GAME_STATE_ID),
          tx.object(SINGU_SHARD_TREASURY_ID),
          tx.object(ACHIEVEMENT_TREASURY_ID),
          tx.makeMoveVec({ elements: shardRecordArgs }),
          tx.makeMoveVec({ elements: shardTokenArgs }),
          tx.object("0x6"),
        ],
      });

      const result = (await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      })) as any;

      setCompleteDigest(result.digest ?? result?.Transaction?.digest ?? null);
      await refetchGameState();
      if (walletAddress) {
        const [balls, shardTokens] = await Promise.all([
          fetchOwnedSinguShards(walletAddress),
          fetchOwnedSinguShardTokens(walletAddress),
        ]);
        setOwnedBalls(balls);
        setOwnedShardTokens(shardTokens);
      }
    } catch (err: any) {
      setCompleteError(err.message || String(err));
    } finally {
      setCompleteLoading(false);
    }
  }

  async function completeTeamRace() {
    if (!gameState || !canFinishTeamRace) {
      setCompleteError("Cannot complete team race yet");
      return;
    }
    if (!ACHIEVEMENT_TREASURY_ID) {
      setCompleteError("Missing VITE_ACHIEVEMENT_TREASURY_ID");
      return;
    }

    setCompleteLoading(true);
    setCompleteError(null);
    setCompleteDigest(null);
    try {
      const deliverTicket = await requestDeliverTicket(0);
      if (!deliverTicket) {
        return;
      }

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::singuhunt::claim_team_achievement`,
        arguments: [
          tx.object(GAME_STATE_ID),
          tx.object(ACHIEVEMENT_TREASURY_ID),
          tx.pure.address(deliverTicket.assemblyId),
          tx.pure.u64(BigInt(deliverTicket.expiresAtMs)),
          tx.pure.u64(BigInt(deliverTicket.nonce)),
          tx.pure.vector("u8", Array.from(base64ToBytes(deliverTicket.signature))),
          tx.object("0x6"),
        ],
      });

      const result = (await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      })) as any;

      setCompleteDigest(result.digest ?? result?.Transaction?.digest ?? null);
      await refetchGameState();
    } catch (err: any) {
      setCompleteError(err.message || String(err));
    } finally {
      setCompleteLoading(false);
    }
  }

  // ============ Deep Decrypt Functions ============

  async function fetchDecryptQuestion() {
    try {
      const response = await fetch("/api/deep-decrypt-question");
      const data = await response.json();
      if (data.ok) {
        setDecryptQuestion({
          prompt: data.question.prompt,
          sourceUrl: data.question.sourceUrl,
          epoch: data.epoch,
        });
      }
    } catch {
      // silent fail — question will show as unavailable
    }
  }

  async function fetchDecryptWinnerInfo(epoch: number) {
    const [slots, count] = await Promise.all([
      fetchDynamicFieldValue<number>(
        `${PACKAGE_ID}::singuhunt::WinnerSlotsKey`,
        { epoch: String(epoch) },
      ),
      fetchDynamicFieldValue<number>(
        `${PACKAGE_ID}::singuhunt::WinnerCountKey`,
        { epoch: String(epoch) },
      ),
    ]);
    if (slots != null) {
      setDecryptWinnerInfo({
        slots: Number(slots),
        count: count != null ? Number(count) : 0,
      });
    }
  }

  async function submitDecryptAnswer() {
    if (!walletAddress || !gameState) return;
    setDecryptLoading(true);
    setDecryptError(null);
    setDecryptTicket(null);
    try {
      const response = await fetch("/api/deep-decrypt-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerAddress: walletAddress,
          answer: decryptAnswer,
          epoch: gameState.current_epoch,
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        setDecryptError(data.error || "Unknown error");
        return;
      }
      setDecryptTicket(data.ticket);
    } catch (err: any) {
      setDecryptError(err.message || String(err));
    } finally {
      setDecryptLoading(false);
    }
  }

  async function claimDecryptAchievement() {
    if (!decryptTicket || !gameState) return;
    if (!ACHIEVEMENT_TREASURY_ID) {
      setDecryptClaimError("Missing VITE_ACHIEVEMENT_TREASURY_ID");
      return;
    }
    setDecryptClaimLoading(true);
    setDecryptClaimError(null);
    setDecryptClaimDigest(null);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::singuhunt::claim_decrypt_achievement`,
        arguments: [
          tx.object(GAME_STATE_ID),
          tx.object(ACHIEVEMENT_TREASURY_ID),
          tx.pure.u64(BigInt(decryptTicket.expiresAtMs)),
          tx.pure.u64(BigInt(decryptTicket.nonce)),
          tx.pure.vector("u8", Array.from(base64ToBytes(decryptTicket.signature))),
          tx.object("0x6"),
        ],
      });
      const result = (await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      })) as any;
      setDecryptClaimDigest(result.digest ?? result?.Transaction?.digest ?? null);
      await refetchGameState();
      if (gameState) {
        await fetchDecryptWinnerInfo(Number(gameState.current_epoch));
      }
    } catch (err: any) {
      setDecryptClaimError(err.message || String(err));
    } finally {
      setDecryptClaimLoading(false);
    }
  }

  // Fetch decrypt question & winner info when mode is Deep Decrypt
  useEffect(() => {
    if (gameState?.hunt_active && gameState.hunt_mode === 3) {
      void fetchDecryptQuestion();
      void fetchDecryptWinnerInfo(Number(gameState.current_epoch));
    }
  }, [gameState?.hunt_active, gameState?.hunt_mode, gameState?.current_epoch]);

  if (loading) {
    return <div className="loading">SCANNING GATES...</div>;
  }

  if (error) {
    return <div className="no-hunt">CONNECTION ERROR: {error}</div>;
  }

  if (!gameState) {
    return <div className="no-hunt">NO GAME STATE FOUND</div>;
  }

  return (
    <>
      {showModeIntro != null && (
        <GameGuideModal
          initialMode={showModeIntro}
          onClose={() => setShowModeIntro(null)}
        />
      )}

      {/* Quick-action panel: show CLAIM / CONNECT prominently at the top on gate pages */}
      {!homeRoute && (
        <div className="bulletin-board quick-action">
          {!isConnected ? (
            <>
              <h3>CONNECT WALLET TO CLAIM</h3>
              <button className="claim-btn" onClick={handleConnect}>
                CONNECT WALLET
              </button>
            </>
          ) : activeGate ? (
            <>
              <h3>{gameState.hunt_mode === 2 ? "COMPLETE TEAM CHECKPOINT" : "CLAIM SINGU HERE"}</h3>
              <div className="context-row">
                Gate: {activeGate.name || activeGate.gate_id}
              </div>
              {gameState.hunt_mode === 2 && activeTeamState.assignment?.active && (
                <div className="context-row">
                  Team progress: {activeTeamState.roster?.completed_count ?? 0} / {requiredSinguCount}
                </div>
              )}
              <button
                className="claim-btn"
                onClick={claimCurrentGate}
                disabled={ticketLoading || claimLoading || activeTeamCompleted}
                style={{ marginTop: 10 }}
              >
                {activeTeamCompleted
                  ? "TEAM ALREADY CLEARED THIS CHECKPOINT"
                  : claimLoading
                    ? "CLAIMING..."
                    : ticketLoading
                      ? "REQUESTING..."
                      : gameState.hunt_mode === 2
                        ? "MARK TEAM CHECKPOINT"
                        : "CLAIM SINGU HERE"}
              </button>
              {ticketError && <p className="error-text">{ticketError}</p>}
              {claimError && <p className="error-text">{claimError}</p>}
              {claimDigest && (
                <div className="ticket-card">
                  <div className="status-label">Claimed!</div>
                  <div className="context-row">Digest: {claimDigest}</div>
                </div>
              )}
            </>
          ) : gameState.hunt_mode === 2 && matchedGate && activeTeamState.assignment?.active ? (
            <div className="ticket-card">
              <div className="status-label">
                {teamClaimedIndices.has(matchedGateIndex)
                  ? "TEAM ALREADY CLEARED THIS CHECKPOINT"
                  : "CHECKPOINT OPEN FOR YOUR TEAM"}
              </div>
              <div className="context-row">
                Gate: {matchedGate.name || matchedGate.gate_id}
              </div>
            </div>
          ) : matchedGate?.ball_collected ? (
            <div className="ticket-card">
              <div className="status-label">SINGU ALREADY CLAIMED</div>
              <div className="context-row">
                Gate: {matchedGate.name || matchedGate.gate_id}
              </div>
              <div className="context-row">
                Claimed by: {matchedGate.collector}
              </div>
              {matchedGate.ball_delivered && (
                <div className="context-row">Delivered by: {matchedGate.deliverer}</div>
              )}
            </div>
          ) : assemblyId ? (
            <p className="hint">
              This assembly is not one of today&apos;s open Singu gates.
            </p>
          ) : (
            <p className="hint">
              Loading assembly context...
            </p>
          )}
        </div>
      )}

      <div className="guide-row">
        <button
          className="header-guide-btn"
          onClick={() => setShowModeIntro(gameState.hunt_mode)}
        >
          GAME GUIDE
        </button>
      </div>

      <div className="status-bar">
        <div className="status-item">
          <div className="status-label">Session</div>
          <div className="status-value">{gameState.current_epoch} / {gameState.total_hunts}</div>
        </div>
        <div className="status-item">
          <div className="status-label">Status</div>
          <div className="status-value">
            {registrationOpen
              ? "REGISTRATION OPEN"
              : effectivelyActive
                ? "ACTIVE"
                : timeExpired
                  ? "EXPIRED"
                  : "INACTIVE"}
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">Mode</div>
          <div className="status-value">
            {MODE_LABELS[gameState.hunt_mode] || "SOLO RACE"}
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">Winner</div>
          <div className="status-value">
            {gameState.epoch_winner
              ? `${gameState.epoch_winner.slice(0, 6)}...${gameState.epoch_winner.slice(-4)}`
              : "—"}
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">Claimed</div>
          <div className="status-value">
            {collectedCount} / {requiredSinguCount || gameState.shard_gates.length}
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">Delivered</div>
          <div className="status-value">
            {deliveredCount} / {requiredSinguCount || gameState.shard_gates.length}
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">Ticket Signer</div>
          <div className="status-value">
            {gameState.ticket_signer === normalizeAddress("0x0")
              ? "UNSET"
              : "SET"}
          </div>
        </div>
      </div>

      <div className="bulletin-board">
        <h3>HUNT WINDOW</h3>
        <div className="timer">{countdown}</div>
      </div>

      {!effectivelyActive && !registrationOpen && nextSession && (
        <div className="bulletin-board next-session-panel">
          <h3>NEXT SESSION</h3>
          <div className="timer">{nextRegCountdown === "NOW" ? "REGISTRATION OPEN" : nextRegCountdown}</div>
          <div className="context-row">
            Mode: {nextSession.label}
          </div>
          <div className="context-row">
            Registration opens: {nextSession.regTime.toLocaleString()}
          </div>
          <div className="context-row">
            Game starts: {nextSession.gameTime.toLocaleString()}
          </div>
          <div className="context-row">
            Duration: {nextSession.durationMin} min
          </div>
        </div>
      )}

      {homeRoute && (
        <div className="bulletin-board">
          <h3>HOME GATE BULLETIN</h3>
          <div className="context-row">
            Route: /{gateSlug}?v={CACHE_VERSION}
          </div>
          <div className="context-row">
            Home Gate Verified: {homeGateMatched ? "YES" : "NO"}
          </div>
          <div className="context-row">
            Claimed: {collectedCount} / {requiredSinguCount || gameState.shard_gates.length}
          </div>
          <div className="context-row">
            Delivered: {deliveredCount} / {requiredSinguCount || gameState.shard_gates.length}
          </div>
          <div className={`home-status ${allDelivered ? "complete" : registrationOpen || effectivelyActive ? "open" : "expired"}`}>
            {allDelivered
              ? "ALL REQUIRED SINGU HAVE BEEN RETURNED TO HOME GATE"
              : registrationOpen
              ? "REGISTRATION OPEN — CONNECT WALLET TO BUY OR ACTIVATE YOUR PASS"
              : !effectivelyActive
              ? "HUNT EXPIRED — WAITING FOR NEXT SESSION"
              : "HUNT STILL IN PROGRESS"}
          </div>
          <p className="hint">
            This page is the start/end bulletin view. It lists today&apos;s open
            Singu gates and current on-chain delivery progress.
          </p>

          {registrationState?.mode != null && (
            <div className="delivery-panel">
              <h3>{MODE_LABELS[registrationState.mode] || "HUNT"} REGISTRATION</h3>
              <div className="context-row">
                Registration: {registrationState.isOpen ? "OPEN" : "CLOSED"}
              </div>
              <div className="context-row">
                Entry fee: {formatBalance(MODE_REGISTRATION_FEE_EVE[registrationState.mode])} EVE
              </div>
              <div className="context-row">
                Total registered: {registrationState.regCount}
              </div>
              {registrationState.mode === 2 && !registrationState.isOpen && (
                <>
                  <div className="context-row">
                    Successful registered: {registrationState.successfulRegCount}
                  </div>
                  <div className="context-row">
                    Formed teams: {registrationState.teamCount}
                  </div>
                </>
              )}
              {registrationState.regEndTime && (
                <div className="context-row">
                  Registration ends: {new Date(registrationState.regEndTime).toLocaleString()}
                </div>
              )}
              {registrationState.gameStartTime && (
                <div className="context-row">
                  Game starts: {new Date(registrationState.gameStartTime).toLocaleString()}
                </div>
              )}
              {registrationState.playerRegistered && registrationState.playerPosition != null && (
                <div className="context-row">
                  Your registration number: #{registrationState.playerPosition}
                </div>
              )}
              {playerRegistrationPass && !registrationState.playerRegistered && (
                <div className="ticket-card">
                  <div className="status-label">Registration Pass Ready</div>
                  <div className="context-row">Pass object: {playerRegistrationPass.objectId}</div>
                  <div className="context-row">Epoch: {playerRegistrationPass.epoch}</div>
                  <div className="context-row">
                    Fee paid: {formatBalance(playerRegistrationPass.feePaidLux)} EVE
                  </div>
                </div>
              )}
              {registrationState.mode === 2 &&
                registrationState.assignment &&
                !registrationState.assignment.active && (
                <p className="error-text">
                  Registration failed for this round. Your slot was trimmed because the final count could not form a full 3-player team.
                </p>
              )}
              {registrationState.mode === 2 &&
                registrationState.assignment?.active &&
                registrationState.assignment.reveal_at > Date.now() && (
                <p className="hint">
                  Team assignment is locked. Teammates will be revealed when the match starts.
                </p>
              )}
              {registrationState.mode === 2 && registrationState.roster && (
                <div className="ticket-card">
                  <div className="status-label">Your Squad</div>
                  <div className="context-row">{registrationState.roster.member_1}</div>
                  <div className="context-row">{registrationState.roster.member_2}</div>
                  <div className="context-row">{registrationState.roster.member_3}</div>
                </div>
              )}
              {!isConnected ? (
                <button className="claim-btn" onClick={handleConnect}>
                  CONNECT WALLET
                </button>
              ) : registrationState.isOpen && !registrationState.playerRegistered ? (
                <button
                  className="claim-btn"
                  onClick={registerForHunt}
                  disabled={registerLoading}
                >
                  {registerLoading
                    ? "SUBMITTING..."
                    : playerRegistrationPass
                      ? "ACTIVATE REGISTRATION PASS"
                      : "BUY REGISTRATION PASS"}
                </button>
              ) : registrationState.playerRegistered ? (
                <div className="ticket-card">
                  <div className="status-label">Registration Confirmed</div>
                  <div className="context-row">
                    Wallet: {normalizeAddress(walletAddress)}
                  </div>
                </div>
              ) : null}
              {isConnected && registrationState.isOpen && !registrationState.playerRegistered && !playerRegistrationPass && (
                <p className="hint">
                  Connect wallet, pay the mode fee, and receive a Registration Pass for this session.
                </p>
              )}
              {registerError && <p className="error-text">{registerError}</p>}
              {registerDigest && registerSuccessLabel && (
                <div className="ticket-card">
                  <div className="status-label">{registerSuccessLabel}</div>
                  <div className="context-row">Digest: {registerDigest}</div>
                </div>
              )}
            </div>
          )}

          {gameState.hunt_mode !== 2 && isConnected && homeGateMatched && (
            <div className="delivery-panel">
              <h3>DELIVER TO HOME GATE</h3>
              <div className="context-row">
                Eligible balls: {ownedBallLoading ? "Loading..." : deliverableBalls.length}
              </div>
              {deliverableBalls.length === 0 && !ownedBallLoading && (
                <p className="hint">
                  No undelivered Singu from the current epoch are in this wallet.
                </p>
              )}
              {deliverableBalls.map((ball) => (
                <div key={ball.objectId} className="delivery-card">
                  <div className="delivery-copy">
                    <div className="delivery-title">
                      Singu #{ball.shardIndex + 1} from {ball.gateName || ball.gateId}
                    </div>
                    <div className="context-row">Object: {ball.objectId}</div>
                  </div>
                  <button
                    className="collect-btn"
                    onClick={() => void deliverSinguShard(ball)}
                    disabled={deliverLoadingIndex === ball.shardIndex}
                  >
                    {deliverLoadingIndex === ball.shardIndex ? "DELIVERING..." : "DELIVER"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {gameState.hunt_mode !== 2 && isConnected && homeGateMatched && canComplete && (
            <div className="delivery-panel">
              <h3>COMPLETE HUNT</h3>
              <p className="hint">
                All required Singu have been delivered. Burn them to earn a
                soulbound Achievement NFT.
              </p>
              <button
                className="claim-btn"
                onClick={completeHunt}
                disabled={completeLoading}
              >
                {completeLoading ? "COMPLETING..." : "COMPLETE HUNT"}
              </button>
              {completeError && <p className="error-text">{completeError}</p>}
              {completeDigest && (
                <div className="ticket-card">
                  <div className="status-label">Achievement Earned!</div>
                  <div className="context-row">Digest: {completeDigest}</div>
                </div>
              )}
            </div>
          )}

          {gameState.hunt_mode === 2 && isConnected && homeGateMatched && (
            <div className="delivery-panel">
              <h3>TEAM RACE COMMAND BOARD</h3>
              <div className="context-row">
                Team progress: {activeTeamState.roster?.completed_count ?? 0} / {requiredSinguCount}
              </div>
              {activeTeamRosterVisible ? (
                <>
                  <div className="context-row">Teammate 1: {teamMembers[0]}</div>
                  <div className="context-row">Teammate 2: {teamMembers[1]}</div>
                  <div className="context-row">Teammate 3: {teamMembers[2]}</div>
                </>
              ) : activeTeamState.assignment?.active ? (
                <p className="hint">
                  Team roster will unlock when the match starts.
                </p>
              ) : null}
              {activeTeamState.assignment && !activeTeamState.assignment.active && (
                <p className="error-text">
                  You were trimmed from this Team Race round because the final roster could not form a complete 3-player team.
                </p>
              )}
              {activeTeamState.roster?.finished && (
                <div className="ticket-card">
                  <div className="status-label">Team Finished</div>
                  <div className="context-row">Winner Rank: #{activeTeamState.roster.winner_rank}</div>
                </div>
              )}
              {canFinishTeamRace && (
                <button
                  className="claim-btn"
                  onClick={completeTeamRace}
                  disabled={completeLoading}
                >
                  {completeLoading ? "FINALIZING..." : "RETURN TO BASE AND CLAIM TEAM AWARD"}
                </button>
              )}
              {completeError && <p className="error-text">{completeError}</p>}
              {completeDigest && (
                <div className="ticket-card">
                  <div className="status-label">Team Race Complete</div>
                  <div className="context-row">Digest: {completeDigest}</div>
                </div>
              )}
            </div>
          )}

          <div className="singularity-grid">
            {gameState.shard_gates.map((gate, index) => {
              const meta = getGateMetadata(gate.gate_id);
              const teamDone = teamClaimedIndices.has(index);
              return (
                <div
                  key={`${gate.gate_id}-${index}`}
                  className={`singularity-card ${
                    gameState.hunt_mode === 2 ? (teamDone ? "collected" : "") : gate.ball_collected ? "collected" : ""
                  }`}
                >
                  <div className="singularity-index">{index + 1}</div>
                  <div className="singularity-info">
                    <div className="singularity-coords">{gate.name || gate.gate_id}</div>
                    {meta && (
                      <>
                        <div className="singularity-system solar-system">{meta.solarSystem}</div>
                        <div className="singularity-system gate-coords">
                          [{meta.coordinates.x}, {meta.coordinates.y}, {meta.coordinates.z}]
                        </div>
                      </>
                    )}
                    <div className="singularity-system">{gate.gate_id}</div>
                    {gameState.hunt_mode === 2 ? teamDone ? (
                      <div className="singularity-system">
                        Cleared by your team
                      </div>
                    ) : null : gate.ball_delivered ? (
                      <div className="singularity-system">
                        Delivered by {gate.deliverer}
                      </div>
                    ) : gate.ball_collected ? (
                      <div className="singularity-system">
                        Claimed by {gate.collector}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={`singularity-status ${
                      gameState.hunt_mode === 2
                        ? teamDone
                          ? "delivered"
                          : "available"
                        : gate.ball_delivered
                          ? "delivered"
                          : gate.ball_collected
                            ? "taken"
                            : "available"
                    }`}
                  >
                    {gameState.hunt_mode === 2
                      ? teamDone
                        ? "TEAM DONE"
                        : "OPEN"
                      : gate.ball_delivered
                        ? "DELIVERED"
                        : gate.ball_collected
                          ? "CLAIMED"
                          : "OPEN"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bulletin-board">
        <h3>ASSEMBLY CONTEXT</h3>
        <div className="context-row">
          Wallet: {isConnected ? normalizeAddress(walletAddress) : "Disconnected"}
        </div>
        <div className="context-row">
          Assembly: {assemblyLoading ? "Loading..." : assemblyName}
        </div>
        <div className="context-row">
          Assembly ID: {assemblyId || "Unavailable"}
        </div>
        <div className="context-row">
          Gate Route: {gateSlug ? `/${gateSlug}?v=${CACHE_VERSION}` : "Missing"}
        </div>
        {!isConnected && (
          <button className="collect-btn" onClick={handleConnect}>
            CONNECT WALLET
          </button>
        )}
        {activeGate && !homeRoute && (
          <>
            <p className="hint">
              {gameState.hunt_mode === 2
                ? "Current assembly matches an active team checkpoint. Your squad only needs to clear each checkpoint once."
                : "Current assembly matches an active Singu gate. Claim will first request a short-lived ticket, then immediately send the Move call from this wallet."}
            </p>
            <button
              className="collect-btn"
              onClick={claimCurrentGate}
              disabled={ticketLoading || claimLoading || activeTeamCompleted}
            >
              {activeTeamCompleted
                ? "TEAM ALREADY CLEARED THIS CHECKPOINT"
                : claimLoading
                  ? "CLAIMING..."
                  : ticketLoading
                    ? "REQUESTING..."
                    : gameState.hunt_mode === 2
                      ? "MARK TEAM CHECKPOINT"
                      : "CLAIM SINGU HERE"}
            </button>
          </>
        )}
        {!activeGate &&
          assemblyId &&
          !homeRoute &&
          !(gameState.hunt_mode === 2
            ? matchedGate && teamClaimedIndices.has(matchedGateIndex)
            : matchedGate?.ball_collected) && (
          <p className="hint">
            This assembly is not one of today&apos;s open Singu gates.
          </p>
          )}
        {!assemblyId && (
          <p className="hint">
            Open this dApp from a mini gate or smart assembly so the backend can
            bind the request to a trusted assembly context.
          </p>
        )}
        {!gateSlug && (
          <p className="error-text">
            URL must be a versioned gate route like `/singu-home?v=2`.
          </p>
        )}
        {ticketError && <p className="error-text">{ticketError}</p>}
        {ticket && (
          <div className="ticket-card">
            <div className="status-label">Claim Ticket Ready</div>
            <div className="context-row">Player: {ticket.playerAddress}</div>
            <div className="context-row">Assembly: {ticket.assemblyId}</div>
            <div className="context-row">Ball Index: {String(ticket.ballIndex)}</div>
            <div className="context-row">Signer: {ticket.signerAddress}</div>
            <div className="context-row">
              Expires: {new Date(Number(ticket.expiresAtMs)).toISOString()}
            </div>
            <div className="context-row">Nonce: {String(ticket.nonce)}</div>
          </div>
        )}
        {claimError && <p className="error-text">{claimError}</p>}
        {claimDigest && (
          <div className="ticket-card">
            <div className="status-label">Claim Submitted</div>
            <div className="context-row">Digest: {claimDigest}</div>
          </div>
        )}
        {deliverError && <p className="error-text">{deliverError}</p>}
        {deliverDigest && (
          <div className="ticket-card">
            <div className="status-label">Delivery Submitted</div>
            <div className="context-row">Digest: {deliverDigest}</div>
          </div>
        )}
      </div>

      {/* Deep Decrypt Quiz Panel — shown on any page when mode is 3 */}
      {gameState.hunt_mode === 3 && effectivelyActive && (
        <div className="bulletin-board decrypt-panel">
          <h3>DEEP DECRYPT CHALLENGE</h3>
          {decryptWinnerInfo && (
            <div className="context-row">
              Winner Slots: {decryptWinnerInfo.count} / {decryptWinnerInfo.slots} filled
            </div>
          )}
          {decryptQuestion ? (
            <>
              <div className="decrypt-question">
                <p className="decrypt-prompt">{decryptQuestion.prompt}</p>
                <a
                  className="decrypt-source"
                  href={decryptQuestion.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Reference Source
                </a>
              </div>
              {decryptClaimDigest ? (
                <div className="ticket-card">
                  <div className="status-label">Achievement Earned!</div>
                  <div className="context-row">Digest: {decryptClaimDigest}</div>
                </div>
              ) : decryptTicket ? (
                <div className="decrypt-claim">
                  <div className="ticket-card">
                    <div className="status-label">CORRECT! Ticket Ready</div>
                  </div>
                  <button
                    className="claim-btn"
                    onClick={claimDecryptAchievement}
                    disabled={decryptClaimLoading}
                  >
                    {decryptClaimLoading ? "CLAIMING..." : "CLAIM ACHIEVEMENT NFT"}
                  </button>
                  {decryptClaimError && <p className="error-text">{decryptClaimError}</p>}
                </div>
              ) : isConnected ? (
                <div className="decrypt-form">
                  <input
                    className="decrypt-input"
                    type="text"
                    placeholder="Enter your answer..."
                    value={decryptAnswer}
                    onChange={(e) => setDecryptAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !decryptLoading) void submitDecryptAnswer();
                    }}
                  />
                  <button
                    className="claim-btn"
                    onClick={submitDecryptAnswer}
                    disabled={decryptLoading || !decryptAnswer.trim()}
                  >
                    {decryptLoading ? "CHECKING..." : "SUBMIT ANSWER"}
                  </button>
                  {decryptError && <p className="error-text">{decryptError}</p>}
                </div>
              ) : (
                <>
                  <p className="hint">Connect wallet to submit your answer.</p>
                  <button className="claim-btn" onClick={handleConnect}>
                    CONNECT WALLET
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="hint">Loading question...</p>
          )}
        </div>
      )}

      {/* Hide gate grid when mode is Deep Decrypt (no physical gates needed) */}
      {gameState.hunt_mode !== 3 && (
      <div className="bulletin-board">
        <h3>ACTIVE GATES</h3>
        <div className="singularity-grid">
          {gameState.shard_gates.map((gate, index) => {
            const meta = getGateMetadata(gate.gate_id);
            const teamDone = teamClaimedIndices.has(index);
            return (
              <div
                key={`${gate.gate_id}-${index}`}
                className={`singularity-card ${
                  gameState.hunt_mode === 2 ? (teamDone ? "collected" : "") : gate.ball_collected ? "collected" : ""
                }`}
              >
                <div className="singularity-index">#{index}</div>
                <div className="singularity-info">
                  <div className="singularity-system">{gate.name || gate.gate_id}</div>
                  {meta && (
                    <>
                      <div className="singularity-system solar-system">{meta.solarSystem}</div>
                      <div className="singularity-system gate-coords">
                        [{meta.coordinates.x}, {meta.coordinates.y}, {meta.coordinates.z}]
                      </div>
                    </>
                  )}
                  <div className="singularity-coords">{gate.gate_id}</div>
                </div>
                <span
                  className={`singularity-status ${
                    gameState.hunt_mode === 2
                      ? teamDone
                        ? "delivered"
                        : "available"
                      : gate.ball_delivered
                        ? "delivered"
                        : gate.ball_collected
                          ? "taken"
                          : "available"
                  }`}
                >
                  {gameState.hunt_mode === 2
                    ? teamDone
                      ? "TEAM DONE"
                      : "OPEN"
                    : gate.ball_delivered
                      ? "DELIVERED"
                      : gate.ball_collected
                        ? "TAKEN"
                        : "OPEN"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </>
  );
}
