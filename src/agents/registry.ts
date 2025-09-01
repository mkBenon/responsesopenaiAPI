import { directAgent } from "./directAgent";
import { ragAgent } from "./ragAgent";
import { supervisorAgent } from "./supervisorAgent";
import type { Agent } from "./types";

export const agents = {
  direct: directAgent,
  rag: ragAgent,
  supervisor: supervisorAgent,
} as const;

export type AgentName = keyof typeof agents;

export function getAgent(name: AgentName): Agent {
  return agents[name];
}

export function listAgents(): { name: AgentName; description: string }[] {
  return (Object.keys(agents) as AgentName[]).map((name) => ({
    name,
    description: agents[name].description,
  }));
}
