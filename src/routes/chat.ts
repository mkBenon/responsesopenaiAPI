import express from "express";
import { chatWithResponsesApi } from "../clients/azureOpenAI";

const router = express.Router();

/**
 * POST /chat
 * Body: {
 *   threadId: string,            // optional: your own session id
 *   vectorStoreId: string,       // optional: if provided, we pass as file_search tool
 *   previousResponseId: string,  // optional: for context
 *   input: string | object       // user input (string or array per Responses API)
 * }
 */
router.post("/", async (req, res) => {
  try {
    const { vectorStoreId, previousResponseId, input } = req.body;

    if (!input) {
      return res.status(400).json({ error: "input is required" });
    }

    const tools = vectorStoreId
      ? [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId],
          },
        ]
      : undefined;

    const response = await chatWithResponsesApi({
      input,
      previousResponseId,
      tools,
    });

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chat request failed" });
  }
});

export default router;
