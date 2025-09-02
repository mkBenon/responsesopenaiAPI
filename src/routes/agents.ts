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
 * Enhanced with audio support using the new supervisor agent
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
  console.log('🚀 [AGENTS_ROUTE] POST /agents/supervisor - Request received');
  
  try {
    const { input, conversationId, vectorStoreIds, params, targetAgent } = req.body || {};
    const file = (req as any).file as any;
    
    console.log('📊 [AGENTS_ROUTE] Request details:', {
      hasTextInput: !!input,
      hasAudioFile: !!file,
      audioFileSize: file?.buffer?.length || 0,
      audioMimeType: file?.mimetype,
      conversationId,
      vectorStoreIds,
      targetAgent
    });

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
      console.log(`✅ [AGENTS_ROUTE] Created new conversation: ${convId}`);
    } else {
      console.log(`🔄 [AGENTS_ROUTE] Using existing conversation: ${convId}`);
    }

    // Prepare input for enhanced supervisor agent
    let supervisorInput: any;
    
    if (file) {
      console.log('🎤 [AGENTS_ROUTE] Processing audio file with enhanced supervisor agent');
      console.log(`📊 [AGENTS_ROUTE] Audio file details: ${file.mimetype}, ${file.buffer.length} bytes`);
      
      // Use the enhanced supervisor agent with audio input
      supervisorInput = {
        type: 'audio',
        audioBuffer: file.buffer,
        mimeType: file.mimetype || 'audio/webm',
        metadata: {
          originalFilename: file.originalname,
          size: file.buffer.length
        }
      };
      
      console.log('🔧 [AGENTS_ROUTE] Created AudioInput for supervisor agent');
    } else if (input) {
      console.log('📝 [AGENTS_ROUTE] Processing text input');
      supervisorInput = input;
    } else {
      console.error('❌ [AGENTS_ROUTE] No input provided (neither text nor audio)');
      return res.status(400).json({ error: "No input provided (text or audio)" });
    }

    // If caller specifies a target agent, route directly; otherwise let supervisor decide
    let agentNameUsed = "supervisor";
    let result;
    
    if (targetAgent) {
      console.log(`🎯 [AGENTS_ROUTE] Routing directly to ${targetAgent} agent`);
      try {
        const agent = getAgent(targetAgent);
        agentNameUsed = targetAgent;
        
        // For direct agent routing, we need to handle audio differently
        // since sub-agents only accept string inputs
        let finalInput: string;
        if (typeof supervisorInput === 'object' && supervisorInput.type === 'audio') {
          console.log('🔄 [AGENTS_ROUTE] Converting audio to text for direct agent routing');
          try {
            const transcript = await realtimeAudio.transcribeAudio(
              supervisorInput.audioBuffer,
              supervisorInput.mimeType
            );
            finalInput = transcript;
            console.log(`📝 [AGENTS_ROUTE] Audio transcribed for direct routing: "${transcript}"`);
          } catch (e) {
            console.error('❌ [AGENTS_ROUTE] Audio transcription failed for direct routing:', e);
            return res.status(400).json({ error: "Audio transcription failed" });
          }
        } else {
          finalInput = supervisorInput;
        }
        
        result = await agent.run({
          conversationId: convId,
          input: finalInput,
          params: { ...parsedParams, vectorStoreIds: vsIds },
        });
      } catch (e) {
        console.error('❌ [AGENTS_ROUTE] Direct agent dispatch failed:', e);
        return res.status(400).json({ error: `Unknown or failed agent '${targetAgent}'` });
      }
    } else {
      console.log('🧠 [AGENTS_ROUTE] Using enhanced supervisor agent for routing decision');
      result = await supervisorAgent.run({
        conversationId: convId,
        input: supervisorInput,
        params: { ...parsedParams, vectorStoreIds: vsIds },
      });
      console.log('✅ [AGENTS_ROUTE] Supervisor agent processing completed');
      console.log('📊 [AGENTS_ROUTE] Supervisor metadata:', result.raw?.supervisorMetadata);
    }

    const response = {
      conversationId: convId,
      agent: agentNameUsed,
      text: result.text,
      raw: result.raw,
      // Include audio processing metadata if available
      ...(result.raw?.supervisorMetadata?.audioTranscription?.audioProcessed && {
        audioProcessed: true,
        audioType: result.raw.supervisorMetadata.audioTranscription.audioType,
        originalInputType: result.raw.supervisorMetadata.originalInputType
      })
    };

    console.log('✅ [AGENTS_ROUTE] Request completed successfully');
    console.log('📝 [AGENTS_ROUTE] Response preview:', {
      conversationId: response.conversationId,
      agent: response.agent,
      textLength: response.text?.length || 0,
      audioProcessed: response.audioProcessed || false
    });

    res.json(response);
  } catch (err) {
    console.error('❌ [AGENTS_ROUTE] Request failed:', err);
    console.error('❌ [AGENTS_ROUTE] Error details:', {
      message: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined
    });
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
