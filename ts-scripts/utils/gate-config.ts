import fs from "node:fs";
import path from "node:path";

export type GateConfigEntry = {
  id: string;
  name: string;
};

export type GatePoolConfig = {
  requiredSinguCount: number;
  start: GateConfigEntry;
  end: GateConfigEntry;
  pool: GateConfigEntry[];
};

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), "config/gates.json");

function getConfigPath() {
  return process.env.GATE_CONFIG_PATH
    ? path.resolve(process.cwd(), process.env.GATE_CONFIG_PATH)
    : DEFAULT_CONFIG_PATH;
}

function assertGateEntry(value: unknown, label: string): GateConfigEntry {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid ${label}: expected object`);
  }

  const gate = value as Partial<GateConfigEntry>;
  if (!gate.id || !gate.name) {
    throw new Error(`Invalid ${label}: expected id and name`);
  }

  return {
    id: gate.id,
    name: gate.name,
  };
}

function validatePool(pool: GateConfigEntry[], requiredSinguCount: number) {
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error("Gate pool must contain at least one gate");
  }

  const uniqueIds = new Set(pool.map((gate) => gate.id.toLowerCase()));
  if (uniqueIds.size < requiredSinguCount) {
    throw new Error(
      `Gate pool must contain at least ${requiredSinguCount} unique gates`,
    );
  }
}

function loadFallbackConfig(): GatePoolConfig {
  const gateId = process.env.TRUSTED_ASSEMBLY_ID;
  if (!gateId) {
    throw new Error(
      "Missing config/gates.json and TRUSTED_ASSEMBLY_ID fallback is not set",
    );
  }

  return {
    requiredSinguCount: 2,
    start: { id: gateId, name: "Configured Start Gate" },
    end: { id: gateId, name: "Configured End Gate" },
    pool: [{ id: gateId, name: "Configured Gate" }],
  };
}

export function loadGateConfig(): GatePoolConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return loadFallbackConfig();
  }

  const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
    requiredSinguCount?: unknown;
    start?: unknown;
    end?: unknown;
    pool?: unknown;
  };

  const requiredSinguCount =
    typeof raw.requiredSinguCount === "number" ? raw.requiredSinguCount : 2;
  if (!Number.isInteger(requiredSinguCount) || requiredSinguCount <= 0) {
    throw new Error("requiredSinguCount must be a positive integer");
  }

  const start = assertGateEntry(raw.start, "start gate");
  const end = assertGateEntry(raw.end, "end gate");
  const pool = Array.isArray(raw.pool)
    ? raw.pool.map((entry, index) =>
        assertGateEntry(entry, `pool gate #${index}`),
      )
    : [];

  validatePool(pool, requiredSinguCount);

  return { requiredSinguCount, start, end, pool };
}

export function getGateConfigPath() {
  return getConfigPath();
}
