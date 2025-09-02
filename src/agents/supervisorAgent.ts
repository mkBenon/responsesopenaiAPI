import { Agent, AgentRunInput, AgentRunResult, SupervisorDecisionSchema, SupervisorDecision, AudioInput, BatchAudioInput } from "./types";
import { openai, DEFAULT_MODEL, getOutputText, createConversation } from "../clients/openaiSdk";
import { directAgent } from "./directAgent";
import { ragAgent } from "./ragAgent";
import { RealtimeAudioService } from "../services/realtimeAudioService";

/**
 * Enhanced SupervisorAgent with Audio Support
 * - Handles text, audio, and batch audio inputs
 * - Uses GPT-4.1 with new Responses API for audio transcription
 * - Routes queries to sub-agents (direct, rag, etc.) using LLM reasoning
 * - Maintains long conversation context
 * - Supports batch audio processing for multiple audio chunks
 */
export const supervisorAgent: Agent = {
  name: "supervisor",
  description: "Enhanced supervisor agent that routes text, audio, and batch audio queries to sub-agents using LLM reasoning with long conversation context and GPT-4.1 audio transcription.",
  async run({ conversationId, input, params }: AgentRunInput): Promise<AgentRunResult> {
    const vectorStoreIds = (params as any)?.vectorStoreIds as string[] | undefined;
    let processedInput: string;
    let audioTranscriptionMetadata: any = {};

    // Handle different input types
    if (typeof input === 'string') {
      processedInput = input;
    } else if (input.type === 'audio') {
      // Handle single audio input
      processedInput = await processAudioInput(input, conversationId, vectorStoreIds);
      audioTranscriptionMetadata = {
        audioProcessed: true,
        audioType: 'single',
        mimeType: input.mimeType,
        metadata: input.metadata
      };
    } else if (input.type === 'batch_audio') {
      // Handle batch audio input
      processedInput = await processBatchAudioInput(input, conversationId, vectorStoreIds);
      audioTranscriptionMetadata = {
        audioProcessed: true,
        audioType: 'batch',
        chunksCount: input.audioChunks.length,
        processingMode: input.batchMetadata?.processingMode || 'sequential',
        totalDuration: input.batchMetadata?.totalDuration
      };
    } else {
      throw new Error(`Unsupported input type: ${typeof input}`);
    }

    // Make routing decision using the processed text input
    const system = [
      "You are a router that decides how to handle user input.",
      "If the user asks to use uploaded files or knowledge base, or if vector store ids are provided, choose 'rag'.",
      "Otherwise choose 'direct'.",
      "Return ONLY a compact JSON object with fields: {\"route\":\"direct\"|\"rag\",\"query\":\"...\"}.",
      "Do not add explanations."
    ].join(" ");

    const routingPrompt = [
      system,
      `User Input: ${processedInput}`,
      vectorStoreIds?.length ? `Vector Stores Provided: ${vectorStoreIds.join(",")}` : "Vector Stores Provided: none",
      "Output JSON now."
    ].join("\n");

    // Use a temporary conversation for routing to avoid polluting the main conversation context
    const routingConvId = await createConversation();
    const resp = await openai.responses.create({
      model: DEFAULT_MODEL,
      input: routingPrompt,
      conversation: routingConvId,
    });

    let decision: SupervisorDecision = { route: vectorStoreIds?.length ? "rag" : "direct", query: processedInput };
    try {
      const text = getOutputText(resp);
      const parsed = JSON.parse(text);
      decision = SupervisorDecisionSchema.parse(parsed);
    } catch {
      // Fallback to heuristic above
    }

    // Route to appropriate agent with transcribed text
    let result: AgentRunResult;
    if (decision.route === "rag") {
      result = await ragAgent.run({
        conversationId,
        input: decision.query,
        params: { vectorStoreIds },
      });
    } else {
      result = await directAgent.run({
        conversationId,
        input: decision.query,
        params,
      });
    }

    // Enhance result with audio processing metadata
    return {
      ...result,
      raw: {
        ...result.raw,
        supervisorMetadata: {
          routingDecision: decision,
          audioTranscription: audioTranscriptionMetadata,
          originalInputType: typeof input === 'string' ? 'text' : input.type
        }
      }
    };
  },
};

/**
 * Process single audio input using GPT-4.1 and new Responses API
 */
