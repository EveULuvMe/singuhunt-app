import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  buildClaimTicketMessage,
  createDevContextSignature,
  normalizeAddress,
  signClaimTicket,
  verifyDevContextSignature,
} from "./utils/claim-ticket.js";

config();

const privateKey =
  process.env.CLAIM_TICKET_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;
const devSecret = process.env.DEV_CONTEXT_SECRET || "local-dev-secret";

if (!privateKey) {
  throw new Error(
    "Missing CLAIM_TICKET_PRIVATE_KEY (or ADMIN_PRIVATE_KEY for local verification)",
  );
}

async function main() {
  const { secretKey } = decodeSuiPrivateKey(privateKey!);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);

  const payload = {
    playerAddress: normalizeAddress(
      process.env.PLAYER_A_ADDRESS ||
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    ),
    epoch: 42n,
    ballIndex: 3n,
    assemblyId: normalizeAddress(
      process.env.TRUSTED_ASSEMBLY_ID ||
        "0x2222222222222222222222222222222222222222222222222222222222222222",
    ),
    expiresAtMs: 1_900_000_000_000n,
    nonce: 77n,
  };

  const signed = await signClaimTicket(keypair, payload);
  const message = buildClaimTicketMessage(payload);
  const digest = createHash("sha3-256").update(message).digest();
  const verified = await keypair
    .getPublicKey()
    .verify(digest, Buffer.from(signed.signature, "base64"));
  assert.equal(verified, true, "signed ticket must verify against signer public key");

  const tamperedPayload = { ...payload, ballIndex: payload.ballIndex + 1n };
  const tamperedMessage = buildClaimTicketMessage(tamperedPayload);
  const tamperedDigest = createHash("sha3-256").update(tamperedMessage).digest();
  const tamperedVerified = await keypair
    .getPublicKey()
    .verify(tamperedDigest, Buffer.from(signed.signature, "base64"));
  assert.equal(
    tamperedVerified,
    false,
    "signature must fail after tampering with the claim payload",
  );

  const ticketDigest = createHash("sha3-256")
    .update(message)
    .digest("hex");
  assert.equal(ticketDigest.length, 64, "ticket digest must be 32 bytes");

  const context = {
    tenant: "your-tenant",
    assemblyId: payload.assemblyId,
    playerAddress: payload.playerAddress,
  };
  const contextSignature = createDevContextSignature(context, devSecret);
  assert.equal(
    verifyDevContextSignature(context, devSecret, contextSignature),
    true,
    "dev assembly context must round-trip with the configured HMAC secret",
  );
  assert.equal(
    verifyDevContextSignature(
      { ...context, assemblyId: normalizeAddress("0x3333") },
      devSecret,
      contextSignature,
    ),
    false,
    "context signature must fail if the assembly changes",
  );

  console.log("Claim ticket verification passed.");
  console.log(`Signer: ${keypair.toSuiAddress()}`);
  console.log(`Ticket digest: 0x${ticketDigest}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
