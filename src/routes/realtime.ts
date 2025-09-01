import express from "express";
import OpenAI from "openai";

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /realtime/session
 * Creates an ephemeral session for the OpenAI Realtime API
 * This follows the pattern from the OpenAI realtime agents repository
 */
router.post("/session", async (req, res) => {
  try {
    // Create ephemeral session for realtime API using direct HTTP call
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2025-06-03",
        voice: "alloy",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const session = await response.json();

    res.json({
      client_secret: {
        value: session.client_secret.value,
      },
    });
  } catch (error) {
    console.error("Failed to create realtime session:", error);
    res.status(500).json({ 
      error: "Failed to create realtime session",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;
