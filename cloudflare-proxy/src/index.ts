type GateEntry = {
  assemblyId: string;
  tenant?: string;
};

type Env = {
  EF_CONTEXT_SHARED_SECRET: string;
  TRUSTED_GATE_MAP: string;
  TRUSTED_TENANT?: string;
  UPSTREAM_ORIGIN: string;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function normalizeAddress(value: string) {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid assemblyId: ${value}`);
  }
  return `0x${hex.toLowerCase().padStart(64, "0")}`;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildCanonicalContext(params: {
  gateSlug: string;
  assemblyId: string;
  tenant: string;
  timestampMs: number;
}) {
  return [
    "SINGUHUNT_EF_CONTEXT_V1",
    params.gateSlug,
    params.assemblyId,
    params.tenant,
    String(params.timestampMs),
  ].join("\n");
}

async function signContext(params: {
  gateSlug: string;
  assemblyId: string;
  tenant: string;
  timestampMs: number;
  secret: string;
}) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(params.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      buildCanonicalContext({
        gateSlug: params.gateSlug,
        assemblyId: params.assemblyId,
        tenant: params.tenant,
        timestampMs: params.timestampMs,
      }),
    ),
  );

  return base64UrlEncode(new Uint8Array(signature));
}

function parseGateMap(raw: string, defaultTenant: string) {
  const parsed = JSON.parse(raw) as Record<string, GateEntry>;
  const normalized = new Map<string, { assemblyId: string; tenant: string }>();

  for (const [slug, gate] of Object.entries(parsed)) {
    normalized.set(slug, {
      assemblyId: normalizeAddress(gate.assemblyId),
      tenant: gate.tenant || defaultTenant,
    });
  }

  return normalized;
}

function stripUntrustedHeaders(request: Request) {
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower.startsWith("x-ef-")) {
      continue;
    }
    if (HOP_BY_HOP_HEADERS.has(lower)) {
      continue;
    }
    headers.set(key, value);
  }
  return headers;
}

function getGateSlugFromPath(pathname: string) {
  const legacyHomeMatch = pathname.match(/^\/(home|bulletin)$/);
  if (legacyHomeMatch) {
    return legacyHomeMatch[1];
  }

  // Page route: /singu-xxx-NNN (root-level slug)
  const pageMatch = pathname.match(/^\/(singu-[^/]+)$/);
  if (pageMatch) {
    return pageMatch[1];
  }

  // Legacy page route: /gates/slug
  const legacyPageMatch = pathname.match(/^\/gates\/([^/]+)$/);
  if (legacyPageMatch) {
    return legacyPageMatch[1];
  }

  // API route: /api/gates/slug/(claim-ticket|deliver-ticket)
  const apiMatch = pathname.match(/^\/api\/gates\/([^/]+)\/(claim-ticket|deliver-ticket)$/);
  if (apiMatch) {
    return apiMatch[1];
  }

  return null;
}

async function proxyRequest(request: Request, env: Env) {
  const upstream = new URL(request.url);
  upstream.protocol = "https:";
  upstream.host = new URL(env.UPSTREAM_ORIGIN).host;

  if (upstream.pathname === "/home" || upstream.pathname === "/bulletin") {
    upstream.pathname = "/singu-home";
  } else if (upstream.pathname === "/gates/home" || upstream.pathname === "/gates/bulletin") {
    upstream.pathname = "/gates/singu-home";
  }

  const headers = stripUntrustedHeaders(request);
  const gateSlug = getGateSlugFromPath(upstream.pathname);

  if (
    gateSlug &&
    (upstream.pathname.endsWith("/claim-ticket") ||
      upstream.pathname.endsWith("/deliver-ticket"))
  ) {
    const gateMap = parseGateMap(
      env.TRUSTED_GATE_MAP,
      env.TRUSTED_TENANT || "your-tenant",
    );
    const gate = gateMap.get(gateSlug);
    if (!gate) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unknown gate slug" }),
        {
          status: 404,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        },
      );
    }

    const timestampMs = Date.now();
    const signature = await signContext({
      gateSlug,
      assemblyId: gate.assemblyId,
      tenant: gate.tenant,
      timestampMs,
      secret: env.EF_CONTEXT_SHARED_SECRET,
    });

    headers.set("x-ef-assembly-id", gate.assemblyId);
    headers.set("x-ef-tenant", gate.tenant);
    headers.set("x-ef-context-ts", String(timestampMs));
    headers.set("x-ef-context-sig", signature);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return fetch(new Request(upstream.toString(), init));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return proxyRequest(request, env);
  },
};
