import { config } from "dotenv";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

config();

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

function getEnvOptional(key: string): string | undefined {
  return process.env[key];
}

export function getSuiClient(): SuiClient {
  const rpcUrl =
    getEnvOptional("SUI_RPC_URL") || getFullnodeUrl("testnet");
  return new SuiClient({ url: rpcUrl });
}

export function getAdminKeypair(): Ed25519Keypair {
  const privateKey = getEnv("ADMIN_PRIVATE_KEY");
  const { secretKey } = decodeSuiPrivateKey(privateKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

export function getPlayerKeypair(player: "A" | "B"): Ed25519Keypair {
  const privateKey = getEnv(`PLAYER_${player}_PRIVATE_KEY`);
  const { secretKey } = decodeSuiPrivateKey(privateKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

export const SINGUHUNT_PACKAGE_ID = getEnv("SINGUHUNT_PACKAGE_ID");
export const GAME_STATE_ID = getEnv("GAME_STATE_ID");
export const ADMIN_CAP_ID = getEnv("ADMIN_CAP_ID");
export const BULLETIN_CONFIG_ID = getEnvOptional("BULLETIN_CONFIG_ID") || "";
