import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const router: IRouter = Router();

function getOpenAI(): OpenAI {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

interface TranscribeBody {
  audioBase64: string;
  mimeType?: string;
}

router.post("/transcribe", async (req, res) => {
  // ── 1. Confirm the route is being hit ──────────────────────────────────────
  req.log.info("[TRANSCRIBE CALLED]");

  // ── 2. Verify API key ──────────────────────────────────────────────────────
  const rawKey = process.env["OPENAI_API_KEY"] ?? "";
  req.log.info(
    { keyPrefix: rawKey ? rawKey.slice(0, 10) : "MISSING" },
    "[transcribe] OPENAI_API_KEY check",
  );

  const { audioBase64, mimeType } =
    (req.body ?? {}) as Partial<TranscribeBody>;

  // ── 3. Log what arrived ────────────────────────────────────────────────────
  req.log.info(
    {
      hasAudio: !!audioBase64,
      audioLen: typeof audioBase64 === "string" ? audioBase64.length : 0,
      mimeType: mimeType ?? "(none)",
    },
    "[transcribe] request body",
  );

  if (!audioBase64 || typeof audioBase64 !== "string") {
    res.status(400).json({ error: "audioBase64 is required" });
    return;
  }

  let openai: OpenAI;
  try {
    openai = getOpenAI();
  } catch (err) {
    req.log.error({ err }, "[transcribe] OpenAI not configured");
    res.status(500).json({ error: "OpenAI no está configurado" });
    return;
  }

  // Decode base64 → temp file (Whisper SDK needs a file stream, not a buffer)
  const mime = mimeType ?? "audio/m4a";
  const ext = mime.includes("mp4") || mime.includes("m4a")
    ? "m4a"
    : mime.includes("wav")
    ? "wav"
    : mime.includes("webm")
    ? "webm"
    : mime.includes("ogg")
    ? "ogg"
    : mime.includes("mpeg") || mime.includes("mp3")
    ? "mp3"
    : "m4a";

  const tmpFile = path.join(os.tmpdir(), `audio-${randomUUID()}.${ext}`);
  try {
    const bytes = Buffer.from(audioBase64, "base64");
    fs.writeFileSync(tmpFile, bytes);
    req.log.info(
      { tmpFile, bytes: bytes.length, mime, ext },
      "[transcribe] wrote temp audio file",
    );
  } catch (err) {
    req.log.error({ err }, "[transcribe] failed writing temp file");
    res.status(500).json({ error: "Error procesando audio" });
    return;
  }

  try {
    const stream = fs.createReadStream(tmpFile);

    req.log.info("[transcribe] sending to Whisper...");
    const result = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: stream,
      language: "es",
      response_format: "text",
    });

    const text = typeof result === "string" ? result.trim() : "";
    req.log.info({ text }, "[transcribe] Whisper result");

    if (!text) {
      res.status(422).json({ error: "No se detectó texto en el audio" });
      return;
    }

    res.json({ text });
  } catch (err: unknown) {
    // Log every detail of the OpenAI error so we can diagnose it
    const e = err as Record<string, unknown>;
    req.log.error(
      {
        message: e?.["message"],
        status: e?.["status"],
        code: e?.["code"],
        type: e?.["type"],
        error: e?.["error"],
        rawErr: String(err),
      },
      "[transcribe] Whisper failed",
    );
    const detail =
      typeof e?.["message"] === "string"
        ? e["message"]
        : "No se pudo transcribir el audio";
    res.status(500).json({ error: detail });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
});

export default router;
