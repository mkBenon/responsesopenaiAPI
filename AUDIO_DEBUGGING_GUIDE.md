# Audio Transcription Debugging Guide

## Overview

This guide explains how to debug audio transcription issues using the comprehensive console logging that has been added to the enhanced supervisor agent system.

## Console Log Flow

When you use the microphone on the frontend, you should see a detailed flow of console logs that help track the audio processing pipeline.

### Expected Log Flow

#### 1. Server Request Reception
```
🌐 [SERVER] 2025-01-09T20:52:00.000Z - POST /agents/supervisor
🎤 [SERVER] Audio-capable endpoint accessed
📊 [SERVER] Content-Type: multipart/form-data; boundary=----formdata-...
📊 [SERVER] Content-Length: 12345
```

#### 2. Agents Route Processing
```
🚀 [AGENTS_ROUTE] POST /agents/supervisor - Request received
📊 [AGENTS_ROUTE] Request details: {
  hasTextInput: false,
  hasAudioFile: true,
  audioFileSize: 12345,
  audioMimeType: 'audio/webm',
  conversationId: undefined,
  vectorStoreIds: undefined,
  targetAgent: undefined
}
✅ [AGENTS_ROUTE] Created new conversation: conv_1234567890abcdef
🎤 [AGENTS_ROUTE] Processing audio file with enhanced supervisor agent
📊 [AGENTS_ROUTE] Audio file details: audio/webm, 12345 bytes
🔧 [AGENTS_ROUTE] Created AudioInput for supervisor agent
🧠 [AGENTS_ROUTE] Using enhanced supervisor agent for routing decision
```

#### 3. Supervisor Agent Processing
```
🎤 [SUPERVISOR] Starting single audio input processing
📊 [SUPERVISOR] Audio details: audio/webm, 12345 bytes
📊 [SUPERVISOR] Metadata: { originalFilename: 'audio.webm', size: 12345 }
🔧 [SUPERVISOR] Initializing RealtimeAudioService with GPT-4.1
🔄 [SUPERVISOR] Starting audio transcription...
```

#### 4. Audio Service Transcription
```
🎙️ [AUDIO_SERVICE] Starting audio transcription
📊 [AUDIO_SERVICE] Input details: audio/webm, 12345 bytes
🔧 [AUDIO_SERVICE] Preparing FormData for OpenAI Whisper API
🌐 [AUDIO_SERVICE] Sending request to OpenAI Whisper API
🔗 [AUDIO_SERVICE] Endpoint: https://api.openai.com/v1/audio/transcriptions
🔑 [AUDIO_SERVICE] Using API key: sk-proj-abc...
⏱️ [AUDIO_SERVICE] API request completed in 1234ms
📡 [AUDIO_SERVICE] Response status: 200 OK
✅ [AUDIO_SERVICE] Parsing JSON response
📝 [AUDIO_SERVICE] Raw API response: { text: "Hello, how are you today?" }
📝 [AUDIO_SERVICE] Extracted transcript: "Hello, how are you today?"
📏 [AUDIO_SERVICE] Transcript length: 25 characters
✅ [AUDIO_SERVICE] Audio transcription completed successfully
```

#### 5. Supervisor Agent Completion
```
✅ [SUPERVISOR] Audio transcription completed in 1234ms
📝 [SUPERVISOR] Transcript: "Hello, how are you today?"
📏 [SUPERVISOR] Transcript length: 25 characters
✅ [SUPERVISOR] Single audio processing completed successfully
```

#### 6. Final Response
```
✅ [AGENTS_ROUTE] Supervisor agent processing completed
📊 [AGENTS_ROUTE] Supervisor metadata: {
  routingDecision: { route: 'direct', query: 'Hello, how are you today?' },
  audioTranscription: {
    audioProcessed: true,
    audioType: 'single',
    mimeType: 'audio/webm',
    metadata: { originalFilename: 'audio.webm', size: 12345 }
  },
  originalInputType: 'audio'
}
✅ [AGENTS_ROUTE] Request completed successfully
📝 [AGENTS_ROUTE] Response preview: {
  conversationId: 'conv_1234567890abcdef',
  agent: 'supervisor',
  textLength: 50,
  audioProcessed: true
}
```

## Troubleshooting Common Issues

### Issue 1: No Audio File Detected
**Symptoms:**
```
📊 [AGENTS_ROUTE] Request details: {
  hasTextInput: false,
  hasAudioFile: false,
  audioFileSize: 0,
  audioMimeType: undefined
}
❌ [AGENTS_ROUTE] No input provided (neither text nor audio)
```

