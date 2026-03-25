import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getTrustedGateBySlug } from "../../_lib/trusted-gates.js";

function json(res: any, statusCode: number, body: unknown) {
  res.status(statusCode).setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.send(JSON.stringify(body));
}

export default function handler(req: any, res: any) {
  const gateSlug = req.query?.gate;
  const gate =
    typeof gateSlug === "string" ? getTrustedGateBySlug(gateSlug) : null;
  const privateKey = process.env.CLAIM_TICKET_PRIVATE_KEY;

  if (!gate) {
    return json(res, 404, { ok: false, error: "Unknown gate slug" });
  }
  if (!privateKey) {
    return json(res, 500, { ok: false, error: "Missing CLAIM_TICKET_PRIVATE_KEY" });
  }

  const { secretKey } = decodeSuiPrivateKey(privateKey);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);

  return json(res, 200, {
    ok: true,
    signerAddress: keypair.toSuiAddress(),
    gateSlug: gate.slug,
    assemblyId: gate.assemblyId,
    tenant: gate.tenant,
    ttlMs: process.env.CLAIM_TICKET_TTL_MS || "30000",
  });
}
