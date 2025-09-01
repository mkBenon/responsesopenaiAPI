import { Agent, AgentRunInput, AgentRunResult, SupervisorDecisionSchema, SupervisorDecision } from "./types";
import { openai, DEFAULT_MODEL, getOutputText, createConversation } from "../clients/openaiSdk";
import { directAgent } from "./directAgent";
import { ragAgent } from "./ragAgent";

/**
 * SupervisorAgent
 * - Uses the model to decide whether to route to the Direct agent or the RAG agent.
 * - Passes through the conversation id to maintain long-context.
 * - If vectorStoreIds are present in params, it tends to choose RAG.
 * - Adding new agents: extend the routing logic and registry below.
 */
export const supervisorAgent: Agent = {
  name: "supervisor",
  description: "Routes queries to sub-agents (direct, rag, etc.) using LLM reasoning with long conversation context.",
  async run({ conversationId, input, params }: AgentRunInput): Promise<AgentRunResult> {
    // Basic heuristics: if explicit vector store ids provided, prefer rag.
    const vectorStoreIds = (params as any)?.vectorStoreIds as string[] | undefined;

    // Ask the model to make/confirm the decision in structured JSON.
    const system = [
      "You are a router that decides how to handle user input.",
      "If the user asks to use uploaded files or knowledge base, or if vector store ids are provided, choose 'rag'.",
      "Otherwise choose 'direct'.",
      "Return ONLY a compact JSON object with fields: {\"route\":\"direct\"|\"rag\",\"query\":\"...\"}.",
      "Do not add explanations."
    ].join(" ");

    const routingPrompt = [
      system,
      `User Input: ${input}`,
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

    let decision: SupervisorDecision = { route: vectorStoreIds?.length ? "rag" : "direct", query: String(input) };
    try {
      const text = getOutputText(resp);
      const parsed = JSON.parse(text);
      decision = SupervisorDecisionSchema.parse(parsed);
    } catch {
      // Fallback to heuristic above
    }

    if (decision.route === "rag") {
      return await ragAgent.run({
        conversationId,
        input: decision.query,
        params: { vectorStoreIds },
      });
    } else {
      return await directAgent.run({
        conversationId,
        input: decision.query,
        params,
      });
    }
  },
};
