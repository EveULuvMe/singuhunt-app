const RPC_URL =
  process.env.VITE_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";
const GAME_STATE_ID =
  process.env.VITE_GAME_STATE_ID ||
  "0x3164b8a46471bc82f9e781391540802431de8e6000b4bb68a7ada6bbe07dd833";
const PACKAGE_ID =
  process.env.VITE_SINGUHUNT_PACKAGE_ID ||
  "0xbce47d3e624f2478bdd77a114931b1af541929032da3db01cb6b6d4378aba1ab";

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  return response.json();
}

export async function getGameStateFields() {
  const payload = await rpc("sui_getObject", [
    GAME_STATE_ID,
    { showContent: true },
  ]);
  return payload?.result?.data?.content?.fields || null;
}

export async function getDynamicFieldValue<T>(
  keyType: string,
  value: Record<string, unknown>,
): Promise<T | null> {
  const payload = await rpc("suix_getDynamicFieldObject", [
    GAME_STATE_ID,
    { type: keyType, value },
  ]);
  const raw = payload?.result?.data?.content?.fields?.value;
  if (!raw) return null;
  return (raw.fields ?? raw) as T;
}

export { GAME_STATE_ID, PACKAGE_ID };
