import { randomBytes } from "node:crypto";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  normalizePlayerAddress,
  resolveTrustedGateFromHeaders,
} from "../../_lib/trusted-gates.js";

type ClaimTicketRequest = {
  playerAddress?: string;
  ballIndex?: number;
  epoch?: string | number;
};

function addressToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value.slice(2), "hex"));
}

function u64ToLeBytes(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`u64 out of range: ${value}`);
  }

  const bytes = new Uint8Array(8);
  let current = value;
  for (let i = 0; i < 8; i += 1) {
    bytes[i] = Number(current & 0xffn);
    current >>= 8n;
  }
  return bytes;
}

function concatBytes(...chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function buildClaimTicketMessage(payload: {
  playerAddress: string;
  epoch: bigint;
  ballIndex: bigint;
  assemblyId: string;
  expiresAtMs: bigint;
  nonce: bigint;
}) {
  return concatBytes(
    new TextEncoder().encode("SINGUHUNT_CLAIM_V1"),
    addressToBytes(payload.playerAddress),
    u64ToLeBytes(payload.epoch),
    u64ToLeBytes(payload.ballIndex),
    addressToBytes(payload.assemblyId),
    u64ToLeBytes(payload.expiresAtMs),
    u64ToLeBytes(payload.nonce),
  );
}

function randomNonce(): bigint {
  const bytes = randomBytes(8);
  let value = 0n;
  for (let i = 0; i < bytes.length; i += 1) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value;
}

async function signClaimTicket(
  keypair: Ed25519Keypair,
  payload: {
    playerAddress: string;
    epoch: bigint;
    ballIndex: bigint;
    assemblyId: string;
    expiresAtMs: bigint;
    nonce: bigint;
  },
) {
  const message = buildClaimTicketMessage(payload);
  const signed = await keypair.signPersonalMessage(message);

  return {
    playerAddress: payload.playerAddress,
    epoch: payload.epoch.toString(),
    ballIndex: payload.ballIndex.toString(),
    assemblyId: payload.assemblyId,
    expiresAtMs: payload.expiresAtMs.toString(),
    nonce: payload.nonce.toString(),
    signature: signed.signature,
    signerAddress: keypair.toSuiAddress(),
  };
}

function json(res: any, statusCode: number, body: unknown) {
  res.status(statusCode).setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.send(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const privateKey = process.env.CLAIM_TICKET_PRIVATE_KEY;
    const ttlMs = BigInt(process.env.CLAIM_TICKET_TTL_MS || "30000");
    const gateSlug = req.query?.gate;

    if (!privateKey) {
      throw new Error("Missing CLAIM_TICKET_PRIVATE_KEY");
    }

    const gate = resolveTrustedGateFromHeaders(
      req.headers,
      typeof gateSlug === "string" ? gateSlug : null,
    );

    const body = (req.body || {}) as ClaimTicketRequest;
    if (!body.playerAddress) {
      throw new Error("Missing playerAddress");
    }
    if (body.ballIndex == null || !Number.isInteger(body.ballIndex)) {
      throw new Error("Missing integer ballIndex");
    }
    if (body.epoch == null) {
      throw new Error("Missing epoch");
    }

    const { secretKey } = decodeSuiPrivateKey(privateKey);
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);
    const now = BigInt(Date.now());
    const ticket = await signClaimTicket(keypair, {
      playerAddress: normalizePlayerAddress(body.playerAddress),
      epoch: BigInt(body.epoch),
      ballIndex: BigInt(body.ballIndex),
      assemblyId: gate.assemblyId,
      expiresAtMs: now + ttlMs,
      nonce: randomNonce(),
    });

    return json(res, 200, {
      ...ticket,
      tenant: gate.tenant,
      gateSlug: gate.slug,
      mode: "seven-gate-vercel",
    });
  } catch (error) {
    return json(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
