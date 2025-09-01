import axios, { AxiosInstance } from "axios";
import dotenv from "dotenv";
dotenv.config();

/**
 * OpenAI (non-Azure) client using the Responses API + Vector Stores.
 * - Requires OPENAI_API_KEY in the environment.
 * - Optional OPENAI_API_BASE_URL (defaults to https://api.openai.com/v1)
 * - Optional OPENAI_MODEL (defaults to gpt-4.1)
 *
 * This file replaces the previous Azure-specific configuration while keeping the same exports
 * so existing route imports continue to work.
 */

const {
  OPENAI_API_KEY,
  OPENAI_API_BASE_URL,
  OPENAI_MODEL,
} = process.env;

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set in environment variables");
}

const BASE_URL = OPENAI_API_BASE_URL || "https://api.openai.com/v1";
const DEFAULT_MODEL = OPENAI_MODEL || "gpt-4.1";

/**
 * Base Axios instance for OpenAI calls.
 */
const openai: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// ------------------------------------------------------------
// Vector Store helpers
// ------------------------------------------------------------
export async function createVectorStore(name: string) {
  const res = await openai.post("/vector_stores", { name });
  return res.data;
}

export async function listVectorStores() {
  const res = await openai.get("/vector_stores");
  return res.data;
}

export async function listVectorStoreFiles(vectorStoreId: string) {
  const res = await openai.get(`/vector_stores/${vectorStoreId}/files`);
  return res.data;
}

export async function addFileToVectorStore(
  vectorStoreId: string,
  fileId: string
) {
  // Associates an existing uploaded file with a vector store
  const res = await openai.post(`/vector_stores/${vectorStoreId}/files`, {
    file_id: fileId,
  });
  return res.data;
}

// ------------------------------------------------------------
// Chat / Responses helpers
// ------------------------------------------------------------
interface ChatOptions {
  input: unknown;
  previousResponseId?: string;
  tools?: unknown[];
  instructions?: string;
  model?: string;
  conversation?: string;
}

/**
 * Calls the OpenAI Responses API (stateful) with optional previousResponseId for context.
 * You can embed the vectorStoreId in the `tools` array or reference fileIds in `input`.
 */
export async function chatWithResponsesApi({
  input,
  previousResponseId,
  tools,
  instructions,
  model,
  conversation,
}: ChatOptions) {
  const body: Record<string, unknown> = {
    model: model || DEFAULT_MODEL,
    input,
  };
  if (instructions) body.instructions = instructions;
  if (previousResponseId) body.previous_response_id = previousResponseId;
  if (conversation) body.conversation = conversation;
  if (tools) body.tools = tools;

  const res = await openai.post("/responses", body);
  return res.data;
}

export default openai;