async function processAudioInput(
  audioInput: AudioInput, 
  conversationId: string, 
  vectorStoreIds?: string[]
): Promise<string> {
  console.log('🎤 [SUPERVISOR] Starting single audio input processing');
  console.log(`📊 [SUPERVISOR] Audio details: ${audioInput.mimeType}, ${audioInput.audioBuffer.length} bytes`);
  console.log(`📊 [SUPERVISOR] Metadata:`, audioInput.metadata);
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ [SUPERVISOR] OPENAI_API_KEY is missing');
    throw new Error("OPENAI_API_KEY is required for audio processing");
  }

  console.log('🔧 [SUPERVISOR] Initializing RealtimeAudioService with GPT-4.1');
  const audioService = new RealtimeAudioService({
    apiKey,
    model: "gpt-4.1",
    inputAudioTranscription: {
      model: "whisper-1"
    }
  });

  try {
    console.log('🔄 [SUPERVISOR] Starting audio transcription...');
    const startTime = Date.now();
    
    const transcript = await audioService.transcribeAudio(audioInput.audioBuffer, audioInput.mimeType);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ [SUPERVISOR] Audio transcription completed in ${duration}ms`);
    console.log(`📝 [SUPERVISOR] Transcript: "${transcript}"`);
    console.log(`📏 [SUPERVISOR] Transcript length: ${transcript?.length || 0} characters`);
    
    if (!transcript || transcript.trim().length === 0) {
      console.error('❌ [SUPERVISOR] Audio transcription resulted in empty text');
      throw new Error("Audio transcription resulted in empty text");
    }

    console.log('✅ [SUPERVISOR] Single audio processing completed successfully');
    return transcript;
  } catch (error) {
    console.error("❌ [SUPERVISOR] Audio processing failed:", error);
    console.error("❌ [SUPERVISOR] Error details:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      audioBufferSize: audioInput.audioBuffer.length,
      mimeType: audioInput.mimeType
    });
    throw new Error(`Audio transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Process batch audio input with different processing modes
 */
async function processBatchAudioInput(
  batchInput: BatchAudioInput, 
  conversationId: string, 
  vectorStoreIds?: string[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for batch audio processing");
  }

  const audioService = new RealtimeAudioService({
    apiKey,
    model: "gpt-4.1",
    inputAudioTranscription: {
      model: "whisper-1"
    }
  });

  const processingMode = batchInput.batchMetadata?.processingMode || 'sequential';
  const transcripts: string[] = [];

  try {
    if (processingMode === 'parallel') {
      // Process all audio chunks in parallel
      const transcriptionPromises = batchInput.audioChunks.map(async (chunk, index) => {
        try {
          const transcript = await audioService.transcribeAudio(chunk.audioBuffer, chunk.mimeType);
          return { index, transcript, timestamp: chunk.timestamp };
        } catch (error) {
          console.error(`Failed to transcribe audio chunk ${index}:`, error);
          return { index, transcript: '', timestamp: chunk.timestamp };
        }
      });

      const results = await Promise.all(transcriptionPromises);
      
      // Sort by original index to maintain order
      results.sort((a, b) => a.index - b.index);
      transcripts.push(...results.map(r => r.transcript).filter(t => t.trim().length > 0));

    } else if (processingMode === 'merged') {
      // Merge all audio chunks into a single buffer and process
      const mergedBuffer = Buffer.concat(batchInput.audioChunks.map(chunk => chunk.audioBuffer));
      const firstChunk = batchInput.audioChunks[0];
      
      if (firstChunk) {
        const transcript = await audioService.transcribeAudio(mergedBuffer, firstChunk.mimeType);
        if (transcript && transcript.trim().length > 0) {
          transcripts.push(transcript);
        }
      }

    } else {
      // Sequential processing (default)
      for (let i = 0; i < batchInput.audioChunks.length; i++) {
        const chunk = batchInput.audioChunks[i];
        try {
          const transcript = await audioService.transcribeAudio(chunk.audioBuffer, chunk.mimeType);
          if (transcript && transcript.trim().length > 0) {
            transcripts.push(transcript);
          }
        } catch (error) {
          console.error(`Failed to transcribe audio chunk ${i}:`, error);
          // Continue with next chunk
        }
      }
    }

    if (transcripts.length === 0) {
      throw new Error("No audio chunks could be successfully transcribed");
    }

    // Combine transcripts with appropriate separators
    return transcripts.join(' ').trim();

  } catch (error) {
    console.error("Batch audio processing failed:", error);
    throw new Error(`Batch audio transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
