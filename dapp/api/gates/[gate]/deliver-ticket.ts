import {
  normalizePlayerAddress,
  resolveTrustedGateFromHeaders,
} from "../../_lib/trusted-gates.js";
import { signGateTicket } from "../../_lib/tickets.js";

type DeliverTicketRequest = {
  playerAddress?: string;
  ballIndex?: number;
  epoch?: string | number;
};

function json(res: any, statusCode: number, body: unknown) {
  res.status(statusCode).setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.send(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const gateSlug = req.query?.gate;
    const gate = resolveTrustedGateFromHeaders(
      req.headers,
      typeof gateSlug === "string" ? gateSlug : null,
    );

    const body = (req.body || {}) as DeliverTicketRequest;
    if (!body.playerAddress) {
      throw new Error("Missing playerAddress");
    }
    if (body.ballIndex == null || !Number.isInteger(body.ballIndex)) {
      throw new Error("Missing integer ballIndex");
    }
    if (body.epoch == null) {
      throw new Error("Missing epoch");
    }

    const ticket = await signGateTicket("SINGUHUNT_DELIVER_V1", {
      playerAddress: normalizePlayerAddress(body.playerAddress),
      epoch: BigInt(body.epoch),
      ballIndex: BigInt(body.ballIndex),
      assemblyId: gate.assemblyId,
    });

    return json(res, 200, {
      ...ticket,
      tenant: gate.tenant,
      gateSlug: gate.slug,
      mode: "multi-gate-vercel",
      action: "deliver",
    });
  } catch (error) {
    return json(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
