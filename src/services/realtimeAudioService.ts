import { EventEmitter } from "events";

export interface RealtimeAudioConfig {
  apiKey: string;
  model?: string;
  voice?: string;
  inputAudioFormat?: string;
  outputAudioFormat?: string;
  inputAudioTranscription?: {
    model: string;
  };
}

export interface TranscriptionEvent {
  type: "conversation.item.input_audio_transcription.completed";
  item_id: string;
  content_index: number;
  transcript: string;
}

export interface AudioTranscriptEvent {
  type: "response.audio_transcript.delta" | "response.audio_transcript.done";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta?: string;
  transcript?: string;
}

/**
 * Realtime Audio Service based on OpenAI Realtime Agents patterns
 * Handles WebRTC connections, transcription, and streaming audio
 */
export class RealtimeAudioService extends EventEmitter {
  private config: RealtimeAudioConfig;
  private sessionToken: string | null = null;
  private isConnected: boolean = false;

  // Batch audio buffer for event-driven processing
  private batchAudioBuffer: Buffer[] = [];
  private batchMimeType: string | null = null;
  private batchContext: {
    conversationId?: string;
    vectorStoreIds?: string[];
    previousResponseId?: string;
  } | null = null;

  constructor(config: RealtimeAudioConfig) {
    super();
    this.config = {
      model: "gpt-4o-realtime-preview-2025-06-03",
      voice: "alloy",
      inputAudioFormat: "pcm16",
      outputAudioFormat: "pcm16",
      inputAudioTranscription: {
        model: "whisper-1"
      },
      ...config
    };
  }

  /**
   * Start a new batch for audio processing.
   * Clears the internal buffer and sets context.
   */
  startBatch(mimeType: string, context: {
    conversationId?: string;
    vectorStoreIds?: string[];
    previousResponseId?: string;
  }) {
    this.batchAudioBuffer = [];
    this.batchMimeType = mimeType;
    this.batchContext = context;
    this.emit("batch_started");
  }

  /**
   * Append an audio chunk to the current batch.
   */
  appendAudioChunk(chunk: Buffer) {
    this.batchAudioBuffer.push(chunk);
    this.emit("batch_chunk_appended", chunk);
  }

  /**
   * Commit the current batch: process the accumulated audio buffer.
   * Emits events for transcription and streaming response.
   */
  async commitBatch() {
    if (!this.batchAudioBuffer.length || !this.batchMimeType || !this.batchContext) {
      throw new Error("No batch started or batch is empty");
    }
    const audioBuffer = Buffer.concat(this.batchAudioBuffer);
    const mimeType = this.batchMimeType;
    const context = this.batchContext;

    // Step 1: Transcribe audio
    const transcript = await this.transcribeAudio(audioBuffer, mimeType);
    this.emit("transcription_completed", { transcript });

    // Step 2: Process transcribed text with context
    const responseStream = await this.processTextWithContext(transcript, context);

    // Emit streaming response events
    (async () => {
      for await (const chunk of responseStream) {
        this.emit("streaming_response", chunk);
      }
      this.emit("streaming_response_done");
    })();

    // Reset batch state
    this.batchAudioBuffer = [];
    this.batchMimeType = null;
    this.batchContext = null;
  }

  /**
   * Create ephemeral session token for realtime API
   */
  async createSession(): Promise<string> {
    try {
      const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          voice: this.config.voice,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
      }

      const session = await response.json();
      this.sessionToken = session.client_secret.value;
      return this.sessionToken!;
    } catch (error) {
      console.error("Failed to create realtime session:", error);
      throw error;
    }
  }

  /**
   * Process audio file and return transcription
   * This is a fallback method for when WebRTC is not available
   */
  async transcribeAudio(audioBuffer: Buffer, mimeType: string = "audio/webm"): Promise<string> {
    try {
      // Convert audio to format suitable for Whisper
      const formData = new FormData();
      const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-1");
      formData.append("language", "en");

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return result.text || "";
    } catch (error) {
      console.error("Audio transcription failed:", error);
      throw error;
    }
  }

  /**
   * Process transcribed text with context and return streaming response
   */
  /**
   * Direct (non-batch) text processing.
   * This method is independent of the batch API and does not use or modify batch state.
   */
  async processTextWithContext(
    text: string, 
    context: {
      conversationId?: string;
      vectorStoreIds?: string[];
      previousResponseId?: string;
      instructions?: string;
    }
  ): Promise<AsyncGenerator<{ type: string; data: any }, void, unknown>> {
    console.log("[RealtimeAudioService] processTextWithContext called (direct, non-batch)");
    // Defensive: ensure batch state is not used
    if (this.batchAudioBuffer.length > 0) {
      console.warn("[RealtimeAudioService] Warning: batch buffer is not empty during direct processTextWithContext call. Clearing batch buffer.");
      this.batchAudioBuffer = [];
      this.batchMimeType = null;
      this.batchContext = null;
    }
    try {
      // Build tools array if vector stores are provided
      const tools = context.vectorStoreIds?.length ? [
        {
          type: "file_search",
          vector_store_ids: context.vectorStoreIds,
        },
      ] : undefined;

      // Use the Responses API with streaming
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model?.replace("-realtime-preview-2025-06-03", "") || "gpt-4.1",
          input: text,
          instructions: context.instructions || "You are a helpful assistant.",
          tools,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Responses API failed: ${response.status} ${response.statusText}`);
      }

      return this.parseStreamingResponse(response);
    } catch (error) {
      console.error("Text processing failed:", error);
      throw error;
    }
  }

  /**
   * Parse streaming response from OpenAI API
   */
  private async *parseStreamingResponse(response: Response): AsyncGenerator<{ type: string; data: any }, void, unknown> {
    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              // Handle different response types
              if (parsed.choices?.[0]?.delta?.content) {
                yield {
                  type: "text_delta",
                  data: { text: parsed.choices[0].delta.content }
                };
              } else if (parsed.choices?.[0]?.message?.content) {
                yield {
                  type: "final",
                  data: { text: parsed.choices[0].message.content }
                };
              }
            } catch (parseError) {
              console.warn("Failed to parse streaming data:", parseError, data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle complete audio processing workflow:
   * 1. Transcribe audio
   * 2. Process with context
   * 3. Return streaming response
   */
  async processAudio(
    audioBuffer: Buffer,
    mimeType: string,
    context: {
      conversationId?: string;
      vectorStoreIds?: string[];
      previousResponseId?: string;
    }
  ): Promise<{
    transcript: string;
    responseStream: AsyncGenerator<{ type: string; data: any }, void, unknown>;
  }> {
    // Step 1: Transcribe audio
    const transcript = await this.transcribeAudio(audioBuffer, mimeType);
    
    // Step 2: Process transcribed text with context
    const responseStream = await this.processTextWithContext(transcript, context);

    return {
      transcript,
      responseStream
    };
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Clean up resources
   */
  disconnect(): void {
    this.isConnected = false;
    this.sessionToken = null;
    this.removeAllListeners();
  }
}
