# OpenAI Agents Server (Direct, RAG, Supervisor) with Streaming (SSE)

This project provides a modular Agents architecture on top of the OpenAI Responses API and Vector Stores, featuring:
- Agents: direct, rag, supervisor (router)
- Long-context conversations via `conversation` parameter (conv_* IDs)
- File Search grounded RAG using official Vector Stores
- Whisper audio transcription support in the supervisor route
- Server-Sent Events (SSE) streaming for real-time token output

## Endpoints

- POST /vector-stores
- GET /vector-stores
- GET /vector-stores/:id/files
- POST /vector-stores/:id/files (multipart)
- POST /chat (non-agent, basic Responses API wrapper)
- POST /agents/supervisor (JSON or multipart with audio) — non-streaming
- POST /agents/supervisor/stream (JSON or multipart with audio) — SSE streaming

## Environment

Required:
- OPENAI_API_KEY

Optional:
- OPENAI_API_BASE_URL (default: https://api.openai.com/v1)
- OPENAI_MODEL (default: gpt-4.1)
- OPENAI_TRANSCRIPTION_MODEL (default: whisper-1)
- PORT (default: 3000)

## Agents

- direct: general assistant (no tools)
- rag: Retrieval-Augmented via Vector Stores (`file_search` tool). Requires `vectorStoreIds: string[]`
- supervisor: routes to direct or rag using LLM reasoning. Heuristic falls back to rag when `vectorStoreIds` provided.

## Conversations

If no `conversationId` is supplied, the server automatically creates one using `openai.conversations.create()` and passes the conv_* id into Responses API calls to enable long-context.

---

## Streaming via SSE

New endpoint:
POST /agents/supervisor/stream

- Accepts JSON or multipart/form-data (for audio + optional text).
- Streams incremental model output via Server-Sent Events (SSE).

SSE event types:
- conversation: { conversationId }
- transcript:   { text }
- routing:      { route, query }
- text_delta:   { text }
- final:        { conversationId, agent, text, raw }
- error:        { error }
- done:         {}

Notes:
- For RAG, pass `vectorStoreIds: string[]` either top-level or within `params.vectorStoreIds`.
- Use `targetAgent` to bypass supervisor routing (e.g., "direct" or "rag").

### cURL: Stream text (supervisor routing)

```
curl -N -X POST http://localhost:3000/agents/supervisor/stream \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Summarize the main points of our previous discussion.",
    "conversationId": "conv_existing_if_any"
  }'
```

- `-N` disables buffering so you see SSE events live.

### cURL: Stream text with RAG (supervisor will select rag)

```
curl -N -X POST http://localhost:3000/agents/supervisor/stream \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Using the uploaded knowledge base, what is the refund policy?",
    "vectorStoreIds": ["vs_12345"]
  }'
```

### cURL: Stream text targeting direct agent explicitly

```
curl -N -X POST http://localhost:3000/agents/supervisor/stream \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Tell me a joke about TypeScript.",
    "targetAgent": "direct"
  }'
```

### cURL: Stream text targeting rag agent explicitly

```
curl -N -X POST http://localhost:3000/agents/supervisor/stream \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Answer using the knowledge base documents.",
    "targetAgent": "rag",
    "vectorStoreIds": ["vs_12345"]
  }'
```

### cURL: Stream audio transcription + LLM response (supervisor routing)

```
curl -N -X POST http://localhost:3000/agents/supervisor/stream \
  -H "Transfer-Encoding: chunked" \
  -F "audio=@/path/to/audio.wav" \
  -F 'input=Please use this audio and provide a concise summary.'
```

- The server transcribes with Whisper. The `input` (if provided) and transcript are combined.

---

## Non-Streaming (existing)

POST /agents/supervisor

- Accepts JSON or multipart (audio).
- Returns a single JSON response:
  ```
  {
    "conversationId": "conv_*",
    "transcribedText": "...",
    "agent": "supervisor|direct|rag",
    "text": "final text output",
    "raw": { ...full response... }
  }
  ```

### cURL: Non-streaming JSON

```
curl -X POST http://localhost:3000/agents/supervisor \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Hello world",
    "conversationId": "conv_existing_if_any"
  }'
```

### cURL: Non-streaming with RAG

```
curl -X POST http://localhost:3000/agents/supervisor \
  -H "Content-Type: application/json" \
  -d '{
    "input": "What do the docs say about setup?",
    "vectorStoreIds": ["vs_12345"]
  }'
```

### cURL: Non-streaming audio

```
curl -X POST http://localhost:3000/agents/supervisor \
  -H "Transfer-Encoding: chunked" \
  -F "audio=@/path/to/audio.wav" \
  -F 'input=Please summarize the audio'
```

---

## Implementation Notes

- Streaming uses `openai.responses.stream({ ... })` with `for await` iteration to emit `response.output_text.delta` as `text_delta` SSE events.
- After the stream completes, the server sends a `final` event with the full `raw` response and extracted text via `getOutputText`.
- Supervisor routing is performed non-streaming to compute a decision, then the chosen agent stream (direct or rag) is started.
- `conversationId` is emitted first so the client can persist thread state.

## Roadmap / Next Steps

- WebSocket streaming (in addition to SSE)
- Persistence for user -> conversation mapping (MongoDB)
- RAG controls: metadata filters, `max_num_results`, include detailed `file_search` results
- Additional agents (tools/function-calling agent, web-search agent)
- LangGraph integration for multi-step workflows
- Harden error handling, retries, request validation, and auth middleware
