import { getQuestionOfTheDay } from "./_lib/deep-decrypt.js";
import { getGameStateFields } from "./_lib/sui-game.js";

function json(res: any, statusCode: number, body: unknown) {
  res.status(statusCode).setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.send(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const fields = await getGameStateFields();
    if (!fields) {
      throw new Error("GameState unavailable");
    }
    if (!fields.hunt_active) {
      throw new Error("Deep Decrypt is not active");
    }

    const { dateKey, index, question } = getQuestionOfTheDay();

    return json(res, 200, {
      ok: true,
      dateKey,
      index,
      epoch: String(fields.current_epoch),
      question: {
        id: question.id,
        prompt: question.prompt,
        sourceUrl: question.sourceUrl,
      },
    });
  } catch (error) {
    return json(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
