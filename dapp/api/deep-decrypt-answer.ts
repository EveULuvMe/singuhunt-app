import { getQuestionOfTheDay, isCorrectAnswer } from "./_lib/deep-decrypt.js";
import { signDecryptTicket } from "./_lib/tickets.js";
import { getGameStateFields } from "./_lib/sui-game.js";

function json(res: any, statusCode: number, body: unknown) {
  res.status(statusCode).setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.send(JSON.stringify(body));
}

function normalizePlayerAddress(value: string): string {
  const trimmed = value.startsWith("0x") ? value.slice(2) : value;
  return `0x${trimmed.toLowerCase().padStart(64, "0")}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const { playerAddress, answer, epoch } = req.body || {};

    if (!playerAddress || !answer || epoch == null) {
      return json(res, 400, { ok: false, error: "Missing playerAddress, answer, or epoch" });
    }

    // Verify hunt is active and mode is Deep Decrypt (3)
    const fields = await getGameStateFields();
    if (!fields) {
      return json(res, 500, { ok: false, error: "GameState unavailable" });
    }
    if (!fields.hunt_active) {
      return json(res, 400, { ok: false, error: "Hunt is not active" });
    }

    const { question } = getQuestionOfTheDay();

    if (!isCorrectAnswer(question, answer)) {
      return json(res, 200, { ok: false, error: "Wrong answer. Try again." });
    }

    // Correct answer — issue signed decrypt ticket
    const ticket = await signDecryptTicket({
      playerAddress: normalizePlayerAddress(playerAddress),
      epoch: BigInt(epoch),
    });

    return json(res, 200, { ok: true, ticket });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
