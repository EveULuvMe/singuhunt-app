import { createHmac, randomBytes } from "node:crypto";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const CLAIM_TICKET_DOMAIN = "SINGUHUNT_CLAIM_V1";
const DELIVER_TICKET_DOMAIN = "SINGUHUNT_DELIVER_V1";
const DEV_CONTEXT_DOMAIN = "SINGUHUNT_DEV_CONTEXT_V1";

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

function addressToBytes(value: string): Uint8Array {
  const normalized = stripHexPrefix(normalizeAddress(value));
  return Uint8Array.from(Buffer.from(normalized, "hex"));
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

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

export function buildClaimTicketMessage(
  payload: ClaimTicketPayload,
): Uint8Array {
  return concatBytes(
    new TextEncoder().encode(CLAIM_TICKET_DOMAIN),
    addressToBytes(payload.playerAddress),
    u64ToLeBytes(payload.epoch),
    u64ToLeBytes(payload.ballIndex),
    addressToBytes(payload.assemblyId),
    u64ToLeBytes(payload.expiresAtMs),
    u64ToLeBytes(payload.nonce),
  );
}

export async function signClaimTicket(
  keypair: Ed25519Keypair,
  payload: ClaimTicketPayload,
): Promise<ClaimTicket> {
  const message = buildClaimTicketMessage(payload);
  const signed = await keypair.signPersonalMessage(message);

  return {
    ...payload,
    signature: signed.signature,
    signerAddress: keypair.toSuiAddress(),
  };
}

export function buildDeliverTicketMessage(
  payload: DeliverTicketPayload,
): Uint8Array {
  return concatBytes(
    new TextEncoder().encode(DELIVER_TICKET_DOMAIN),
    addressToBytes(payload.playerAddress),
    u64ToLeBytes(payload.epoch),
    u64ToLeBytes(payload.ballIndex),
    addressToBytes(payload.assemblyId),
    u64ToLeBytes(payload.expiresAtMs),
    u64ToLeBytes(payload.nonce),
  );
}

export async function signDeliverTicket(
  keypair: Ed25519Keypair,
  payload: DeliverTicketPayload,
): Promise<DeliverTicket> {
  const message = buildDeliverTicketMessage(payload);
  const signed = await keypair.signPersonalMessage(message);

  return {
    ...payload,
    signature: signed.signature,
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
