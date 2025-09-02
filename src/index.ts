import express from "express";
import dotenv from "dotenv";
import vectorStoreRoutes from "./routes/vectorStores";
import chatRoutes from "./routes/chat";
import fileRoutes from "./routes/files";
import agentsRoutes from "./routes/agents";
import realtimeRoutes from "./routes/realtime";

dotenv.config();

const app = express();

// Add logging middleware for audio debugging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`🌐 [SERVER] ${timestamp} - ${req.method} ${req.path}`);
  
  // Log audio-related requests with more detail
  if (req.path.includes('/agents') && req.method === 'POST') {
    console.log('🎤 [SERVER] Audio-capable endpoint accessed');
    console.log('📊 [SERVER] Content-Type:', req.get('Content-Type'));
    console.log('📊 [SERVER] Content-Length:', req.get('Content-Length'));
  }
  
  next();
});

app.use(express.json());

// Static frontend
app.use(express.static("public"));

// Routes
app.use("/vector-stores", vectorStoreRoutes);
app.use("/vector-stores", fileRoutes); // nested under /vector-stores/:id/files
app.use("/chat", chatRoutes);
app.use("/agents", agentsRoutes);
app.use("/api", realtimeRoutes); // realtime session management

// Health
app.get("/healthz", (_, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${PORT}`);
});
