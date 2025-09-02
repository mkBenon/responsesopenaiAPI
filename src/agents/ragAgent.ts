import { Agent, AgentRunInput, AgentRunResult } from "./types";
import { openai, DEFAULT_MODEL, getOutputText } from "../clients/openaiSdk";

/**
 * RAGAgent
 * - Uses OpenAI Vector Stores via file_search tool.
 * - Expects params.vectorStoreIds: string[] with at least one vector store id.
 * - Uses conversation id to maintain long context.
 */
export const ragAgent: Agent = {
  name: "rag",
  description: "Retrieval-augmented agent using OpenAI Vector Stores (file_search tool).",
  async run({ conversationId, input, params }: AgentRunInput): Promise<AgentRunResult> {
    // Ensure input is a string (supervisor agent should have processed audio inputs)
    if (typeof input !== 'string') {
      throw new Error('RAGAgent only accepts string inputs. Audio inputs should be processed by supervisor agent first.');
    }

    const vectorStoreIds = (params as any)?.vectorStoreIds as string[] | undefined;

    if (!vectorStoreIds || vectorStoreIds.length === 0) {
      throw new Error("RAG agent requires params.vectorStoreIds: string[]");
    }

    const resp = await openai.responses.create({
      model: DEFAULT_MODEL,
      input,
      conversation: conversationId,
      tools: [
        {
          type: "file_search",
          vector_store_ids: vectorStoreIds,
          // optionally you can pass filters / max_num_results here
        } as any,
      ],
    });

    return {
      conversationId,
      text: getOutputText(resp),
      raw: resp,
    };
  },
};
