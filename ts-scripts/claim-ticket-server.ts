import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { config } from "dotenv";
import {
  decodeSuiPrivateKey,
} from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  normalizeAddress,
  randomNonce,
  signClaimTicket,
  verifyDevContextSignature,
  type ClaimTicket,
  type DevAssemblyContext,
} from "./utils/claim-ticket.js";

config();

const port = Number(process.env.CLAIM_TICKET_PORT || "8787");
const host = process.env.CLAIM_TICKET_HOST || "127.0.0.1";
const ttlMs = BigInt(process.env.CLAIM_TICKET_TTL_MS || "30000");
const privateKey =
  process.env.CLAIM_TICKET_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;

if (!privateKey) {
  throw new Error(
    "Missing CLAIM_TICKET_PRIVATE_KEY (or ADMIN_PRIVATE_KEY for local verification)",
  );
}

const { secretKey } = decodeSuiPrivateKey(privateKey);
const signer = Ed25519Keypair.fromSecretKey(secretKey);
const signerAddress = signer.toSuiAddress();

type ClaimTicketRequest = {
  playerAddress?: string;
  ballIndex?: number;
  epoch?: string | number;
  assemblyId?: string;
  tenant?: string;
  contextSignature?: string;
};

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function json(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type,x-ef-assembly-id,x-ef-tenant",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(body));
}

function serializeTicket(ticket: ClaimTicket) {
  return {
    playerAddress: ticket.playerAddress,
    epoch: ticket.epoch.toString(),
    ballIndex: ticket.ballIndex.toString(),
    assemblyId: ticket.assemblyId,
    expiresAtMs: ticket.expiresAtMs.toString(),
    nonce: ticket.nonce.toString(),
    signature: ticket.signature,
    signerAddress: ticket.signerAddress,
  };
}

function resolveTrustedContext(
  request: IncomingMessage,
  body: ClaimTicketRequest,
): DevAssemblyContext {
  const trustedAssemblyId = request.headers["x-ef-assembly-id"];
  const trustedTenant =
    request.headers["x-ef-tenant"] || process.env.TRUSTED_TENANT || "your-tenant";
  if (
    typeof trustedAssemblyId === "string" &&
    typeof trustedTenant === "string" &&
    body.playerAddress
  ) {
    return {
      tenant: trustedTenant,
      assemblyId: normalizeAddress(trustedAssemblyId),
      playerAddress: normalizeAddress(body.playerAddress),
    };
  }

  if (process.env.TRUSTED_ASSEMBLY_ID && body.playerAddress) {
    return {
      tenant:
        typeof trustedTenant === "string" ? trustedTenant : "your-tenant",
      assemblyId: process.env.TRUSTED_ASSEMBLY_ID,
      playerAddress: normalizeAddress(body.playerAddress),
    };
  }

  const secret = process.env.DEV_CONTEXT_SECRET;
  if (
    secret &&
    body.playerAddress &&
    body.assemblyId &&
    body.tenant &&
    body.contextSignature
  ) {
    const context = {
      tenant: body.tenant,
      assemblyId: normalizeAddress(body.assemblyId),
      playerAddress: normalizeAddress(body.playerAddress),
    };

    if (
      verifyDevContextSignature(
        context,
        secret,
        body.contextSignature,
      )
    ) {
      return context;
    }
  }

  throw new Error(
    "Missing trusted assembly context. Configure TRUSTED_ASSEMBLY_ID or send a valid dev context signature.",
  );
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    json(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    json(response, 200, {
      ok: true,
      signerAddress,
      ttlMs: ttlMs.toString(),
    });
    return;
  }

  if (request.method === "POST" && request.url === "/claim-ticket") {
    try {
      const body = await readJsonBody<ClaimTicketRequest>(request);
      if (!body.playerAddress) {
        throw new Error("Missing playerAddress");
      }
      if (body.ballIndex == null || !Number.isInteger(body.ballIndex)) {
        throw new Error("Missing integer ballIndex");
      }
      if (body.epoch == null) {
        throw new Error("Missing epoch");
      }

      const context = resolveTrustedContext(request, body);
      const now = BigInt(Date.now());
      const ticket = await signClaimTicket(signer, {
        playerAddress: context.playerAddress,
        epoch: BigInt(body.epoch),
        ballIndex: BigInt(body.ballIndex),
        assemblyId: context.assemblyId,
        expiresAtMs: now + ttlMs,
        nonce: randomNonce(),
      });

      json(response, 200, serializeTicket(ticket));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      json(response, 400, { ok: false, error: message });
    }
    return;
  }

  json(response, 404, { ok: false, error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`Claim ticket server listening on http://${host}:${port}`);
  console.log(`Trusted signer: ${signerAddress}`);
});
