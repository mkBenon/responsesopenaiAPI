# Frontend Audio Integration Test Guide

## Issue Diagnosis

Based on the terminal logs you provided, when you click "Start Mic", the frontend is making GET requests to `/vector-stores/` endpoints instead of POST requests to `/agents/supervisor`. This suggests the audio recording isn't being triggered properly.

## Step-by-Step Testing

### 1. First, Create an Assistant

Before testing audio, you need to create an assistant:

1. **Open the frontend**: Navigate to `http://localhost:3000`
2. **Create a new assistant**:
   - In the "Assistant name" field (right panel), enter: `Test Assistant`
   - Click "New Assistant" button
   - You should see a notification: "Assistant created in demo mode (API unavailable)"
   - The assistant should appear in the left panel and be automatically selected

### 2. Test Audio Recording

Now test the microphone:

1. **Click "Start Mic"** button
2. **Check browser console** (F12 → Console tab) for these logs:
   ```
   🎤 [FRONTEND] Record button clicked
   🎤 [FRONTEND] Current state - mediaRecorder: false
   🎤 [FRONTEND] Active assistant ID: [some-id]
   🎤 [FRONTEND] Selected assistant: {id: "...", name: "Test Assistant", ...}
   🎤 [FRONTEND] Requesting microphone permission...
   ```

3. **Allow microphone access** when browser prompts
4. **Speak for 2-3 seconds**
5. **Click "Stop Mic"**
6. **Check server terminal** for the expected log flow

## Expected Log Flow

### Frontend Console (F12 → Console)
```
🎤 [FRONTEND] Record button clicked
🎤 [FRONTEND] Current state - mediaRecorder: false
🎤 [FRONTEND] Active assistant ID: abc123
🎤 [FRONTEND] Selected assistant: {id: "abc123", name: "Test Assistant", ...}
🎤 [FRONTEND] Requesting microphone permission...
Audio chunk received: 1234 bytes
Recording stopped, processing audio...
Audio blob created: 5678 bytes, type: audio/webm
Sending audio to realtime service... {fileName: "recording.webm", fileSize: 5678, ...}
```

### Server Terminal
```
🌐 [SERVER] 2025-01-09T20:52:00.000Z - POST /agents/supervisor/stream
🎤 [SERVER] Audio-capable endpoint accessed
📊 [SERVER] Content-Type: multipart/form-data; boundary=----formdata-...
🚀 [AGENTS_ROUTE] POST /agents/supervisor/stream - Request received
📊 [AGENTS_ROUTE] Request details: { hasAudioFile: true, audioFileSize: 5678, ... }
🎤 [SUPERVISOR] Starting single audio input processing
🎙️ [AUDIO_SERVICE] Starting audio transcription
📝 [AUDIO_SERVICE] Extracted transcript: "Hello, this is a test"
✅ [AGENTS_ROUTE] Request completed successfully
```

## Troubleshooting

### Issue 1: No Assistant Selected
**Symptoms**: 
- Frontend console shows: `❌ [FRONTEND] No assistant selected`
- Notification: "Please select an assistant first"

**Solution**: Create and select an assistant first (see step 1 above)

### Issue 2: Microphone Permission Denied
**Symptoms**:
- Browser shows permission denied
- Frontend console shows microphone access error

**Solution**: 
- Allow microphone access in browser
- Check browser settings for microphone permissions
- Try refreshing the page and clicking "Start Mic" again

### Issue 3: No Audio Data
**Symptoms**:
- Frontend console shows: "No audio data recorded"
- No server logs appear

**Solution**:
- Ensure microphone is working (test in other apps)
- Speak louder and closer to microphone
- Try a different browser (Chrome/Firefox)

### Issue 4: Server Not Receiving Audio
**Symptoms**:
- Frontend logs show audio being sent
- No server logs appear

**Solution**:
- Check that server is running on correct port (3000)
- Verify no firewall blocking requests
- Check browser network tab for failed requests

## Manual Verification

If the above doesn't work, try this manual test:

1. **Open browser developer tools** (F12)
2. **Go to Network tab**
3. **Click "Start Mic"** → speak → **Click "Stop Mic"**
4. **Look for a POST request** to `/agents/supervisor/stream`
5. **Check the request details**:
   - Method should be POST
   - Content-Type should be multipart/form-data
   - Should contain audio file data

## Common Issues

### The GET requests to `/vector-stores/` you're seeing are normal
These happen when:
- The page loads (loading assistants and files)
- You create a new assistant
- You refresh the page

The audio requests should be **POST** requests to `/agents/supervisor/stream`.

### If you still don't see POST requests:
1. **Check browser console for JavaScript errors**
2. **Verify assistant is selected** (should show in left panel with blue border)
3. **Try creating a new assistant** if the current one seems broken
4. **Clear browser cache** and reload the page

## Success Indicators

You'll know it's working when you see:
- ✅ Frontend console shows audio recording and sending
- ✅ Server terminal shows POST to `/agents/supervisor/stream`
- ✅ Server logs show audio processing pipeline
- ✅ Transcribed text appears in chat
- ✅ AI response appears after transcription

Let me know what you see in the browser console when you click "Start Mic" - that will help identify exactly where the issue is occurring.
