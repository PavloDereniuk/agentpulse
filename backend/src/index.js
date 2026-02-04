/**
 * AgentPulse Backend Server
 *
 * Main Express application serving the API
 * and running autonomous agent in background
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import AutonomousAgent from "./agents/autonomousAgent.js";
import { Logger } from "./utils/logger.js";
import { DatabaseService } from "./services/database.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const logger = new Logger("Server");

// Initialize database and make it globally available
const db = new DatabaseService();
global.dbInstance = db;

logger.info("✅ Database service initialized");

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Initialize autonomous agent
let agent;
if (process.env.AUTO_POST_ENABLED === "true") {
  agent = new AutonomousAgent();
  agent.start().catch((err) => {
    logger.error("Failed to start autonomous agent:", err);
  });
}

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    agent: agent ? agent.getStats() : null,
    timestamp: new Date().toISOString(),
  });
});

// API Routes

/**
 * GET /api/stats
 * Get agent statistics
 */
app.get("/api/stats", (req, res) => {
  if (!agent) {
    return res.status(503).json({ error: "Agent not running" });
  }

  res.json(agent.getStats());
});

/**
 * POST /api/trigger-analysis
 * Manually trigger hourly analysis (for testing)
 */
app.post("/api/trigger-analysis", async (req, res) => {
  if (!agent) {
    return res.status(503).json({ error: "Agent not running" });
  }

  try {
    logger.info("🧪 Manual analysis trigger requested");
    await agent.runHourlyAnalysis();
    res.json({
      success: true,
      message: "Analysis triggered",
      stats: agent.getStats(),
    });
  } catch (error) {
    logger.error("Manual analysis failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/projects
 * Get all projects with analytics
 */
app.get("/api/projects", async (req, res) => {
  try {
    // Implementation needed
    res.json({ projects: [] });
  } catch (error) {
    logger.error("Error fetching projects:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/agents
 * Get agent network data
 */
app.get("/api/agents", async (req, res) => {
  try {
    // Implementation needed
    res.json({ agents: [] });
  } catch (error) {
    logger.error("Error fetching agents:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/insights
 * Get latest insights
 */
app.get("/api/insights", async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    // Implementation needed
    res.json({ insights: [] });
  } catch (error) {
    logger.error("Error fetching insights:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/trends
 * Get trending topics and patterns
 */
app.get("/api/trends", async (req, res) => {
  try {
    // Implementation needed
    res.json({ trends: [] });
  } catch (error) {
    logger.error("Error fetching trends:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/predictions
 * Get leaderboard predictions
 */
app.get("/api/predictions", async (req, res) => {
  try {
    // Implementation needed
    res.json({ predictions: [] });
  } catch (error) {
    logger.error("Error fetching predictions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/autonomy-log
 * Get autonomy log entries
 */
app.get("/api/autonomy-log", async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    // Implementation needed
    res.json({ logs: [] });
  } catch (error) {
    logger.error("Error fetching autonomy log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Error handling
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 AgentPulse server running on port ${PORT}`);
  logger.info(
    `📊 Dashboard: ${process.env.FRONTEND_URL || "http://localhost:5173"}`,
  );
  logger.info(`🤖 Autonomous agent: ${agent ? "RUNNING" : "DISABLED"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully...");
  if (agent) agent.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully...");
  if (agent) agent.stop();
  process.exit(0);
});

export default app;
