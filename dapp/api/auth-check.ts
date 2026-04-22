import { createHmac, timingSafeEqual } from "node:crypto";

function json(res: any, statusCode: number, body: unknown) {
  res.status(statusCode).setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.send(JSON.stringify(body));
}

function readHeader(headers: any, name: string): string | null {
  const raw = headers?.[name];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === "string" ? raw : null;
}

function toBase64Url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export default function handler(req: any, res: any) {
  const secret = process.env.EF_CONTEXT_SHARED_SECRET;
  if (!secret) {
    return json(res, 500, { ok: false, error: "Server misconfigured" });
  }

  const assemblyId = readHeader(req.headers, "x-ef-assembly-id");
  const tenant = readHeader(req.headers, "x-ef-tenant");
  const contextTs = readHeader(req.headers, "x-ef-context-ts");
  const contextSig = readHeader(req.headers, "x-ef-context-sig");

  if (!assemblyId || !tenant || !contextTs || !contextSig) {
    return json(res, 403, { ok: false, error: "Missing context headers" });
  }

  const timestampMs = Number(contextTs);
  const maxSkewMs = Number(process.env.EF_CONTEXT_MAX_SKEW_MS || "30000");
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > maxSkewMs) {
    return json(res, 403, { ok: false, error: "Context expired" });
  }

  // Reconstruct the canonical message using the same gate slug as the proxy
  const gateSlug = "singu-home";
  const message = [
    "SINGUHUNT_EF_CONTEXT_V1",
    gateSlug,
    assemblyId,
    tenant,
    String(timestampMs),
  ].join("\n");

  const expectedSig = toBase64Url(createHmac("sha256", secret).update(message).digest());

  const actualBuf = Buffer.from(contextSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return json(res, 403, { ok: false, error: "Invalid signature" });
  }

  return json(res, 200, { ok: true });
}
