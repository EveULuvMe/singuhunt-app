import { createHash, randomBytes } from "node:crypto";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { bcs } from "@mysten/sui/bcs";

const claimTicketBcs = bcs.struct("ClaimTicketPayload", {
  domain: bcs.vector(bcs.u8()),
  player: bcs.Address,
  epoch: bcs.u64(),
  ball_index: bcs.u64(),
  assembly_id: bcs.Address,
  ticket_expires_at_ms: bcs.u64(),
  ticket_nonce: bcs.u64(),
});

const decryptTicketBcs = bcs.struct("DecryptTicketPayload", {
  domain: bcs.vector(bcs.u8()),
  player: bcs.Address,
  epoch: bcs.u64(),
  ticket_expires_at_ms: bcs.u64(),
  ticket_nonce: bcs.u64(),
});

type TicketPayload = {
  playerAddress: string;
  epoch: bigint;
  ballIndex: bigint;
  assemblyId: string;
  expiresAtMs: bigint;
  nonce: bigint;
};

type DecryptTicketPayload = {
  playerAddress: string;
  epoch: bigint;
  expiresAtMs: bigint;
  nonce: bigint;
};

function normalizeAddress(value: string) {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  return `0x${hex.toLowerCase().padStart(64, "0")}`;
}

function sha3_256(bytes: Uint8Array) {
  return new Uint8Array(createHash("sha3-256").update(bytes).digest());
}

function buildTicketMessage(domain: string, payload: TicketPayload) {
  return claimTicketBcs
    .serialize({
      domain: Array.from(new TextEncoder().encode(domain)),
      player: normalizeAddress(payload.playerAddress),
      epoch: payload.epoch,
      ball_index: payload.ballIndex,
      assembly_id: normalizeAddress(payload.assemblyId),
      ticket_expires_at_ms: payload.expiresAtMs,
      ticket_nonce: payload.nonce,
    })
    .toBytes();
}

function randomNonce(): bigint {
  const bytes = randomBytes(8);
  let value = 0n;
  for (let i = 0; i < bytes.length; i += 1) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value;
}

function buildDecryptTicketMessage(payload: DecryptTicketPayload) {
  return decryptTicketBcs
    .serialize({
      domain: Array.from(new TextEncoder().encode("SINGUHUNT_DECRYPT_V2")),
      player: normalizeAddress(payload.playerAddress),
      epoch: payload.epoch,
      ticket_expires_at_ms: payload.expiresAtMs,
      ticket_nonce: payload.nonce,
    })
    .toBytes();
}

export function getTicketSigner() {
  const privateKey = process.env.CLAIM_TICKET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing CLAIM_TICKET_PRIVATE_KEY");
  }

  const { secretKey } = decodeSuiPrivateKey(privateKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

export async function signGateTicket(
  domain: "SINGUHUNT_CLAIM_V2" | "SINGUHUNT_DELIVER_V2",
  payload: Omit<TicketPayload, "expiresAtMs" | "nonce">,
) {
  const keypair = getTicketSigner();
  const ttlMs = BigInt(process.env.CLAIM_TICKET_TTL_MS || "30000");
  const expiresAtMs = BigInt(Date.now()) + ttlMs;
  const nonce = randomNonce();
  const fullPayload = {
    ...payload,
    expiresAtMs,
    nonce,
  };

  const message = buildTicketMessage(domain, fullPayload);
  const signed = await keypair.sign(sha3_256(message));

  return {
    ...fullPayload,
    epoch: fullPayload.epoch.toString(),
    ballIndex: fullPayload.ballIndex.toString(),
    expiresAtMs: expiresAtMs.toString(),
    nonce: nonce.toString(),
    signature: Buffer.from(signed).toString("base64"),
    signerAddress: keypair.toSuiAddress(),
  };
}

export async function signDecryptTicket(payload: Omit<DecryptTicketPayload, "expiresAtMs" | "nonce">) {
  const keypair = getTicketSigner();
  const ttlMs = BigInt(process.env.CLAIM_TICKET_TTL_MS || "30000");
  const expiresAtMs = BigInt(Date.now()) + ttlMs;
  const nonce = randomNonce();
  const fullPayload = {
    ...payload,
    expiresAtMs,
    nonce,
  };

  const message = buildDecryptTicketMessage(fullPayload);
  const signed = await keypair.sign(sha3_256(message));

  return {
    playerAddress: fullPayload.playerAddress,
    epoch: fullPayload.epoch.toString(),
    expiresAtMs: expiresAtMs.toString(),
    nonce: nonce.toString(),
    signature: Buffer.from(signed).toString("base64"),
    signerAddress: keypair.toSuiAddress(),
  };
}
