import { createHash, createHmac, randomBytes } from "node:crypto";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { bcs } from "@mysten/sui/bcs";

const CLAIM_TICKET_DOMAIN = "SINGUHUNT_CLAIM_V2";
const DELIVER_TICKET_DOMAIN = "SINGUHUNT_DELIVER_V2";
const DEV_CONTEXT_DOMAIN = "SINGUHUNT_DEV_CONTEXT_V1";

const claimTicketBcs = bcs.struct("ClaimTicketPayload", {
  domain: bcs.vector(bcs.u8()),
  player: bcs.Address,
  epoch: bcs.u64(),
  ball_index: bcs.u64(),
  assembly_id: bcs.Address,
  ticket_expires_at_ms: bcs.u64(),
  ticket_nonce: bcs.u64(),
});

export type ClaimTicketPayload = {
  playerAddress: string;
  epoch: bigint;
  ballIndex: bigint;
  assemblyId: string;
  expiresAtMs: bigint;
  nonce: bigint;
};

export type ClaimTicket = ClaimTicketPayload & {
  signature: string;
  signerAddress: string;
};

export type DeliverTicketPayload = {
  playerAddress: string;
  epoch: bigint;
  ballIndex: bigint;
  assemblyId: string;
  expiresAtMs: bigint;
  nonce: bigint;
};

export type DeliverTicket = DeliverTicketPayload & {
  signature: string;
  signerAddress: string;
};

export type DevAssemblyContext = {
  tenant: string;
  assemblyId: string;
  playerAddress: string;
};

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

function sha3_256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha3-256").update(bytes).digest());
}

export function buildClaimTicketMessage(
  payload: ClaimTicketPayload,
): Uint8Array {
  return claimTicketBcs.serialize({
    domain: Array.from(new TextEncoder().encode(CLAIM_TICKET_DOMAIN)),
    player: normalizeAddress(payload.playerAddress),
    epoch: payload.epoch,
    ball_index: payload.ballIndex,
    assembly_id: normalizeAddress(payload.assemblyId),
    ticket_expires_at_ms: payload.expiresAtMs,
    ticket_nonce: payload.nonce,
  }).toBytes();
}

export async function signClaimTicket(
  keypair: Ed25519Keypair,
  payload: ClaimTicketPayload,
): Promise<ClaimTicket> {
  const message = buildClaimTicketMessage(payload);
  const signed = await keypair.sign(sha3_256(message));

  return {
    ...payload,
    signature: Buffer.from(signed).toString("base64"),
    signerAddress: keypair.toSuiAddress(),
  };
}

export function buildDeliverTicketMessage(
  payload: DeliverTicketPayload,
): Uint8Array {
  return claimTicketBcs.serialize({
    domain: Array.from(new TextEncoder().encode(DELIVER_TICKET_DOMAIN)),
    player: normalizeAddress(payload.playerAddress),
    epoch: payload.epoch,
    ball_index: payload.ballIndex,
    assembly_id: normalizeAddress(payload.assemblyId),
    ticket_expires_at_ms: payload.expiresAtMs,
    ticket_nonce: payload.nonce,
  }).toBytes();
}

export async function signDeliverTicket(
  keypair: Ed25519Keypair,
  payload: DeliverTicketPayload,
): Promise<DeliverTicket> {
  const message = buildDeliverTicketMessage(payload);
  const signed = await keypair.sign(sha3_256(message));

  return {
    ...payload,
    signature: Buffer.from(signed).toString("base64"),
    signerAddress: keypair.toSuiAddress(),
  };
}

export function randomNonce(): bigint {
  const bytes = randomBytes(8);
  let value = 0n;
  for (let i = 0; i < bytes.length; i += 1) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value;
}

export function createDevContextSignature(
  context: DevAssemblyContext,
  secret: string,
): string {
  const material = [
    DEV_CONTEXT_DOMAIN,
    context.tenant,
    normalizeAddress(context.assemblyId),
    normalizeAddress(context.playerAddress),
  ].join("|");

  return createHmac("sha256", secret).update(material).digest("hex");
}

export function verifyDevContextSignature(
  context: DevAssemblyContext,
  secret: string,
  signature: string,
): boolean {
  return createDevContextSignature(context, secret) === signature;
}
