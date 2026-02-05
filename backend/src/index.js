/**
 * AgentPulse Backend Server
 *
 * Main Express application serving the API
 * and running autonomous agent in background
 * 
 * Now with Solana integration! 🔗
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import AutonomousAgent from "./agents/autonomousAgent.js";
import { SolanaService } from "./services/solanaService.js";
import { Logger } from "./utils/logger.js";
import { DatabaseService } from "./services/database.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const logger = new Logger("Server");

// Initialize services
const db = new DatabaseService();
global.dbInstance = db;
logger.info("✅ Database service initialized");

const solana = new SolanaService();
global.solanaInstance = solana;
logger.info("✅ Solana service initialized");

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://agentpulse-frontend.vercel.app",
      "https://agentpulse.vercel.app"
    ],
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

// ============================================
// HEALTH & STATUS ENDPOINTS
// ============================================

/**
 * GET /health
 * Health check with agent and Solana status
 */
app.get("/health", async (req, res) => {
  const solanaStats = solana.getStats();
  
  res.json({
    status: "ok",
    agent: agent ? agent.getStats() : null,
    solana: {
      network: solanaStats.network,
      walletConfigured: solanaStats.walletConfigured,
      onChainLogs: solanaStats.totalMemoLogs,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/stats
 * Get detailed agent statistics
 */
app.get("/api/stats", (req, res) => {
  if (!agent) {
    return res.status(503).json({ error: "Agent not running" });
  }

  res.json(agent.getStats());
});

// ============================================
// SOLANA ENDPOINTS
// ============================================

/**
 * GET /api/solana/status
 * Get Solana network status and agent wallet info
 */
app.get("/api/solana/status", async (req, res) => {
  try {
    const [networkStatus, walletBalance] = await Promise.all([
      solana.getNetworkStatus(),
      solana.canWrite() ? solana.getAgentWalletBalance() : null,
    ]);

    res.json({
      network: networkStatus,
      wallet: walletBalance,
      stats: solana.getStats(),
    });
  } catch (error) {
    logger.error("Error getting Solana status:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/solana/balance/:address
 * Get SOL balance for any wallet address
 */
app.get("/api/solana/balance/:address", async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!solana.isValidAddress(address)) {
      return res.status(400).json({ error: "Invalid Solana address" });
    }

    const balance = await solana.getWalletBalance(address);
    res.json(balance);
  } catch (error) {
    logger.error("Error getting balance:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/solana/transactions/:address
 * Get recent transactions for a wallet
 */
app.get("/api/solana/transactions/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 10 } = req.query;
    
    if (!solana.isValidAddress(address)) {
      return res.status(400).json({ error: "Invalid Solana address" });
    }

    const transactions = await solana.getRecentTransactions(address, parseInt(limit));
    res.json({ address, transactions });
  } catch (error) {
    logger.error("Error getting transactions:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/solana/tx/:signature
 * Get transaction details
 */
app.get("/api/solana/tx/:signature", async (req, res) => {
  try {
    const { signature } = req.params;
    const transaction = await solana.getTransaction(signature);
    
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json(transaction);
  } catch (error) {
    logger.error("Error getting transaction:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/solana/agent-wallet
 * Get agent's wallet info and recent activity
 */
app.get("/api/solana/agent-wallet", async (req, res) => {
  try {
    if (!solana.canWrite()) {
      return res.json({
        configured: false,
        message: "No wallet configured for agent",
      });
    }

    const [balance, transactions] = await Promise.all([
      solana.getAgentWalletBalance(),
      solana.getRecentTransactions(solana.walletPublicKey, 5),
    ]);

    res.json({
      configured: true,
      address: solana.walletPublicKey,
      balance,
      recentTransactions: transactions,
      explorerUrl: `https://solscan.io/account/${solana.walletPublicKey}?cluster=${solana.network}`,
    });
  } catch (error) {
    logger.error("Error getting agent wallet:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/solana/on-chain-logs
 * Get all on-chain logs from agent's memo transactions
 */
app.get("/api/solana/on-chain-logs", async (req, res) => {
  try {
    // Get from database
    const logs = await db.pool.query(`
      SELECT * FROM autonomy_log 
      WHERE solana_tx IS NOT NULL 
      ORDER BY created_at DESC 
      LIMIT 50
    `);

    res.json({
      logs: logs.rows,
      totalOnChain: solana.getStats().totalMemoLogs,
    });
  } catch (error) {
    logger.error("Error getting on-chain logs:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/solana/airdrop
 * Request devnet airdrop (testing only)
 */
app.post("/api/solana/airdrop", async (req, res) => {
  try {
    if (solana.network !== "devnet") {
      return res.status(400).json({ error: "Airdrop only available on devnet" });
    }

    if (!solana.canWrite()) {
      return res.status(400).json({ error: "No wallet configured" });
    }

    const { amount = 1 } = req.body;
    const signature = await solana.requestAirdrop(amount);

    res.json({
      success: true,
      signature,
      amount,
      explorerUrl: solana.getExplorerUrl(signature),
    });
  } catch (error) {
    logger.error("Airdrop failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AGENT CONTROL ENDPOINTS
// ============================================

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

// ============================================
// DATA ENDPOINTS
// ============================================

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
    const logs = await db.pool.query(`
      SELECT * FROM autonomy_log 
      ORDER BY created_at DESC 
      LIMIT $1
    `, [parseInt(limit)]);
    
    res.json({ logs: logs.rows });
  } catch (error) {
    logger.error("Error fetching autonomy log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

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

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  logger.info(`🚀 AgentPulse server running on port ${PORT}`);
  logger.info(`📊 Dashboard: ${process.env.FRONTEND_URL || "http://localhost:5173"}`);
  logger.info(`🤖 Autonomous agent: ${agent ? "RUNNING" : "DISABLED"}`);
  logger.info(`🔗 Solana: ${solana.network} (write: ${solana.canWrite() ? "enabled" : "disabled"})`);
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
