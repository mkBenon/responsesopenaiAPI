import express from "express";
import multer from "multer";
import { supervisorAgent } from "../agents/supervisorAgent";
import { ragAgent } from "../agents/ragAgent";
import { directAgent } from "../agents/directAgent";
import { RealtimeAudioService } from "../services/realtimeAudioService";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize realtime audio service
const realtimeAudio = new RealtimeAudioService({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Helper functions
function createConversation(): string {
  return `conv_${uuidv4().replace(/-/g, "")}`;
}

function getAgent(name: string) {
  switch (name.toLowerCase()) {
    case "supervisor":
      return supervisorAgent;
    case "rag":
      return ragAgent;
    case "direct":
      return directAgent;
    default:
      throw new Error(`Unknown agent: ${name}`);
  }
}

/**
 * POST /agents/supervisor
 * Body: {
 *   input: string,
 *   conversationId?: string,            // if omitted, a new id is generated
 *   vectorStoreIds?: string[],          // optional: used by RAG agent
 *   params?: Record<string, unknown>    // optional: extra params to pass through
 * }
 *
 * Returns: {
 *   conversationId: string,
 *   text: string,
 *   raw: any
 * }
 */
router.post("/supervisor", upload.single("audio"), async (req, res) => {
  try {
    const { input, conversationId, vectorStoreIds, params, targetAgent } = req.body || {};
    const parsedParams: any =
      typeof params === "string"
        ? (() => {
            try {
              return JSON.parse(params);
            } catch {
              return {};
            }
          })()
        : params || {};
    const vsIds: string[] | undefined = Array.isArray(vectorStoreIds)
      ? vectorStoreIds
      : typeof vectorStoreIds === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(vectorStoreIds);
            return Array.isArray(parsed)
              ? parsed
              : vectorStoreIds
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean);
          } catch {
            return vectorStoreIds
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean);
          }
        })()
      : undefined;

    let convId: string = conversationId;
    if (!convId || typeof convId !== "string" || !convId.startsWith("conv_")) {
      convId = createConversation();
    }

    // If audio file provided, use realtime audio service for transcription
    const file = (req as any).file as any;
    let transcribedText: string | undefined;
    if (file) {
      try {
        const transcript = await realtimeAudio.transcribeAudio(
          file.buffer,
          file.mimetype || "audio/webm"
        );
        transcribedText = transcript;
      } catch (e) {
        console.error("Transcription failed:", e);
        return res.status(400).json({ error: "Audio transcription failed" });
      }
    }

    const finalInput: string = transcribedText
      ? (input ? `${input}\n\n[Audio transcript]: ${transcribedText}` : transcribedText)
      : input;

    if (!finalInput) {
      return res.status(400).json({ error: "No input provided (text or audio transcript)" });
    }

    // If caller specifies a target agent, route directly; otherwise let supervisor decide
    let agentNameUsed = "supervisor";
    let result;
    if (targetAgent) {
      try {
        const agent = getAgent(targetAgent);
        agentNameUsed = targetAgent;
        result = await agent.run({
          conversationId: convId,
          input: finalInput,
          params: { ...parsedParams, vectorStoreIds: vsIds },
        });
      } catch (e) {
        console.error("Direct agent dispatch failed:", e);
        return res.status(400).json({ error: `Unknown or failed agent '${targetAgent}'` });
      }
    } else {
      result = await supervisorAgent.run({
        conversationId: convId,
        input: finalInput,
        params: { ...parsedParams, vectorStoreIds: vsIds },
      });
    }

    res.json({
      conversationId: convId,
      transcribedText,
      agent: agentNameUsed,
      text: result.text,
      raw: result.raw,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Supervisor agent request failed" });
  }
});

/**
 * Server-Sent Events (SSE) streaming endpoint
 * POST /agents/supervisor/stream
 * - Supports text or multipart (audio) similar to /agents/supervisor
 * - Streams incremental model output as SSE events
 *
 * Events:
 *  - conversation: { conversationId }
 *  - transcript:   { text }
 *  - routing:      { route, query }
 *  - text_delta:   { text }
 *  - final:        { conversationId, agent, text, raw }
 *  - error:        { error }
 *  - done:         {}
 */
function sseWrite(res: express.Response, event: string | null, data: any) {
  try {
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // ignore write errors (client disconnected)
  }
}

router.post("/supervisor/stream", upload.single("audio"), async (req, res) => {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // Flush initial padding for some proxies
  res.write(":\n\n");

  try {
    const { input, conversationId, vectorStoreIds, params, targetAgent } = (req as any).body || {};
    const parsedParams: any =
      typeof params === "string"
        ? (() => {
            try {
              return JSON.parse(params);
            } catch {
              return {};
            }
          })()
        : params || {};
    const vsIds: string[] | undefined = Array.isArray(vectorStoreIds)
      ? vectorStoreIds
      : typeof vectorStoreIds === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(vectorStoreIds);
            return Array.isArray(parsed)
              ? parsed
              : vectorStoreIds
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean);
          } catch {
            return vectorStoreIds
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean);
          }
        })()
      : undefined;

    let convId: string = conversationId;
    if (!convId || typeof convId !== "string" || !convId.startsWith("conv_")) {
      convId = createConversation();
    }
    sseWrite(res, "conversation", { conversationId: convId });

    // If audio file provided, use realtime audio service for processing
    const file = (req as any).file as any;
    let finalInput: string;

    if (file) {
      try {
        // Process audio with realtime service
        const { transcript, responseStream } = await realtimeAudio.processAudio(
          file.buffer,
          file.mimetype || "audio/webm",
          {
            conversationId: convId,
            vectorStoreIds: vsIds,
          }
        );

        // Send transcript event
        sseWrite(res, "transcript", { text: transcript });

        // Stream the response
        for await (const event of responseStream) {
          sseWrite(res, event.type, event.data);
        }

        sseWrite(res, "done", {});
        return res.end();
      } catch (e) {
        console.error("Audio processing failed:", e);
        sseWrite(res, "error", { error: "Audio processing failed" });
        return res.end();
      }
    } else {
      finalInput = input;
    }

    if (!finalInput) {
      sseWrite(res, "error", { error: "No input provided (text or audio)" });
      return res.end();
    }

    // Process text input with realtime service
    try {
      const responseStream = await realtimeAudio.processTextWithContext(finalInput, {
        conversationId: convId,
        vectorStoreIds: vsIds,
      });

      // Stream the response
      for await (const event of responseStream) {
        sseWrite(res, event.type, event.data);
      }

      sseWrite(res, "done", {});
      res.end();
    } catch (err) {
      console.error("Text processing failed:", err);
      sseWrite(res, "error", { error: "Text processing failed" });
      res.end();
    }
  } catch (err) {
    console.error(err);
    sseWrite(res, "error", { error: "Supervisor agent streaming request failed" });
    return res.end();
  }
});

/**
 * Create a new conversation id (conv_*) without making an LLM call.
 */
router.get("/conversation/new", async (_req, res) => {
  try {
    const id = createConversation();
    res.json({ conversationId: id });
  } catch (e) {
    console.error("Failed to create conversation:", e);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

export default router;
