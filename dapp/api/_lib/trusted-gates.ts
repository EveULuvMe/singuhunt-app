import { createHmac, timingSafeEqual } from "node:crypto";

export type TrustedGate = {
  slug: string;
  assemblyId: string;
  tenant: string;
};

type HeaderValue = string | string[] | undefined;

function stripHexPrefix(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

export function normalizeAddress(value: string): string {
  const hex = stripHexPrefix(value).toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex)) {
    throw new Error(`Invalid address: ${value}`);
  }
  if (hex.length > 64) {
    throw new Error(`Address too long: ${value}`);
  }
  return `0x${hex.padStart(64, "0")}`;
}

function readHeaderValue(headers: Record<string, HeaderValue> | undefined, name: string) {
  if (!headers) {
    return null;
  }

  const raw = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return typeof raw === "string" ? raw : null;
}

function toBase64Url(bytes: Buffer) {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signContextMessage(payload: {
  gateSlug: string;
  assemblyId: string;
  tenant: string;
  timestampMs: number;
  secret: string;
}) {
  const message = [
    "SINGUHUNT_EF_CONTEXT_V1",
    payload.gateSlug,
    payload.assemblyId,
    payload.tenant,
    String(payload.timestampMs),
  ].join("\n");

  return toBase64Url(
    createHmac("sha256", payload.secret).update(message).digest(),
  );
}

function readGate(index: number): TrustedGate | null {
  const slug = process.env[`TRUSTED_GATE_${index}_SLUG`];
  const assemblyId = process.env[`TRUSTED_GATE_${index}_ASSEMBLY_ID`];
  const tenant =
    process.env[`TRUSTED_GATE_${index}_TENANT`] ||
    process.env.TRUSTED_TENANT ||
    "your-tenant";

  if (!slug || !assemblyId) {
    return null;
  }

  return {
    slug,
    assemblyId: normalizeAddress(assemblyId),
    tenant,
  };
}

export function getTrustedGates(): TrustedGate[] {
  const indexes = new Set<number>();
  for (const key of Object.keys(process.env)) {
    const match = key.match(/^TRUSTED_GATE_(\d+)_(SLUG|ASSEMBLY_ID|TENANT)$/);
    if (match) {
      indexes.add(Number(match[1]));
    }
  }

  const gates: TrustedGate[] = [];
  const orderedIndexes = [...indexes].sort((a, b) => a - b);
  for (const i of orderedIndexes) {
    const gate = readGate(i);
    if (gate) {
      gates.push(gate);
    }
  }
  return gates;
}

export function getTrustedGateBySlug(slug: string): TrustedGate | null {
  return getTrustedGates().find((gate) => gate.slug === slug) || null;
}

export function getTrustedGateByAssemblyId(assemblyId: string): TrustedGate | null {
  const normalized = normalizeAddress(assemblyId);
  return getTrustedGates().find((gate) => gate.assemblyId === normalized) || null;
}

export function normalizePlayerAddress(value: string): string {
  return normalizeAddress(value);
}

export function resolveTrustedGateFromHeaders(
  headers: Record<string, HeaderValue> | undefined,
  expectedSlug?: string | null,
) {
  const secret = process.env.EF_CONTEXT_SHARED_SECRET;
  if (!secret) {
    throw new Error("Missing EF_CONTEXT_SHARED_SECRET");
  }

  const assemblyId = readHeaderValue(headers, "x-ef-assembly-id");
  if (!assemblyId) {
    throw new Error("Missing trusted x-ef-assembly-id header");
  }

  const tenant = readHeaderValue(headers, "x-ef-tenant");
  if (!tenant) {
    throw new Error("Missing trusted x-ef-tenant header");
  }

  const contextTs = readHeaderValue(headers, "x-ef-context-ts");
  if (!contextTs || !/^\d+$/.test(contextTs)) {
    throw new Error("Missing valid x-ef-context-ts header");
  }

  const contextSig = readHeaderValue(headers, "x-ef-context-sig");
  if (!contextSig) {
    throw new Error("Missing trusted x-ef-context-sig header");
  }

  const gateSlug = expectedSlug || readHeaderValue(headers, "x-ef-gate-slug");
  if (!gateSlug) {
    throw new Error("Missing gate slug for signed context");
  }

  const normalizedAssemblyId = normalizeAddress(assemblyId);
  const timestampMs = Number(contextTs);
  const maxSkewMs = Number(process.env.EF_CONTEXT_MAX_SKEW_MS || "30000");
  if (!Number.isFinite(timestampMs)) {
    throw new Error("Invalid x-ef-context-ts value");
  }
  if (Math.abs(Date.now() - timestampMs) > maxSkewMs) {
    throw new Error("Signed context has expired");
  }

  const expectedSig = signContextMessage({
    gateSlug,
    assemblyId: normalizedAssemblyId,
    tenant,
    timestampMs,
    secret,
  });

  const actualBuffer = Buffer.from(contextSig);
  const expectedBuffer = Buffer.from(expectedSig);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid x-ef-context-sig");
  }

  const gate = getTrustedGateByAssemblyId(normalizedAssemblyId);
  if (!gate) {
    throw new Error("Assembly is not registered as a trusted gate");
  }
  if (gate.tenant !== tenant) {
    throw new Error("Trusted tenant does not match gate tenant");
  }
  if (gate.slug !== gateSlug) {
    throw new Error("Gate slug does not match trusted assembly context");
  }

  return gate;
}
