import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

/**
 * OpenAI Agents/Responses SDK client
 * - Uses OPENAI_API_KEY (required)
 * - Optional OPENAI_API_BASE_URL (defaults to https://api.openai.com/v1)
 * - Optional OPENAI_MODEL (defaults to gpt-4.1)
 */
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY must be set in environment variables");
}

const baseURL = process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1";
export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

// OpenAI SDK client
export const openai = new OpenAI({
  apiKey,
  baseURL,
});

// Helper to extract output text from a Responses API response (SDK convenience or manual)
export function getOutputText(resp: any): string {
  // SDK convenience field (present in many examples)
  if (typeof resp?.output_text === "string") return resp.output_text;

  // Manual fallback: traverse output array
  const output = resp?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item?.type === "message" && Array.isArray(item.content)) {
        const textPart = item.content.find((c: any) => c?.type === "output_text" && typeof c.text === "string");
        if (textPart) return textPart.text;
      }
      if (item?.type === "output_text" && typeof item?.text === "string") {
        return item.text;
      }
    }
  }
  // As last resort, JSON stringify
  return JSON.stringify(resp);
}

/**
 * Create a new conversation using the Agents SDK so we can pass a valid conversation id
 * (must start with "conv_") to Responses API calls to maintain long context.
 */
export async function createConversation(): Promise<string> {
  const conv: any = await (openai as any).conversations.create({});
  return conv.id as string;
}
