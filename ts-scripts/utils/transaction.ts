import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

export async function signAndExecute(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
): Promise<{ digest: string; effects: any }> {
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  });

  if (result.effects?.status?.status !== "success") {
    console.error("Transaction failed:", result.effects?.status);
    throw new Error(
      `Transaction failed: ${result.effects?.status?.error || "unknown error"}`,
    );
  }

  console.log(`Transaction successful! Digest: ${result.digest}`);
  return { digest: result.digest, effects: result.effects };
}
