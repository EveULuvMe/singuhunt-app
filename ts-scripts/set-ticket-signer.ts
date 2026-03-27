/// Configure the trusted claim ticket signer public key on-chain.
/// Usage:
///   pnpm set-ticket-signer -- --public-key <BASE64_PUBLIC_KEY>

import { Transaction } from "@mysten/sui/transactions";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/bcs";
import {
  getAdminKeypair,
  getSuiClient,
  ADMIN_CAP_ID,
  GAME_STATE_ID,
  SINGUHUNT_PACKAGE_ID,
} from "./utils/config.js";
import { signAndExecute } from "./utils/transaction.js";

async function main() {
  const args = process.argv.slice(2);
  let signerPublicKey = process.env.CLAIM_TICKET_SIGNER_PUBLIC_KEY || "";
  const signerPrivateKey = process.env.CLAIM_TICKET_PRIVATE_KEY || "";

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--public-key" && args[i + 1]) {
      signerPublicKey = args[i + 1];
    }
  }

  if (!signerPublicKey && signerPrivateKey) {
    const { secretKey } = decodeSuiPrivateKey(signerPrivateKey);
    signerPublicKey = Buffer.from(
      Ed25519Keypair.fromSecretKey(secretKey).getPublicKey().toRawBytes(),
    ).toString("base64");
  }

  if (!signerPublicKey) {
    throw new Error("Missing --public-key <BASE64_PUBLIC_KEY> or CLAIM_TICKET_SIGNER_PUBLIC_KEY");
  }

  const client = getSuiClient();
  const admin = getAdminKeypair();
  const tx = new Transaction();

  tx.moveCall({
    target: `${SINGUHUNT_PACKAGE_ID}::singuhunt::set_ticket_signer`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(GAME_STATE_ID),
      tx.pure.vector("u8", Array.from(fromBase64(signerPublicKey))),
    ],
  });

  await signAndExecute(client, admin, tx);
  console.log("Configured trusted claim ticket signer public key");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
