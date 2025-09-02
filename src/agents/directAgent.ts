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
    // Ensure input is a string (supervisor agent should have processed audio inputs)
    if (typeof input !== 'string') {
      throw new Error('DirectAgent only accepts string inputs. Audio inputs should be processed by supervisor agent first.');
    }

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
