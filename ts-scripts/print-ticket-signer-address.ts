import { config } from "dotenv";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

config();

const privateKey =
  process.env.CLAIM_TICKET_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;

if (!privateKey) {
  throw new Error(
    "Missing CLAIM_TICKET_PRIVATE_KEY (or ADMIN_PRIVATE_KEY for local verification)",
  );
}

const { secretKey } = decodeSuiPrivateKey(privateKey);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);

console.log("address:", keypair.toSuiAddress());
console.log("publicKeyBase64:", Buffer.from(keypair.getPublicKey().toRawBytes()).toString("base64"));