**Possible Causes:**
- Frontend not sending audio data properly
- Multer middleware not configured correctly
- Audio recording not working in browser

### Issue 2: API Key Missing
**Symptoms:**
```
❌ [SUPERVISOR] OPENAI_API_KEY is missing
```

**Solution:**
- Check your `.env` file has `OPENAI_API_KEY=sk-...`
- Restart the server after adding the API key

### Issue 3: Audio Transcription Fails
**Symptoms:**
```
❌ [AUDIO_SERVICE] Transcription failed: 400 Bad Request
❌ [AUDIO_SERVICE] Error response body: {"error": {"message": "Invalid file format"}}
```

**Possible Causes:**
- Unsupported audio format
- Corrupted audio data
- Audio file too large (>25MB limit)

### Issue 4: Empty Transcription
**Symptoms:**
```
⚠️ [AUDIO_SERVICE] Warning: Transcription returned empty text
❌ [SUPERVISOR] Audio transcription resulted in empty text
```

**Possible Causes:**
- Audio contains no speech
- Audio quality too poor
- Audio too quiet or distorted

### Issue 5: Network/API Issues
**Symptoms:**
```
❌ [AUDIO_SERVICE] Transcription failed: 429 Too Many Requests
```

**Possible Causes:**
- Rate limiting from OpenAI API
- Network connectivity issues
- API quota exceeded

## Testing Audio Transcription

### Manual Testing Steps

1. **Start the Server**
   ```bash
   npm run dev
   ```
   Look for: `Server running on port 3000`

2. **Open Frontend**
   Navigate to `http://localhost:3000`

3. **Test Microphone**
   - Click the microphone button
   - Speak clearly for 2-3 seconds
   - Stop recording
   - Watch console logs for the expected flow

4. **Verify Logs**
   Check that you see all the expected log sections:
   - ✅ Server request reception
   - ✅ Agents route processing
   - ✅ Supervisor agent processing
   - ✅ Audio service transcription
   - ✅ Final response

### Automated Testing

Run the test suite to verify the enhanced functionality:
```bash
node test-audio-supervisor.js
```

Expected output includes successful tests for:
- Single audio input processing
- Batch audio input processing
- Text input backward compatibility
- Audio + RAG routing
- Different processing modes

## Log Filtering

To focus on specific components, you can filter logs:

```bash
# Filter for audio-related logs only
npm run dev | grep -E "\[AUDIO_SERVICE\]|\[SUPERVISOR\]"

# Filter for route-level logs
npm run dev | grep "\[AGENTS_ROUTE\]"

# Filter for server-level logs
npm run dev | grep "\[SERVER\]"
```

## Performance Monitoring

Key metrics to watch:

- **Audio File Size**: Should be reasonable (< 1MB for short recordings)
- **Transcription Time**: Typically 500-2000ms depending on audio length
- **API Response Time**: Should be < 5 seconds for most requests
- **Memory Usage**: Monitor for memory leaks with large audio files

## Configuration Verification

Ensure your environment is properly configured:

```bash
# Check environment variables
echo $OPENAI_API_KEY

# Verify API key format
echo $OPENAI_API_KEY | grep -E "^sk-"

# Test API connectivity
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://api.openai.com/v1/models
```

## Advanced Debugging

For deeper debugging, you can:

1. **Enable Node.js Debug Mode**
   ```bash
   DEBUG=* npm run dev
   ```

2. **Add Custom Breakpoints**
   Add `debugger;` statements in the code and run with:
   ```bash
   node --inspect-brk dist/index.js
   ```

3. **Monitor Network Traffic**
   Use browser dev tools to inspect the multipart form data being sent

4. **Test with Different Audio Formats**
   Try different audio formats to isolate format-specific issues

## Success Indicators

A successful audio transcription should show:
- ✅ All log sections present
- ✅ Non-zero audio file size
- ✅ Valid API response (200 OK)
- ✅ Non-empty transcript text
- ✅ Proper routing decision
- ✅ Final response with audioProcessed: true

## Getting Help

If you're still experiencing issues after following this guide:

1. Copy the complete console log output
2. Note the specific error messages
3. Check the browser console for frontend errors
4. Verify your audio recording setup works in other applications

The comprehensive logging system will help identify exactly where in the pipeline the issue occurs, making it much easier to diagnose and fix audio transcription problems.
