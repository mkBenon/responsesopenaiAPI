import { z } from "zod";

export type AgentRunInput = {
  conversationId: string;
  input: string | AudioInput | BatchAudioInput;
  // Optional contextual parameters agents may use
  params?: Record<string, unknown>;
};

// Audio input types for enhanced supervisor agent
export type AudioInput = {
  type: 'audio';
  audioBuffer: Buffer;
  mimeType: string;
  metadata?: {
    duration?: number;
    sampleRate?: number;
    channels?: number;
  };
};

export type BatchAudioInput = {
  type: 'batch_audio';
  audioChunks: Array<{
    audioBuffer: Buffer;
    mimeType: string;
    timestamp?: number;
    metadata?: {
      duration?: number;
      sampleRate?: number;
      channels?: number;
    };
  }>;
  batchMetadata?: {
    totalDuration?: number;
    processingMode?: 'sequential' | 'parallel' | 'merged';
  };
};

export type AgentRunResult = {
  conversationId: string;
  text: string;
  raw: any;
};

export interface Agent {
  readonly name: string;
  readonly description: string;
  run(args: AgentRunInput): Promise<AgentRunResult>;
}

// Simple schema for supervisor routing decision
export const SupervisorDecisionSchema = z.object({
  route: z.enum(["direct", "rag"]),
  // The rephrased or extracted query to pass to the chosen agent
  query: z.string(),
});
export type SupervisorDecision = z.infer<typeof SupervisorDecisionSchema>;
