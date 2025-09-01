import { z } from "zod";

export type AgentRunInput = {
  conversationId: string;
  input: string;
  // Optional contextual parameters agents may use
  params?: Record<string, unknown>;
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
