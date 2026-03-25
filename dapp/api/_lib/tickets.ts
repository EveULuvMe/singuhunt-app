import { randomBytes } from "node:crypto";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

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

function buildTicketMessage(domain: string, payload: TicketPayload) {
  return concatBytes(
    new TextEncoder().encode(domain),
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

function buildDecryptTicketMessage(payload: DecryptTicketPayload) {
  return concatBytes(
    new TextEncoder().encode("SINGUHUNT_DECRYPT_V1"),
    addressToBytes(payload.playerAddress),
    u64ToLeBytes(payload.epoch),
    u64ToLeBytes(payload.expiresAtMs),
    u64ToLeBytes(payload.nonce),
  );
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
  domain: "SINGUHUNT_CLAIM_V1" | "SINGUHUNT_DELIVER_V1",
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
  const signed = await keypair.signPersonalMessage(message);

  return {
    ...fullPayload,
    epoch: fullPayload.epoch.toString(),
    ballIndex: fullPayload.ballIndex.toString(),
    expiresAtMs: expiresAtMs.toString(),
    nonce: nonce.toString(),
    signature: signed.signature,
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
  const signed = await keypair.signPersonalMessage(message);

  return {
    playerAddress: fullPayload.playerAddress,
    epoch: fullPayload.epoch.toString(),
    expiresAtMs: expiresAtMs.toString(),
    nonce: nonce.toString(),
    signature: signed.signature,
    signerAddress: keypair.toSuiAddress(),
  };
}
