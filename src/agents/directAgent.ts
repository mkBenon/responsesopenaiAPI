import { Agent, AgentRunInput, AgentRunResult } from "./types";
import { openai, DEFAULT_MODEL, getOutputText } from "../clients/openaiSdk";

/**
 * DirectAgent
 * - General-purpose assistant with long conversation context via `conversation` parameter.
 * - No tools; ideal for chit-chat or generic queries.
 */
export const directAgent: Agent = {
  name: "direct",
  description: "General-purpose assistant without tools; uses long context via conversation id.",
  async run({ conversationId, input }: AgentRunInput): Promise<AgentRunResult> {
    const resp = await openai.responses.create({
      model: DEFAULT_MODEL,
      input,
      conversation: conversationId,
    });

    return {
      conversationId,
      text: getOutputText(resp),
      raw: resp,
    };
  },
};
