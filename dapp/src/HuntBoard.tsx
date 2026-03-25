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
const RPC_URL =
  import.meta.env.VITE_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";
const TICKET_API_URL = import.meta.env.VITE_TICKET_API_URL || "/api/gates";
const CACHE_VERSION = import.meta.env.VITE_CACHE_VERSION || "2";

const MODE_LABELS: Record<number, string> = {
  1: "SOLO RACE",
  2: "TEAM RACE",
  3: "DEEP DECRYPT",
  4: "LARGE ARENA",
  5: "OBSTACLE RUN",
};

type BallGate = {
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
  ball_gates: BallGate[];
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

type OwnedDragonBall = {
  objectId: string;
  epoch: number;
  starIndex: number;
  gateId: string;
  gateName: string;
  collector: string;
  delivered: boolean;
  deliveredAt: number;
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

/** Slug → assembly ID mapping (matches Cloudflare proxy TRUSTED_GATE_MAP). */
const SLUG_ASSEMBLY_MAP: Record<string, string> = {
  "singu-01": "0x2222222222222222222222222222222222222222222222222222222222222222",
  "singu-02": "0x3333333333333333333333333333333333333333333333333333333333333333",
  "home": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "bulletin": "0x1111111111111111111111111111111111111111111111111111111111111111",
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

/** Mode intro modal content for all 5 modes. */
const MODE_INTRO: Record<number, { title: string; assembly: string; steps: string[] }> = {
  1: {
    title: "SOLO RACE",
    assembly: "Mini Gate",
    steps: [
      "1. REGISTER — 報名參加本場 Hunt",
      "2. LAUNCH — Hunt 啟動，龍珠散落在各 Mini Gate 據點",
      "3. FLY — 飛往 HuntBoard 上標示的 Mini Gate 座標",
      "4. CLAIM — 到達 Mini Gate 後領取龍珠（先到先得）",
      "5. COLLECT — 收集指定數量的龍珠",
      "6. RETURN — 帶回起點交付所有龍珠",
      "7. WIN — 最快完成的前 5% 玩家獲得 Achievement NFT",
    ],
  },
  2: {
    title: "TEAM RACE",
    assembly: "Mini Gate",
    steps: [
      "1. REGISTER — 報名（3 人一組，報名截止後自動分隊）",
      "2. TRIM — 截止後若總報名數無法整除 3，最後幾位自動取消資格",
      "3. SHUFFLE — 系統隨機將成功報名玩家分成 3 人一組",
      "4. REVEAL — 遊戲開始時於佈告欄公布隊友",
      "5. SPLIT — 隊友分頭前往不同 Mini Gate 收集龍珠",
      "6. RETURN — 全部據點完成後，任一隊員回起點完成結算",
      "7. WIN — 最先完成的前 5% 隊伍獲得 Singu Hunt award - Team Race",
    ],
  },
  3: {
    title: "DEEP DECRYPT",
    assembly: "SSU",
    steps: [
      "1. REGISTER — 報名參加解密挑戰",
      "2. LAUNCH — Hunt 啟動，當日解密題目出現",
      "3. READ — 閱讀題目與官方參考連結找答案",
      "4. ANSWER — 在 SSU 上提交正確答案",
      "5. CLAIM — 答對後自動獲得鏈上簽名票據",
      "6. MINT — 用票據在鏈上領取 Achievement NFT",
      "7. WIN — 最快答對的前 5% 玩家得獎",
    ],
  },
  4: {
    title: "LARGE ARENA",
    assembly: "Heavy Gate",
    steps: [
      "1. REGISTER — 報名大型競技場",
      "2. ENTER — 透過 Heavy Gate 傳送進入競技區域",
      "3. HUNT — 在競技場內的多個 Heavy Gate 據點搶奪龍珠",
      "4. CLAIM — 每個據點的龍珠先到先得",
      "5. DELIVER — 穿越 Heavy Gate 回到起點交付",
      "6. SURVIVE — 注意其他玩家的攻擊與攔截",
      "7. WIN — 最快完成的前 5% 玩家獲得 Achievement NFT",
    ],
  },
  5: {
    title: "OBSTACLE RUN",
    assembly: "Mini Gate",
    steps: [
      "1. REGISTER — 報名障礙賽",
      "2. LAUNCH — Hunt 啟動，關卡路線公布",
      "3. GATE 1 — 穿越第一道 Mini Gate（需滿足通行條件）",
      "4. GATE 2+ — 依序穿越所有 Mini Gate 關卡",
      "5. CLAIM — 每道關卡通過後領取龍珠",
      "6. FINISH — 穿越最終 Mini Gate 回到起點",
      "7. WIN — 最快通關的前 5% 玩家獲得 Achievement NFT",
    ],
  },
};

function ModeIntroModal({
  mode,
  onClose,
}: {
  mode: number;
  onClose: () => void;
}) {
  const intro = MODE_INTRO[mode];
  if (!intro) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{intro.title}</h3>
        <div className="modal-assembly">
          Uses: {intro.assembly}
        </div>
        <div className="modal-steps">
          {intro.steps.map((step, i) => (
            <div key={i} className="modal-step">{step}</div>
          ))}
        </div>
        <button className="claim-btn" onClick={onClose}>
          GOT IT
        </button>
      </div>
    </div>
  );
}

function getGateSlugFromPath(): string | null {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "gates" || !parts[1]) {
    return null;
  }
  return parts[1];
}

function isHomeSlug(slug: string | null) {
  return slug === "home" || slug === "bulletin";
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

  const ballGates = (fields.ball_gates || []).map((raw: any) => {
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
    ball_gates: ballGates,
    epoch_winner: await fetchEpochWinner(Number(fields.current_epoch)),
  };
}

async function fetchOwnedDragonBalls(owner: string): Promise<OwnedDragonBall[]> {
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
            StructType: `${PACKAGE_ID}::singuhunt::DragonBall`,
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
        starIndex: Number(fields.star_index),
        gateId: normalizeAddress(fields.gate_id),
        gateName: decodeMoveString(fields.gate_name),
        collector: normalizeAddress(fields.collector),
        delivered: Boolean(fields.delivered),
        deliveredAt: Number(fields.delivered_at || 0),
      } satisfies OwnedDragonBall;
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
  const [ownedBalls, setOwnedBalls] = useState<OwnedDragonBall[]>([]);
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
        const [registration, teamState] = await Promise.all([
          fetchRegistrationState(Number(state.current_epoch), walletAddress),
          state.hunt_mode === 2
            ? fetchActiveTeamRaceState(
                Number(state.current_epoch),
                state.ball_gates.length,
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
  }, [walletAddress]);

  useEffect(() => {
    let cancelled = false;

    async function loadOwnedBalls() {
      if (!walletAddress || !isConnected) {
        setOwnedBalls([]);
        return;
      }

      setOwnedBallLoading(true);
      try {
        const balls = await fetchOwnedDragonBalls(walletAddress);
        if (!cancelled) {
          setOwnedBalls(balls);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setOwnedBalls([]);
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
  }, [isConnected, walletAddress, claimDigest, deliverDigest, gameState?.current_epoch]);

  const countdown = useCountdown(gameState?.hunt_end_time);
  const collectedCount =
    gameState?.ball_gates.filter((gate) => gate.ball_collected).length || 0;
  const deliveredCount =
    gameState?.ball_gates.filter((gate) => gate.ball_delivered).length || 0;
  const requiredSinguCount = Number(gameState?.required_singu_count || 0);
  const teamClaimedIndices = new Set(activeTeamState.claimedIndices);
  const activeIndex =
    gameState?.hunt_mode === 2
      ? gameState?.ball_gates.findIndex((gate) => gate.gate_id === assemblyId) ?? -1
      : gameState?.ball_gates.findIndex(
            (gate) => gate.gate_id === assemblyId && !gate.ball_collected,
          ) ?? -1;
  const activeGate = activeIndex >= 0 ? gameState?.ball_gates[activeIndex] : null;
  const matchedGateIndex =
    gameState?.ball_gates.findIndex((gate) => gate.gate_id === assemblyId) ?? -1;
  const matchedGate = matchedGateIndex >= 0 ? gameState?.ball_gates[matchedGateIndex] : null;
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
  const deliverableBalls = ownedBalls
    .filter(
      (ball) =>
        ball.epoch === currentEpoch &&
        !ball.delivered &&
        normalizeAddress(ball.collector) === normalizedWallet,
    )
    .sort((a, b) => a.starIndex - b.starIndex);
  const completableBalls = ownedBalls
    .filter(
      (ball) =>
        ball.epoch === currentEpoch &&
        ball.delivered &&
        normalizeAddress(ball.collector) === normalizedWallet,
    )
    .sort((a, b) => a.starIndex - b.starIndex);
  const canComplete =
    requiredSinguCount > 0 &&
    completableBalls.length >= requiredSinguCount &&
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
      setTicketError("Missing gate slug in URL. Expected /gates/<slug>?v=2");
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
      setDeliverError("Missing home gate slug in URL. Expected /gates/home?v=2");
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
    if (!isConnected || !gameState) {
      setRegisterError("Connect wallet first");
      return;
    }

    setRegisterLoading(true);
    setRegisterError(null);
    setRegisterDigest(null);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::singuhunt::register_for_hunt`,
        arguments: [tx.object(GAME_STATE_ID), tx.object("0x6")],
      });

      const result = (await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      })) as any;

      setRegisterDigest(result.digest ?? result?.Transaction?.digest ?? null);
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
        target: `${PACKAGE_ID}::singuhunt::collect_ball`,
        arguments: [
          tx.object(GAME_STATE_ID),
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
        setOwnedBalls(await fetchOwnedDragonBalls(walletAddress));
      }
    } catch (err: any) {
      setClaimError(err.message || String(err));
    } finally {
      setClaimLoading(false);
    }
  }

  async function deliverBall(ball: OwnedDragonBall) {
    if (!homeRoute || !homeGateMatched || !isConnected) {
      setDeliverError("Open the home gate route from the configured start/end gate");
      return;
    }

    setDeliverLoadingIndex(ball.starIndex);
    setDeliverError(null);
    setDeliverDigest(null);
    try {
      const deliverTicket = await requestDeliverTicket(ball.starIndex);
      if (!deliverTicket) {
        return;
      }

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::singuhunt::deliver_ball`,
        arguments: [
          tx.object(GAME_STATE_ID),
          tx.object(ball.objectId),
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
        setOwnedBalls(await fetchOwnedDragonBalls(walletAddress));
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

    setCompleteLoading(true);
    setCompleteError(null);
    setCompleteDigest(null);
    try {
      const tx = new Transaction();
      const ballArgs = completableBalls
        .slice(0, requiredSinguCount)
        .map((ball) => tx.object(ball.objectId));
      tx.moveCall({
        target: `${PACKAGE_ID}::singuhunt::claim_achievement`,
        arguments: [
          tx.object(GAME_STATE_ID),
          tx.makeMoveVec({ elements: ballArgs }),
          tx.object("0x6"),
        ],
      });

      const result = (await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      })) as any;

      setCompleteDigest(result.digest ?? result?.Transaction?.digest ?? null);
      await refetchGameState();
      if (walletAddress) {
        setOwnedBalls(await fetchOwnedDragonBalls(walletAddress));
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
    setDecryptClaimLoading(true);
    setDecryptClaimError(null);
    setDecryptClaimDigest(null);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::singuhunt::claim_decrypt_achievement`,
        arguments: [
          tx.object(GAME_STATE_ID),
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
        <ModeIntroModal
          mode={showModeIntro}
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

      <div className="status-bar">
        <div className="status-item">
          <div className="status-label">Session</div>
          <div className="status-value">{gameState.current_epoch} / {gameState.total_hunts}</div>
        </div>
        <div className="status-item">
          <div className="status-label">Status</div>
          <div className="status-value">
            {gameState.hunt_active ? "ACTIVE" : "INACTIVE"}
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">Mode</div>
          <div className="status-value mode-value">
            <span>{MODE_LABELS[gameState.hunt_mode] || "SOLO RACE"}</span>
            {MODE_INTRO[gameState.hunt_mode] && (
              <button
                className="mode-info-btn"
                onClick={() => setShowModeIntro(gameState.hunt_mode)}
                title="How to play"
              >
                ?
              </button>
            )}
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
            {collectedCount} / {requiredSinguCount || gameState.ball_gates.length}
          </div>
        </div>
        <div className="status-item">
          <div className="status-label">Delivered</div>
          <div className="status-value">
            {deliveredCount} / {requiredSinguCount || gameState.ball_gates.length}
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
        {(() => {
          const startMeta = getGateMetadata(gameState.start_gate);
          const endMeta = getGateMetadata(gameState.end_gate);
          return (
            <>
              <div className="context-row">
                Start Gate: {gameState.start_gate_name || gameState.start_gate}
                {startMeta && ` — ${startMeta.solarSystem} [${startMeta.coordinates.x}, ${startMeta.coordinates.y}, ${startMeta.coordinates.z}]`}
              </div>
              <div className="context-row">
                End Gate: {gameState.end_gate_name || gameState.end_gate}
                {endMeta && ` — ${endMeta.solarSystem} [${endMeta.coordinates.x}, ${endMeta.coordinates.y}, ${endMeta.coordinates.z}]`}
              </div>
            </>
          );
        })()}
      </div>

      {homeRoute && (
        <div className="bulletin-board">
          <h3>HOME GATE BULLETIN</h3>
          <div className="context-row">
            Route: /gates/{gateSlug}?v={CACHE_VERSION}
          </div>
          <div className="context-row">
            Home Gate Verified: {homeGateMatched ? "YES" : "NO"}
          </div>
          <div className="context-row">
            Claimed: {collectedCount} / {requiredSinguCount || gameState.ball_gates.length}
          </div>
          <div className="context-row">
            Delivered: {deliveredCount} / {requiredSinguCount || gameState.ball_gates.length}
          </div>
          <div className={`home-status ${allDelivered ? "complete" : "open"}`}>
            {allDelivered
              ? "ALL REQUIRED SINGU HAVE BEEN RETURNED TO HOME GATE"
              : "HUNT STILL IN PROGRESS"}
          </div>
          <p className="hint">
            This page is the start/end bulletin view. It lists today&apos;s open
            Singu gates and current on-chain delivery progress.
          </p>

          {registrationState?.mode === 2 && (
            <div className="delivery-panel">
              <h3>TEAM RACE REGISTRATION</h3>
              <div className="context-row">
                Registration: {registrationState.isOpen ? "OPEN" : "CLOSED"}
              </div>
              <div className="context-row">
                Total registered: {registrationState.regCount}
              </div>
              {!registrationState.isOpen && (
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
              {registrationState.assignment && !registrationState.assignment.active && (
                <p className="error-text">
                  Registration failed for this round. Your slot was trimmed because the final count could not form a full 3-player team.
                </p>
              )}
              {registrationState.assignment?.active && registrationState.assignment.reveal_at > Date.now() && (
                <p className="hint">
                  Team assignment is locked. Teammates will be revealed when the match starts.
                </p>
              )}
              {registrationState.roster && (
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
              ) : registrationState.isOpen ? (
                <button
                  className="claim-btn"
                  onClick={registerForHunt}
                  disabled={registerLoading || registrationState.playerRegistered}
                >
                  {registrationState.playerRegistered
                    ? "REGISTERED"
                    : registerLoading
                      ? "REGISTERING..."
                      : "REGISTER FOR TEAM RACE"}
                </button>
              ) : null}
              {registerError && <p className="error-text">{registerError}</p>}
              {registerDigest && (
                <div className="ticket-card">
                  <div className="status-label">Registration Submitted</div>
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
                      Singu #{ball.starIndex + 1} from {ball.gateName || ball.gateId}
                    </div>
                    <div className="context-row">Object: {ball.objectId}</div>
                  </div>
                  <button
                    className="collect-btn"
                    onClick={() => void deliverBall(ball)}
                    disabled={deliverLoadingIndex === ball.starIndex}
                  >
                    {deliverLoadingIndex === ball.starIndex ? "DELIVERING..." : "DELIVER"}
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
            {gameState.ball_gates.map((gate, index) => {
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
          Gate Route: {gateSlug ? `/gates/${gateSlug}?v=${CACHE_VERSION}` : "Missing"}
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
            URL must be a versioned gate route like `/gates/seven-henna?v=2`.
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
      {gameState.hunt_mode === 3 && gameState.hunt_active && (
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
          {gameState.ball_gates.map((gate, index) => {
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
