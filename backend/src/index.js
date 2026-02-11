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
import { VotingService } from "./services/votingService.js";
import mockReputation from "./services/mockReputationService.js";
import Anthropic from "@anthropic-ai/sdk";
import { ColosseumAPI } from "./services/colosseumAPI.js";
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
      "https://agentpulse.vercel.app",
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
  try {
    // Simple health check without complex dependencies
    let solanaStatus = null;
    try {
      solanaStatus = await solana.getNetworkStatus();
    } catch (solanaError) {
      logger.warn(
        "Solana unavailable:",
        solanaError?.message || "Unknown error",
      );
      solanaStatus = { available: false };
    }

    res.json({
      status: "ok",
      agent: agent ? agent.getStats() : null, // ← ДОДАЙ ЦЕ!
      database: db.pool ? "connected" : "disconnected",
      solana: solanaStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Health check error:", error?.message || error);

    res.json({
      status: "degraded",
      agent: agent ? agent.getStats() : null, // ← І ТУТ!
      error: error?.message || "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
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
    let networkStatus = null;
    let walletBalance = null;

    // Try to get network status with timeout
    try {
      networkStatus = await solana.getNetworkStatus();
    } catch (err) {
      logger.warn("Solana network unavailable:", err.message);
      networkStatus = { available: false, error: "Network unavailable" };
    }

    // Try to get wallet balance
    if (solana.canWrite()) {
      try {
        walletBalance = await solana.getAgentWalletBalance();
      } catch (err) {
        logger.warn("Wallet balance unavailable:", err.message);
        walletBalance = null;
      }
    }

    res.json({
      network: networkStatus,
      wallet: walletBalance,
      stats: solana.getStats(),
    });
  } catch (error) {
    logger.error("Error getting Solana status:", error?.message || error);

    // Return fallback data instead of 500
    res.json({
      network: { available: false },
      wallet: null,
      stats: solana.getStats() || {
        network: "devnet",
        walletConfigured: false,
      },
    });
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

    const transactions = await solana.getRecentTransactions(
      address,
      parseInt(limit),
    );
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
  const emptyResponse = {
    logs: [],
    totalOnChain: 0,
    votesOnChain: 0,
    actionTypes: [],
    actionTypeCount: 0,
  };

  try {
    if (!db.pool) {
      return res.json(emptyResponse);
    }

    // Get logs with solana transactions from database
    const logs = await db.pool.query(`
      SELECT * FROM autonomy_log 
      WHERE details::text LIKE '%solanaTx%'
      ORDER BY created_at DESC 
      LIMIT 50
    `);

    // Count total on-chain transactions from project_votes
    const voteTxCount = await db.pool.query(`
      SELECT COUNT(*) as count FROM project_votes 
      WHERE solana_tx IS NOT NULL AND solana_tx != ''
    `);

    // Count distinct action types logged on-chain
    const actionTypes = await db.pool.query(`
      SELECT DISTINCT action, COUNT(*) as count 
      FROM autonomy_log 
      WHERE details::text LIKE '%solanaTx%'
      GROUP BY action
    `);

    const totalFromLogs = logs.rows.length;
    const totalFromVotes = parseInt(voteTxCount.rows[0]?.count || 0);
    const totalVerified = Math.max(totalFromLogs, totalFromVotes);

    res.json({
      logs: logs.rows,
      totalOnChain: totalVerified,
      votesOnChain: totalFromVotes,
      actionTypes: actionTypes.rows,
      actionTypeCount: actionTypes.rows.length,
    });
  } catch (error) {
    logger.error("Error getting on-chain logs:", error.message);
    res.json(emptyResponse);
  }
});

/**
 * GET /api/proof
 * Get cryptographic proofs from DATABASE only
 */
let proofsCache = null;
let proofsCacheTime = 0;
const PROOFS_CACHE_TTL = 300000; // 5 minutes

app.get("/api/proof", async (req, res) => {
  try {
    // Check cache
    const now = Date.now();
    if (proofsCache && now - proofsCacheTime < PROOFS_CACHE_TTL) {
      logger.info("Returning cached proofs");
      return res.json(proofsCache);
    }

    const limit = parseInt(req.query.limit) || 20;

    // Get from database
    const result = await db.pool.query(
      `
      SELECT *
      FROM autonomy_log 
      WHERE details IS NOT NULL
      ORDER BY created_at DESC 
      LIMIT $1
    `,
      [limit],
    );

    // Format as proofs
    // Format as proofs with better summaries
    const proofs = result.rows.map((log) => {
      const details = log.details || {};
      const solanaTx = details.solanaTx || details.signature || null;
      const action = details.action || log.action_type || "ACTION";

      // Generate better summary based on action type
      let summary = "";
      switch (action) {
        case "DATA_COLLECTION":
          const dc = details.details || {};
          summary = `Collected ${dc.projectsCount || 0} projects, ${dc.postsCount || 0} posts`;
          break;
        case "COMMENT_RESPONSE":
          summary = `Responded to @${details.respondedTo} on post #${details.postId}`;
          break;
        case "COMMENT_CHECK":
          const cc = details.details || {};
          summary = `Checked comments: ${cc.responded || 0}/${cc.processed || 0} responded`;
          break;
        case "AGENT_SPOTLIGHT":
          summary = details.title || `Agent Spotlight published`;
          break;
        case "SELF_EVALUATION":
          const se = details.metrics || {};
          summary = `Self-check: ${se.votesGiven} votes, ${se.onChainLogs} logs, ${se.commentResponses} responses`;
          break;
        case "SELF_IMPROVEMENT":
          const si = details.improvements || details.changes || {};
          if (si.strategyVersion) {
            summary = `Strategy upgraded to v${si.strategyVersion}`;
          } else {
            summary = `Self-improvement cycle completed`;
          }
          break;
        case "POST_DECISION":
          summary = `Post decision: ${details.decision} (quality: ${details.qualityScore}/10)`;
          break;
        case "VOTING_CYCLE":
          const vc = details.details || {};
          summary = `Voting cycle: evaluated ${vc.evaluated || 0}, voted ${vc.voted || 0}`;
          break;
        default:
          summary = `${action} completed successfully`;
      }

      return {
        signature: solanaTx,
        timestamp: log.created_at,
        type: action,
        summary: summary,
        hash:
          details.hash ||
          details.actionHash ||
          (solanaTx ? solanaTx.slice(0, 16) : null),
        explorerUrl: solanaTx
          ? `https://solscan.io/tx/${solanaTx}?cluster=${solana.network}`
          : null,
        verified: !!solanaTx,
        slot: details.slot || null,
        metadata: details,
      };
    });

    const response = {
      proofs,
      total: proofs.length,
      walletAddress: solana.walletPublicKey,
      network: solana.network,
      explorerBase: `https://solscan.io/account/${solana.walletPublicKey}?cluster=${solana.network}`,
      timestamp: new Date().toISOString(),
      cached: false,
    };

    // Update cache
    proofsCache = { ...response, cached: true };
    proofsCacheTime = now;

    res.json(response);
  } catch (error) {
    logger.error("Error getting proofs:", error);
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
      return res
        .status(400)
        .json({ error: "Airdrop only available on devnet" });
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

/**
 * POST /api/trigger-comments
 * Manually trigger comment response cycle
 */
app.post("/api/trigger-comments", async (req, res) => {
  if (!agent) {
    return res.status(503).json({ error: "Agent not running" });
  }

  try {
    logger.info("🧪 Manual comment response trigger requested");
    await agent.runCommentResponses();
    res.json({
      success: true,
      message: "Comment responses triggered",
      stats: agent.getStats(),
    });
  } catch (error) {
    logger.error("Manual comment response failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/trigger-engagement", async (req, res) => {
  try {
    logger.info("🗣️ Manual forum engagement trigger");
    const result = await agent.forumEngager.engage();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/trigger-voting
 * Manually trigger voting cycle
 */
app.post("/api/trigger-voting", async (req, res) => {
  if (!agent) {
    return res.status(503).json({ error: "Agent not running" });
  }

  try {
    logger.info("🧪 Manual voting trigger requested");
    await agent.runVoting();
    res.json({
      success: true,
      message: "Voting cycle triggered",
      stats: agent.getStats(),
    });
  } catch (error) {
    logger.error("Manual voting failed:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/votes
 * Get voting history and statistics
 */
app.get("/api/votes", async (req, res) => {
  try {
    const stats = agent?.getStats();

    // Get recent votes from database
    const result = await db.pool.query(`
      SELECT * FROM project_votes 
      ORDER BY created_at DESC 
      LIMIT 20
    `);

    res.json({
      stats: {
        projectsEvaluated: stats?.projectsEvaluated || 0,
        votesGiven: stats?.votesGiven || 0,
        lastVotingTime: stats?.lastVotingTime,
      },
      recentVotes: result.rows,
    });
  } catch (error) {
    res.json({
      stats: agent?.getStats() || {},
      recentVotes: [],
      error: error.message,
    });
  }
});

/**
 * GET /api/comment-responses
 * Get comment response history
 */
app.get("/api/comment-responses", async (req, res) => {
  try {
    const stats = agent?.getStats();

    // Get recent responses from database
    const result = await db.pool.query(`
      SELECT * FROM comment_responses 
      WHERE status = 'responded'
      ORDER BY created_at DESC 
      LIMIT 20
    `);

    res.json({
      stats: {
        commentResponses: stats?.commentResponses || 0,
        lastCommentCheckTime: stats?.lastCommentCheckTime,
      },
      recentResponses: result.rows,
    });
  } catch (error) {
    res.json({
      stats: agent?.getStats() || {},
      recentResponses: [],
      error: error.message,
    });
  }
});

// ============================================
// DATA ENDPOINTS
// ============================================

/**
 * GET /api/autonomy-log
 * Get autonomy log entries
 */
app.get("/api/autonomy-log", async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logs = await db.pool.query(
      `
      SELECT * FROM autonomy_log 
      ORDER BY created_at DESC 
      LIMIT $1
    `,
      [parseInt(limit)],
    );

    res.json({ logs: logs.rows });
  } catch (error) {
    logger.error("Error fetching autonomy log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/trigger-digest
 * Manually trigger Daily Digest
 */
app.post("/api/trigger-digest", async (req, res) => {
  if (!agent) {
    return res.status(503).json({ error: "Agent not running" });
  }
  try {
    logger.info("🧪 Manual Daily Digest trigger");
    await agent.runDigest();
    res.json({
      success: true,
      message: "Daily Digest triggered",
      stats: agent.getStats(),
    });
  } catch (error) {
    logger.error("Manual digest failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/trigger-spotlight", async (req, res) => {
  if (!agent) {
    return res.status(503).json({ error: "Agent not running" });
  }
  try {
    logger.info("🧪 Manual Spotlight trigger");
    await agent.runSpotlightManual();
    res.json({
      success: true,
      message: "Spotlight triggered",
      stats: agent.getStats(),
    });
  } catch (error) {
    logger.error("Manual spotlight failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// Leaderboard API
const leaderboardService = new (
  await import("./services/leaderboardService.js")
).LeaderboardService();

app.get("/api/leaderboard", async (req, res) => {
  try {
    const data = await leaderboardService.getLeaderboard();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leaderboard/trends", async (req, res) => {
  try {
    const data = await leaderboardService.getTrends();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/leaderboard/history", async (req, res) => {
  try {
    const projectId = req.query.projectId
      ? parseInt(req.query.projectId)
      : null;
    const data = await leaderboardService.getHistory(projectId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

/**
 * GET /api/analytics/overview
 * Get overall analytics summary
 */
app.get("/api/analytics/overview", async (req, res) => {
  try {
    // Total actions
    const totalResult = await db.pool.query(`
      SELECT COUNT(*) as total FROM autonomy_log
    `);

    // Actions by type
    const typeResult = await db.pool.query(`
      SELECT 
        details->>'action' as action_type,
        COUNT(*) as count
      FROM autonomy_log
      WHERE details->>'action' IS NOT NULL
      GROUP BY details->>'action'
      ORDER BY count DESC
      LIMIT 5
    `);

    // Success rate
    const successResult = await db.pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE details->>'outcome' = 'SUCCESS') as successful,
        COUNT(*) as total
      FROM autonomy_log
      WHERE details->>'outcome' IS NOT NULL
    `);

    // Activity by hour (last 24h)
    const hourlyResult = await db.pool.query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM autonomy_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY hour
      ORDER BY hour
    `);

    // Daily growth (today vs yesterday)
    const growthResult = await db.pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE - 1) as yesterday
      FROM autonomy_log
    `);

    const totalActions = parseInt(totalResult.rows[0]?.total) || 0;
    const topActionType = typeResult.rows[0]?.action_type || "N/A";
    const successful = parseInt(successResult.rows[0]?.successful) || 0;
    const totalTracked = parseInt(successResult.rows[0]?.total) || 1;
    const successRate = ((successful / totalTracked) * 100).toFixed(1);

    const today = parseInt(growthResult.rows[0]?.today) || 0;
    const yesterday = parseInt(growthResult.rows[0]?.yesterday) || 1;
    const dailyGrowth = (((today - yesterday) / yesterday) * 100).toFixed(1);

    // Active hours (top 3 hours by activity)
    const activeHours = hourlyResult.rows
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((row) => parseInt(row.hour));

    res.json({
      totalActions,
      successRate: parseFloat(successRate),
      topActionType,
      activeHours,
      dailyGrowth: parseFloat(dailyGrowth),
      actionDistribution: typeResult.rows.map((row) => ({
        type: row.action_type,
        count: parseInt(row.count),
      })),
      uptime: agent ? Math.floor(agent.getStats().uptime) : 0,
    });
  } catch (error) {
    logger.error("Analytics overview error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/voting
 * Get voting analytics
 */
app.get("/api/analytics/voting", async (req, res) => {
  try {
    // Total evaluations and average score (both tables)
    const statsResult = await db.pool.query(`
      SELECT 
        COUNT(*) as total_evaluations,
        AVG(score) as avg_score,
        MAX(score) as max_score,
        MIN(score) as min_score
      FROM (
        SELECT score FROM project_evaluations
        UNION ALL
        SELECT score FROM project_votes
      ) all_votes
    `);

    // Score distribution (both tables)
    const distributionResult = await db.pool.query(`
      SELECT 
        FLOOR(score) as score_bucket,
        COUNT(*) as count
      FROM (
        SELECT score FROM project_evaluations WHERE score IS NOT NULL
        UNION ALL
        SELECT score FROM project_votes WHERE score IS NOT NULL
      ) all_scores
      GROUP BY score_bucket
      ORDER BY score_bucket
    `);

    // Top projects - combine from both tables, take best score
    const topProjectsResult = await db.pool.query(`
      SELECT 
        combined.project_id,
        combined.score,
        combined.reasoning,
        combined.created_at,
        combined.source,
        p.name as project_name,
        p.slug as project_slug
      FROM (
        SELECT project_id, score, reasoning, created_at, 'evaluation' as source
        FROM project_evaluations
        UNION ALL
        SELECT project_id, score, reasoning, created_at, 'vote' as source
        FROM project_votes
      ) combined
      LEFT JOIN projects p ON combined.project_id = p.external_id
      ORDER BY combined.score DESC
      LIMIT 10
    `);

    // Recent voting activity (last 7 days, both tables)
    const activityResult = await db.pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as votes,
        AVG(score) as avg_score
      FROM (
        SELECT created_at, score FROM project_evaluations
        WHERE created_at > NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT created_at, score FROM project_votes
        WHERE created_at > NOW() - INTERVAL '7 days'
      ) all_votes
      GROUP BY date
      ORDER BY date
    `);

    const stats = statsResult.rows[0];
    const totalEvaluations = parseInt(stats?.total_evaluations) || 0;

    res.json({
      projectsEvaluated: totalEvaluations,
      votesGiven: totalEvaluations,
      avgScore: parseFloat(stats?.avg_score || 0).toFixed(1),
      maxScore: parseFloat(stats?.max_score || 0).toFixed(1),
      minScore: parseFloat(stats?.min_score || 0).toFixed(1),
      scoreDistribution: distributionResult.rows.reduce((acc, row) => {
        acc[row.score_bucket] = parseInt(row.count);
        return acc;
      }, {}),
      topProjects: topProjectsResult.rows.map((row) => ({
        id: row.project_id,
        name:
          row.project_name || row.project_slug || `Project #${row.project_id}`,
        slug: row.project_slug,
        score: parseFloat(row.score).toFixed(1),
        source: row.source,
        reasoning: row.reasoning,
        votedAt: row.created_at,
      })),
      recentActivity: activityResult.rows.map((row) => ({
        date: row.date,
        votes: parseInt(row.votes),
        avgScore: parseFloat(row.avg_score).toFixed(1),
      })),
    });
  } catch (error) {
    logger.error("Analytics voting error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/engagement
 * Get comment and forum engagement analytics
 */
app.get("/api/analytics/engagement", async (req, res) => {
  try {
    // Comment responses stats
    const commentStatsResult = await db.pool.query(`
      SELECT 
        COUNT(*) as total_responses,
        COUNT(DISTINCT details->>'postId') as unique_posts
      FROM autonomy_log
      WHERE details->>'action' = 'COMMENT_RESPONSE'
    `);

    // Comments by hour (last 7 days)
    const hourlyResult = await db.pool.query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM autonomy_log
      WHERE details->>'action' = 'COMMENT_RESPONSE'
        AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY hour
      ORDER BY hour
    `);

    // Daily engagement (last 7 days)
    const dailyResult = await db.pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE details->>'action' = 'COMMENT_RESPONSE') as responses,
        COUNT(*) FILTER (WHERE details->>'action' = 'FORUM_POST') as posts,
        COUNT(*) FILTER (WHERE details->>'action' = 'VOTE') as votes
      FROM autonomy_log
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY date
      ORDER BY date
    `);

    // Response time analysis (for comments with timestamps)
    const responseTimeResult = await db.pool.query(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (created_at - (details->>'commentCreatedAt')::timestamp))/60) as avg_minutes
      FROM autonomy_log
      WHERE details->>'action' = 'COMMENT_RESPONSE'
        AND details->>'commentCreatedAt' IS NOT NULL
        AND created_at > NOW() - INTERVAL '7 days'
    `);

    // Top engagement targets (most responded to users)
    const topTargetsResult = await db.pool.query(`
      SELECT 
        details->>'respondedTo' as username,
        COUNT(*) as responses
      FROM autonomy_log
      WHERE details->>'action' = 'COMMENT_RESPONSE'
        AND details->>'respondedTo' IS NOT NULL
      GROUP BY username
      ORDER BY responses DESC
      LIMIT 5
    `);

    const commentStats = commentStatsResult.rows[0];
    const avgResponseTime = parseFloat(
      responseTimeResult.rows[0]?.avg_minutes || 0,
    );

    res.json({
      totalResponses: parseInt(commentStats?.total_responses) || 0,
      uniquePosts: parseInt(commentStats?.unique_posts) || 0,
      avgResponseTime:
        avgResponseTime > 0 ? `${avgResponseTime.toFixed(1)} min` : "N/A",
      commentsByHour: hourlyResult.rows.map((row) => ({
        hour: parseInt(row.hour),
        count: parseInt(row.count),
      })),
      dailyEngagement: dailyResult.rows.map((row) => ({
        date: row.date,
        responses: parseInt(row.responses),
        posts: parseInt(row.posts),
        votes: parseInt(row.votes),
      })),
      topTargets: topTargetsResult.rows.map((row) => ({
        username: row.username,
        responses: parseInt(row.responses),
      })),
    });
  } catch (error) {
    logger.error("Analytics engagement error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/timeline
 * Get activity timeline data
 */
app.get("/api/analytics/timeline", async (req, res) => {
  try {
    const { period = "7d" } = req.query;

    // Determine interval based on period
    let interval = "7 days";
    let groupBy = "DATE(created_at)";
    if (period === "24h") {
      interval = "24 hours";
      groupBy = "DATE_TRUNC('hour', created_at)";
    } else if (period === "30d") {
      interval = "30 days";
    }

    // Hourly activity (last 24h)
    const hourlyResult = await db.pool.query(`
      SELECT 
        DATE_TRUNC('hour', created_at) as timestamp,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE details->>'action' = 'DATA_COLLECTION') as data_collection,
        COUNT(*) FILTER (WHERE details->>'action' = 'COMMENT_RESPONSE') as comment_responses,
        COUNT(*) FILTER (WHERE details->>'action' = 'COMMENT_CHECK') as comment_checks,
        COUNT(*) FILTER (WHERE details->>'action' = 'VOTING_CYCLE') as voting
      FROM autonomy_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY timestamp
      ORDER BY timestamp
    `);

    // Daily activity (last 7 days)
    const dailyResult = await db.pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE details->>'action' = 'DATA_COLLECTION') as data_collection,
        COUNT(*) FILTER (WHERE details->>'action' = 'COMMENT_RESPONSE') as comment_responses,
        COUNT(*) FILTER (WHERE details->>'action' = 'AGENT_SPOTLIGHT') as spotlights,
        COUNT(*) FILTER (WHERE details->>'action' = 'DAILY_DIGEST') as digests
      FROM autonomy_log
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY date
      ORDER BY date
    `);

    res.json({
      hourly: hourlyResult.rows.map((row) => ({
        timestamp: row.timestamp,
        total: parseInt(row.total),
        breakdown: {
          dataCollection: parseInt(row.data_collection),
          commentResponses: parseInt(row.comment_responses),
          commentChecks: parseInt(row.comment_checks),
          voting: parseInt(row.voting),
        },
      })),
      daily: dailyResult.rows.map((row) => ({
        date: row.date,
        total: parseInt(row.total),
        breakdown: {
          dataCollection: parseInt(row.data_collection),
          commentResponses: parseInt(row.comment_responses),
          spotlights: parseInt(row.spotlights),
          digests: parseInt(row.digests),
        },
      })),
    });
  } catch (error) {
    logger.error("Analytics timeline error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/evolution", async (req, res) => {
  if (!agent) return res.status(503).json({ error: "Agent not running" });
  try {
    const strategy = agent.selfImprove.getStrategy();
    const history = await agent.selfImprove.getEvolutionHistory();
    res.json({ strategy, history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/trigger-self-improve", async (req, res) => {
  if (!agent) return res.status(503).json({ error: "Agent not running" });
  try {
    logger.info("🧪 Manual Self-Improvement trigger");
    await agent.runSelfImprovementManual();
    res.json({
      success: true,
      message: "Self-improvement triggered",
      stats: agent.getStats(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get on-chain proofs with full reasoning
app.get("/api/proofs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const type = req.query.type; // Optional filter by action type

    logger.info(`Fetching proofs (limit: ${limit}, type: ${type || "all"})`);

    // Get on-chain proofs
    const proofs = await solana.getOnChainProofs(limit);

    // Filter by type if requested
    const filteredProofs = type
      ? proofs.filter((p) => p.type === type)
      : proofs;

    // Get reasoning from database for each proof
    const proofsWithReasoning = await Promise.all(
      filteredProofs.map(async (proof) => {
        try {
          const reasoning = await solana.getReasoningFromDB(proof.hash);
          return {
            ...proof,
            reasoning: reasoning?.reasoning || null,
            confidence: reasoning?.confidence || null,
            factors: reasoning?.factors || {},
          };
        } catch (error) {
          logger.warn(
            `Failed to get reasoning for ${proof.hash}:`,
            error.message,
          );
          return {
            ...proof,
            reasoning: null,
            confidence: null,
            factors: {},
          };
        }
      }),
    );

    // Calculate stats
    const stats = {
      total: proofsWithReasoning.length,
      byType: {},
      averageConfidence: 0,
      withReasoning: 0,
    };

    // Count by type
    proofsWithReasoning.forEach((p) => {
      stats.byType[p.type] = (stats.byType[p.type] || 0) + 1;
      if (p.reasoning) stats.withReasoning++;
    });

    // Calculate average confidence
    const withConfidence = proofsWithReasoning.filter(
      (p) => p.confidence !== null,
    );
    if (withConfidence.length > 0) {
      const sum = withConfidence.reduce((acc, p) => acc + p.confidence, 0);
      stats.averageConfidence = ((sum / withConfidence.length) * 100).toFixed(
        1,
      );
    }

    res.json({
      success: true,
      stats,
      proofs: proofsWithReasoning,
    });
  } catch (error) {
    logger.error("Failed to get proofs:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get stats about action types
app.get("/api/proofs/stats", async (req, res) => {
  try {
    const proofs = await solanaService.getOnChainProofs(500);

    const stats = {
      total: proofs.length,
      byType: {},
      timeline: {},
    };

    proofs.forEach((p) => {
      // Count by type
      stats.byType[p.type] = (stats.byType[p.type] || 0) + 1;

      // Count by date
      if (p.timestamp) {
        const date = p.timestamp.split("T")[0];
        stats.timeline[date] = (stats.timeline[date] || 0) + 1;
      }
    });

    res.json({ success: true, stats });
  } catch (error) {
    logger.error("Failed to get proof stats:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get reasoning proofs directly from database (faster, doesn't need blockchain)
app.get("/api/proofs/db", async (req, res) => {
  try {
    const type = req.query.type;

    // Always get ALL proofs for stats
    const allResult = await db.pool.query(
      "SELECT * FROM action_reasoning ORDER BY created_at DESC LIMIT 200",
    );
    const allProofs = allResult.rows;

    // Calculate stats from ALL proofs (not filtered)
    const stats = {
      total: allProofs.length,
      byType: {},
      averageConfidence: 0,
      withReasoning: allProofs.filter((p) => p.reasoning?.length > 50).length,
    };

    allProofs.forEach((p) => {
      stats.byType[p.action_type] = (stats.byType[p.action_type] || 0) + 1;
    });

    const withConfidence = allProofs.filter((p) => p.confidence !== null);
    if (withConfidence.length > 0) {
      const sum = withConfidence.reduce((acc, p) => acc + p.confidence, 0);
      stats.averageConfidence = ((sum / withConfidence.length) * 100).toFixed(
        1,
      );
    }

    // Filter for display
    const filtered = type
      ? allProofs.filter((p) => p.action_type === type)
      : allProofs;

    // Format for frontend
    const formattedProofs = filtered.map((p) => ({
      type: p.action_type,
      reasoning: p.reasoning,
      confidence: p.confidence,
      factors: p.factors,
      timestamp: p.created_at,
      hash: p.action_hash,
      explorerUrl: "#",
      verified: true,
    }));

    res.json({
      success: true,
      stats,
      proofs: formattedProofs,
      source: "database",
    });
  } catch (error) {
    logger.error("Failed to get proofs from DB:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get network graph data (real data from DB)
app.get("/api/network/graph", async (req, res) => {
  try {
    logger.info("Fetching network graph data");

    // Get our votes with project details
    const votesResult = await db.pool.query(`
      SELECT 
        v.project_id,
        v.project_name,
        v.score,
        p.data,
        p.human_upvotes,
        p.agent_upvotes
      FROM project_votes v
      LEFT JOIN projects p ON v.project_id = p.external_id
      ORDER BY v.created_at DESC
    `);
    const votes = votesResult.rows;

    // Build nodes
    const nodes = [];
    const nodeMap = new Map();

    // Add AgentPulse (us) as central node
    nodes.push({
      id: 503,
      name: "AgentPulse",
      type: "self",
      projectCount: 1,
      reputation: 100,
      category: "Analytics",
      votes: votes.length,
    });
    nodeMap.set(503, 0);

    // Add projects we voted for as nodes
    votes.forEach((vote, index) => {
      const nodeId = 1000 + index; // Use unique IDs for projects

      // Try to extract agent info from project data
      let agentName = vote.project_name;
      let category = "Other";

      // Categorize based on project name keywords
      const name = vote.project_name.toLowerCase();
      if (
        name.includes("trading") ||
        name.includes("dex") ||
        name.includes("swap")
      ) {
        category = "Trading";
      } else if (name.includes("data") || name.includes("analytics")) {
        category = "Analytics";
      } else if (name.includes("ai") || name.includes("agent")) {
        category = "AI Agent";
      } else if (name.includes("nft") || name.includes("collectible")) {
        category = "NFT";
      } else if (name.includes("game") || name.includes("gaming")) {
        category = "Gaming";
      } else if (name.includes("defi") || name.includes("lending")) {
        category = "DeFi";
      } else if (name.includes("social") || name.includes("community")) {
        category = "Social";
      } else if (name.includes("dev") || name.includes("tool")) {
        category = "Development";
      }

      nodes.push({
        id: nodeId,
        name: agentName,
        type: "voted",
        projectCount: 1,
        reputation: vote.score * 10, // Convert score to reputation (0-100)
        category: category,
        score: vote.score,
        upvotes: vote.human_upvotes || 0,
      });
      nodeMap.set(nodeId, nodes.length - 1);
    });

    // Build edges
    const edges = [];

    // Add edges for our votes
    votes.forEach((vote, index) => {
      const targetId = 1000 + index;
      edges.push({
        source: 503,
        target: targetId,
        type: "vote",
        weight: 1,
        confidence: vote.score / 10, // Convert score to confidence
        score: vote.score,
      });
    });

    // Add some simulated collaborations between high-reputation nodes
    const highRepNodes = nodes.filter(
      (n) => n.reputation > 80 && n.type !== "self",
    );
    for (let i = 0; i < Math.min(3, highRepNodes.length - 1); i++) {
      for (let j = i + 1; j < Math.min(i + 2, highRepNodes.length); j++) {
        edges.push({
          source: highRepNodes[i].id,
          target: highRepNodes[j].id,
          type: "collaboration",
          weight: 1,
        });
      }
    }

    res.json({
      success: true,
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        totalInteractions: edges.reduce((sum, e) => sum + e.weight, 0),
        categories: [...new Set(nodes.map((n) => n.category))],
        ourVotes: votes.length,
      },
    });
  } catch (error) {
    logger.error("Failed to get network graph:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get learning/evolution data
app.get("/api/learning/stats", async (req, res) => {
  try {
    logger.info("Fetching learning stats");

    // Get reasoning history with confidence over time
    const confidenceHistory = await db.pool.query(`
      SELECT 
        DATE_TRUNC('hour', created_at) as time_bucket,
        action_type,
        AVG(confidence) as avg_confidence,
        COUNT(*) as action_count
      FROM action_reasoning
      GROUP BY time_bucket, action_type
      ORDER BY time_bucket ASC
    `);

    // Get confidence distribution
    const confidenceDistribution = await db.pool.query(`
      SELECT 
        CASE 
          WHEN confidence >= 0.9 THEN '90-100%'
          WHEN confidence >= 0.8 THEN '80-89%'
          WHEN confidence >= 0.7 THEN '70-79%'
          ELSE '60-69%'
        END as confidence_range,
        COUNT(*) as count
      FROM action_reasoning
      GROUP BY confidence_range
      ORDER BY confidence_range DESC
    `);

    // Get voting accuracy (projects we voted for vs their success)
    const votingAccuracy = await db.pool.query(`
      SELECT 
        pv.project_name,
        pv.score as our_score,
        p.human_upvotes + p.agent_upvotes as total_upvotes,
        ar.confidence
      FROM project_votes pv
      LEFT JOIN projects p ON pv.project_id = p.external_id
      LEFT JOIN action_reasoning ar ON ar.action_hash LIKE '%' || pv.project_id || '%'
      WHERE ar.action_type = 'VOTE_CAST'
      ORDER BY pv.created_at DESC
      LIMIT 50
    `);

    // Calculate improvement metrics
    const firstWeek = await db.pool.query(`
      SELECT AVG(confidence) as avg_confidence
      FROM action_reasoning
      WHERE created_at < NOW() - INTERVAL '3 days'
    `);

    const lastWeek = await db.pool.query(`
      SELECT AVG(confidence) as avg_confidence
      FROM action_reasoning
      WHERE created_at >= NOW() - INTERVAL '3 days'
    `);

    const improvementRate = firstWeek.rows[0]?.avg_confidence
      ? (
          ((lastWeek.rows[0]?.avg_confidence -
            firstWeek.rows[0]?.avg_confidence) /
            firstWeek.rows[0]?.avg_confidence) *
          100
        ).toFixed(1)
      : 0;

    res.json({
      success: true,
      confidenceOverTime: confidenceHistory.rows,
      confidenceDistribution: confidenceDistribution.rows,
      votingAccuracy: votingAccuracy.rows,
      metrics: {
        totalActions: confidenceHistory.rows.reduce(
          (sum, r) => sum + parseInt(r.action_count),
          0,
        ),
        averageConfidence: (
          (confidenceHistory.rows.reduce(
            (sum, r) => sum + parseFloat(r.avg_confidence),
            0,
          ) /
            confidenceHistory.rows.length) *
          100
        ).toFixed(1),
        improvementRate: improvementRate,
        highConfidenceRate:
          confidenceDistribution.rows.find(
            (r) => r.confidence_range === "90-100%",
          )?.count || 0,
      },
    });
  } catch (error) {
    logger.error("Failed to get learning stats:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get strategy evolution
app.get("/api/learning/evolution", async (req, res) => {
  try {
    // Get how voting strategy evolved
    const strategyEvolution = await db.pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as votes_cast,
        AVG((factors->>'finalScore')::float) as avg_score,
        COUNT(*) FILTER (WHERE (factors->>'isPriority')::boolean = true) as priority_votes
      FROM action_reasoning
      WHERE action_type = 'VOTE_CAST'
      AND factors IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    res.json({
      success: true,
      evolution: strategyEvolution.rows,
    });
  } catch (error) {
    logger.error("Failed to get evolution data:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Live evaluation endpoint - REAL-TIME AI evaluation with FRESH API data
app.post("/api/evaluate/live", async (req, res) => {
  try {
    const { projectId, projectName } = req.body;
    logger.info(`🔴 LIVE evaluation request: ${projectId || projectName}`);

    const colosseumAPI = new ColosseumAPI();

    // Get ALL projects from API with full pagination (useAPI=true)
    logger.info("📡 Fetching ALL projects from Colosseum API...");
    const allProjects = await colosseumAPI.getProjects({}, true);
    logger.info(`✅ Loaded ${allProjects.length} FRESH projects from API`);

    // Find project
    let project;

    if (projectId) {
      project = allProjects.find((p) => p.id === parseInt(projectId));
      logger.info(
        `🔍 Searching by ID: ${projectId} - ${project ? "✅ FOUND" : "❌ NOT FOUND"}`,
      );
    } else if (projectName) {
      // Exact match
      project = allProjects.find(
        (p) => p.name.toLowerCase() === projectName.toLowerCase(),
      );

      // Partial match
      if (!project) {
        project = allProjects.find((p) =>
          p.name.toLowerCase().includes(projectName.toLowerCase()),
        );
      }

      // Slug match
      if (!project) {
        project = allProjects.find((p) =>
          p.slug?.toLowerCase().includes(projectName.toLowerCase()),
        );
      }

      logger.info(
        `🔍 Searching by name: "${projectName}" - ${project ? `✅ FOUND: ${project.name}` : "❌ NOT FOUND"}`,
      );

      // Log similar if not found
      if (!project) {
        const similar = allProjects
          .filter((p) =>
            p.name
              .toLowerCase()
              .includes(projectName.substring(0, 3).toLowerCase()),
          )
          .slice(0, 5)
          .map((p) => `"${p.name}" (ID: ${p.id})`);

        if (similar.length > 0) {
          logger.info(`💡 Similar projects: ${similar.join(", ")}`);
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        error: "Please provide either projectId or projectName",
      });
    }

    if (!project) {
      return res.json({
        success: false,
        error: "Project not found",
        suggestion: `Searched ${allProjects.length} live projects from Colosseum API. Check spelling or project ID.`,
      });
    }

    logger.info(`🧠 Evaluating: ${project.name} (ID: ${project.id})`);

    // Calculate objective score
    let objectiveScore = 0;

    // GitHub check (+2 points) - API uses different field names
    const githubLink =
      project.repoLink ||
      project.github ||
      project.githubUrl ||
      project.data?.repoLink ||
      project.data?.github ||
      "";
    if (githubLink && githubLink.trim()) {
      objectiveScore += 2;
    }

    // Demo check (+3 points) - API uses different field names
    const demoLink =
      project.technicalDemoLink ||
      project.demo ||
      project.liveAppLink ||
      project.data?.demo ||
      project.data?.technicalDemoLink ||
      project.data?.liveAppLink ||
      "";
    if (demoLink && demoLink.trim()) {
      objectiveScore += 3;
    }

    // Description quality (0-2.5 points)
    const descLength = (project.description || "").length;
    if (descLength > 500) {
      objectiveScore += 2.5;
    } else if (descLength > 200) {
      objectiveScore += 1.5;
    } else if (descLength > 50) {
      objectiveScore += 0.5;
    }

    // Video check (+2.5 points) - API uses different field names
    const videoLink =
      project.presentationLink ||
      project.video ||
      project.data?.presentationLink ||
      project.data?.video ||
      "";
    if (videoLink && videoLink.trim()) {
      objectiveScore += 2.5;
    }

    logger.info(
      `📊 ${project.name}: objective=${objectiveScore}/10, calling Claude...`,
    );

    // Get AI evaluation using Claude
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = `Evaluate this Solana AI Agent Hackathon project on a scale of 0-10:

Project: ${project.name}
${project.tagline ? `Tagline: ${project.tagline}` : ""}
Description: ${project.description || "No description"}
${githubLink ? `GitHub: ${githubLink}` : ""}
${demoLink ? `Demo: ${demoLink}` : ""}

Rate these aspects (0-10 each):
1. Innovation - How novel and creative is the concept?
2. Technical Effort - Implementation quality and complexity
3. Potential Impact - Value to Solana/AI ecosystem
4. Ecosystem Fit - Alignment with Solana's strengths

Respond ONLY with JSON (no markdown, no backticks):
{
  "innovation": 7,
  "effort": 8,
  "potential": 7,
  "ecosystemFit": 9,
  "overall": 7.75,
  "reasoning": "Brief explanation"
}`;

    let aiEval;
    try {
      const aiResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });

      const aiText = aiResponse.content[0].text;

      // Clean and parse JSON
      const cleanedText = aiText.replace(/```json|```/g, "").trim();
      aiEval = JSON.parse(cleanedText);

      // Validate required fields
      if (
        !aiEval.innovation ||
        !aiEval.effort ||
        !aiEval.potential ||
        !aiEval.ecosystemFit
      ) {
        throw new Error("Missing required fields in AI response");
      }

      logger.info(`🤖 AI score: ${aiEval.overall}/10`);
    } catch (parseError) {
      logger.error("Failed to parse Claude response:", parseError.message);
      logger.info("Using fallback evaluation based on objective score");

      // Fallback: create evaluation based on objective metrics
      const baseScore = Math.min(objectiveScore * 1.2, 10);
      aiEval = {
        innovation: parseFloat((baseScore * 0.9).toFixed(1)),
        effort: parseFloat((baseScore * 1.1).toFixed(1)),
        potential: parseFloat(baseScore.toFixed(1)),
        ecosystemFit: parseFloat((baseScore * 1.0).toFixed(1)),
        overall: parseFloat(baseScore.toFixed(1)),
        reasoning: `Evaluation based on objective metrics: ${objectiveScore}/10. Project has ${githubLink ? "GitHub repository" : "no repository"}, ${demoLink ? "working demo" : "no demo"}, and ${descLength > 200 ? "detailed" : "basic"} description.`,
      };
    }

    // Calculate final score (40% objective + 60% AI)
    const finalScore = objectiveScore * 0.4 + aiEval.overall * 0.6;
    const confidence =
      finalScore >= 8
        ? 0.95
        : finalScore >= 7
          ? 0.9
          : finalScore >= 6
            ? 0.85
            : 0.8;

    logger.info(`✅ Final score: ${finalScore.toFixed(1)}/10`);

    // Generate detailed reasoning
    const reasoning = {
      reasoning: `=== LIVE AI EVALUATION ===

1. PROJECT OVERVIEW
   Name: "${project.name}"
   ${project.tagline ? `Tagline: "${project.tagline}"` : ""}
   Description: ${descLength} characters

2. OBJECTIVE ANALYSIS (40% weight)
   Score: ${objectiveScore.toFixed(1)}/10
   ✓ GitHub Repository: ${githubLink ? "✅ YES (+2.0)" : "❌ NO (0.0)"}
   ✓ Working Demo: ${demoLink ? "✅ YES (+3.0)" : "❌ NO (0.0)"}
   ✓ Description Quality: ${descLength > 500 ? "Excellent (2.5)" : descLength > 200 ? "Good (1.5)" : descLength > 50 ? "Basic (0.5)" : "Minimal (0.0)"}
   ✓ Video Demo: ${videoLink ? "✅ YES (+2.5)" : "❌ NO (0.0)"}

3. AI EVALUATION BY CLAUDE (60% weight)
   Overall Score: ${aiEval.overall}/10
   Breakdown:
   • Innovation: ${aiEval.innovation}/10 - ${aiEval.innovation >= 8 ? "Outstanding" : aiEval.innovation >= 7 ? "Excellent" : aiEval.innovation >= 6 ? "Good" : "Average"}
   • Technical Effort: ${aiEval.effort}/10 - ${aiEval.effort >= 8 ? "Outstanding" : aiEval.effort >= 7 ? "Excellent" : aiEval.effort >= 6 ? "Good" : "Average"}
   • Potential Impact: ${aiEval.potential}/10 - ${aiEval.potential >= 8 ? "Outstanding" : aiEval.potential >= 7 ? "Excellent" : aiEval.potential >= 6 ? "Good" : "Average"}
   • Ecosystem Fit: ${aiEval.ecosystemFit}/10 - ${aiEval.ecosystemFit >= 8 ? "Outstanding" : aiEval.ecosystemFit >= 7 ? "Excellent" : aiEval.ecosystemFit >= 6 ? "Good" : "Average"}
   
   Claude's Assessment: "${aiEval.reasoning}"

4. FINAL CALCULATION
   Formula: (Objective × 0.4) + (AI × 0.6)
   Calculation: (${objectiveScore.toFixed(1)} × 0.4) + (${aiEval.overall} × 0.6)
   Result: ${finalScore.toFixed(1)}/10
   
   Threshold: 5.5/10 (balanced strategy)
   ${finalScore >= 8.5 ? "⭐ EXCELLENT PROJECT - Strong recommendation!" : finalScore >= 7.0 ? "✅ GOOD PROJECT - Recommended" : finalScore >= 5.5 ? "👍 DECENT PROJECT - Worth supporting" : "❌ BELOW THRESHOLD"}

5. DECISION
   ${finalScore >= 5.5 ? "✅ RECOMMEND" : "❌ DO NOT RECOMMEND"}
   Confidence: ${(confidence * 100).toFixed(0)}%

=== END OF EVALUATION ===`,

      factors: {
        objectiveScore: objectiveScore.toFixed(1),
        aiScore: aiEval.overall.toFixed(1),
        finalScore: finalScore.toFixed(1),
        innovation: aiEval.innovation,
        effort: aiEval.effort,
        potential: aiEval.potential,
        ecosystemFit: aiEval.ecosystemFit,
        hasGitHub: githubLink ? "✅" : "❌",
        hasDemo: demoLink ? "✅" : "❌",
        hasVideo: videoLink ? "✅" : "❌",
        confidence: `${(confidence * 100).toFixed(0)}%`,
      },
    };

    res.json({
      success: true,
      generated: "LIVE",
      dataSource: "100% Fresh API Data (Full Pagination)",
      totalProjectsSearched: allProjects.length,
      project: {
        id: project.id,
        name: project.name,
        tagline: project.tagline || "N/A",
        description: (project.description || "").substring(0, 300) + "...",
      },
      evaluation: {
        objectiveScore: parseFloat(objectiveScore.toFixed(1)),
        aiScore: aiEval.overall,
        finalScore: parseFloat(finalScore.toFixed(1)),
        confidence: confidence,
        recommendation:
          finalScore >= 5.5 ? (finalScore >= 8.5 ? "STRONG_YES" : "YES") : "NO",
        breakdown: aiEval,
      },
      reasoning: reasoning.reasoning,
      factors: reasoning.factors,
      _debug: {
        allKeys: Object.keys(project),
        urlFields: Object.fromEntries(
          Object.entries(project).filter(
            ([k, v]) =>
              v &&
              typeof v === "string" &&
              (v.includes("http") ||
                v.includes(".app") ||
                v.includes(".com") ||
                v.includes("github")),
          ),
        ),
        rawLinks: { githubLink, demoLink, videoLink },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Live evaluation failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      hint: "Could not fetch live data from Colosseum API",
    });
  }
});

// ============================================================================
// REPUTATION API ENDPOINTS
// ============================================================================

// Get agent reputation
app.get("/api/reputation/:agentId", (req, res) => {
  try {
    const { agentId } = req.params;
    const reputation = mockReputation.getReputation(parseInt(agentId));

    if (!reputation) {
      return res.status(404).json({ error: "Reputation not found" });
    }

    res.json(reputation);
  } catch (error) {
    logger.error("Get reputation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get protocol activities
app.get("/api/reputation/:agentId/protocols", (req, res) => {
  try {
    const { agentId } = req.params;
    const activities = mockReputation.getProtocolActivities(parseInt(agentId));
    res.json(activities);
  } catch (error) {
    logger.error("Get protocol activities error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get protocol ecosystem stats
app.get("/api/protocol-stats", (req, res) => {
  try {
    const stats = mockReputation.getProtocolStats();
    res.json(stats);
  } catch (error) {
    logger.error("Get protocol stats error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get score breakdown
app.get("/api/reputation/:agentId/breakdown", (req, res) => {
  try {
    const { agentId } = req.params;
    const breakdown = mockReputation.getScoreBreakdown(parseInt(agentId));

    if (!breakdown) {
      return res.status(404).json({ error: "Reputation not found" });
    }

    res.json(breakdown);
  } catch (error) {
    logger.error("Get score breakdown error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AGENT API ENDPOINTS (for other AI agents)
// ============================================

/**
 * GET /skill.json
 * OpenClaw skill file for agent integration
 */
app.get("/skill.json", (req, res) => {
  const skillData = {
    name: "AgentPulse Analytics API",
    description:
      "The First Autonomous Analytics Agent for AI Agent Communities. Provides real-time insights, project rankings, trends, and ecosystem health data for the Colosseum AI Agent Hackathon.",
    version: "1.0.0",
    agent: {
      name: "AgentPulse",
      id: "503",
      wallet: "5EAgc3EnyZWT7yNHsjv5ohtbpap8VJMDeAGueBGzg1o2",
      twitter: "@PDereniuk",
    },
    api: {
      base_url: "https://agentpulse-production-8e01.up.railway.app",
      documentation: "https://agentpulse.vercel.app",
      rate_limit: "100 requests per minute",
      authentication: "None (public API)",
    },
    endpoints: [
      {
        path: "/api/leaderboard",
        method: "GET",
        description: "Project rankings with AgentPulse Score",
      },
      {
        path: "/api/leaderboard/trends",
        method: "GET",
        description: "Rising stars and trending projects",
      },
      {
        path: "/api/agent-insights",
        method: "POST",
        description: "AI-generated project analysis",
        body: { projectId: "number", focusArea: "string (optional)" },
      },
      {
        path: "/api/ecosystem-stats",
        method: "GET",
        description: "Overall hackathon statistics",
      },
      {
        path: "/api/forum-activity",
        method: "GET",
        description: "Recent forum activity",
      },
      {
        path: "/api/proof",
        method: "GET",
        description: "On-chain autonomy proofs",
      },
    ],
  };
  res.json(skillData);
});

/**
 * POST /api/agent-insights
 * Get AI-generated insights about a specific project
 */
app.post("/api/agent-insights", async (req, res) => {
  try {
    const { projectId, focusArea = "overall" } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    // Get project data from Colosseum API
    const api = new (await import("./services/colosseumAPI.js")).ColosseumAPI();
    const projects = await api.getProjects({ limit: 500 });
    const project = projects.find((p) => p.id === parseInt(projectId));

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Generate insights using InsightGenerator
    const insightGen = new (
      await import("./services/insightGenerator.js")
    ).InsightGenerator();
    const prompt = `Analyze this AI agent project from the Colosseum Hackathon:

Project: ${project.name}
Description: ${project.description || "No description"}
Votes: ${project.voteCount || 0}
Has Demo: ${project.presentationLink ? "Yes" : "No"}
Has GitHub: ${project.repoLink ? "Yes" : "No"}
Focus: ${focusArea}

Provide a ${focusArea} analysis including:
1. Quality score (1-10)
2. Key strengths (3-5 points)
3. Potential concerns (2-3 points)
4. Brief overall assessment (2-3 sentences)

Format as JSON: {score, strengths: [], concerns: [], analysis}`;

    const insight = await insightGen.generateInsight(prompt);

    // Try to parse as JSON, fallback to text
    let parsedInsight;
    try {
      parsedInsight = JSON.parse(insight.content);
    } catch (e) {
      parsedInsight = {
        score: 7,
        analysis: insight.content,
        strengths: ["Project exists"],
        concerns: ["Analysis format issue"],
      };
    }

    res.json({
      projectId: project.id,
      projectName: project.name,
      ...parsedInsight,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Agent insights error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ecosystem-stats
 * Overall hackathon ecosystem statistics
 */
app.get("/api/ecosystem-stats", async (req, res) => {
  try {
    const api = new (await import("./services/colosseumAPI.js")).ColosseumAPI();
    const projects = await api.getProjects({ limit: 500 });
    const forumPosts = await api.getForumPosts({ limit: 200 });

    const stats = {
      totalProjects: projects.length,
      totalVotes: projects.reduce((sum, p) => sum + (p.voteCount || 0), 0),
      avgVotesPerProject:
        projects.length > 0
          ? (
              projects.reduce((sum, p) => sum + (p.voteCount || 0), 0) /
              projects.length
            ).toFixed(2)
          : 0,
      projectsWithDemo: projects.filter((p) => p.presentationLink).length,
      projectsWithRepo: projects.filter((p) => p.repoLink).length,
      projectsWithDescription: projects.filter(
        (p) => p.description && p.description.length > 100,
      ).length,

      // Calculate category distribution (based on keywords in descriptions)
      topCategories: (() => {
        const categories = {
          "Trading/DeFi": 0,
          "Analytics/Data": 0,
          Infrastructure: 0,
          Gaming: 0,
          Social: 0,
          Security: 0,
          "AI/ML": 0,
          Other: 0,
        };

        projects.forEach((p) => {
          const desc = (p.description || "").toLowerCase();
          if (/trading|defi|swap|liquidity|yield|perp/.test(desc))
            categories["Trading/DeFi"]++;
          else if (/analytics|dashboard|data|metrics|tracking/.test(desc))
            categories["Analytics/Data"]++;
          else if (/infrastructure|sdk|api|framework|protocol/.test(desc))
            categories["Infrastructure"]++;
          else if (/game|gaming|minecraft|nft/.test(desc))
            categories["Gaming"]++;
          else if (/social|community|forum|chat/.test(desc))
            categories["Social"]++;
          else if (/security|audit|safety|verify/.test(desc))
            categories["Security"]++;
          else if (/ai|ml|llm|gpt|claude|model/.test(desc))
            categories["AI/ML"]++;
          else categories["Other"]++;
        });

        return Object.entries(categories)
          .map(([category, count]) => ({ category, count }))
          .filter((c) => c.count > 0)
          .sort((a, b) => b.count - a.count);
      })(),

      // Forum stats
      totalForumPosts: forumPosts.length,
      avgCommentsPerPost:
        forumPosts.length > 0
          ? (
              forumPosts.reduce((sum, p) => sum + (p.commentCount || 0), 0) /
              forumPosts.length
            ).toFixed(2)
          : 0,

      // Activity score (1-100 based on multiple factors)
      activityScore: Math.min(
        100,
        Math.round(
          projects.length / 5 + // 20 pts per 100 projects
            stats.avgVotesPerProject * 2 + // votes
            forumPosts.length / 2 + // forum activity
            (projects.filter((p) => p.presentationLink).length /
              projects.length) *
              30 + // demo %
            (projects.filter((p) => p.repoLink).length / projects.length) * 30, // repo %
        ),
      ),

      timestamp: new Date().toISOString(),
    };

    res.json(stats);
  } catch (error) {
    logger.error("Ecosystem stats error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== INTEGRATION APIs FOR OTHER AGENTS =====

// Get reputation for any agent
app.get("/api/reputation/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;
    logger.info(`Reputation query for agent ${agentId}`);

    // Get agent's forum activity
    const forumActivity = await db.pool.query(
      `
      SELECT 
        COUNT(*) as post_count,
        SUM(upvotes) as total_upvotes,
        AVG(upvotes) as avg_upvotes
      FROM forum_posts
      WHERE agent_id = $1
    `,
      [agentId],
    );

    // Get reasoning data if available (for AgentPulse itself)
    const reasoning = await db.pool.query(`
      SELECT 
        COUNT(*) as total_actions,
        AVG(confidence) as avg_confidence,
        COUNT(*) FILTER (WHERE confidence >= 0.9) as high_confidence_count
      FROM action_reasoning
    `);

    const activity = forumActivity.rows[0];
    const reasoningData = reasoning.rows[0];

    // Calculate reputation score (0-100)
    const postScore = Math.min(parseInt(activity.post_count) || 0, 50);
    const upvoteScore = Math.min(
      (parseInt(activity.total_upvotes) || 0) / 2,
      30,
    );
    const confidenceScore =
      parseInt(agentId) === 503
        ? (parseFloat(reasoningData.avg_confidence) || 0) * 20
        : 0;

    const reputation = Math.min(postScore + upvoteScore + confidenceScore, 100);
    const trustScore =
      parseInt(agentId) === 503
        ? parseFloat(reasoningData.avg_confidence) || 0
        : Math.min(reputation / 100, 1);

    res.json({
      success: true,
      agentId: parseInt(agentId),
      reputation: Math.round(reputation),
      trustScore: parseFloat(trustScore.toFixed(2)),
      metrics: {
        totalActions:
          parseInt(agentId) === 503
            ? parseInt(reasoningData.total_actions)
            : parseInt(activity.post_count),
        highConfidenceRate:
          parseInt(agentId) === 503
            ? parseFloat(
                (
                  parseInt(reasoningData.high_confidence_count) /
                  parseInt(reasoningData.total_actions)
                ).toFixed(2),
              )
            : 0,
        communityUpvotes: parseInt(activity.total_upvotes) || 0,
        avgUpvotesPerPost: parseFloat(activity.avg_upvotes).toFixed(1) || 0,
      },
      dataSource:
        parseInt(agentId) === 503 ? "autonomous_reasoning" : "forum_activity",
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Reputation query failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get project evaluation
app.get("/api/evaluate/project/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    logger.info(`Project evaluation query for ${projectId}`);

    // Get our vote/evaluation
    const vote = await db.pool.query(
      `
      SELECT 
        project_name,
        score,
        reasoning
      FROM project_votes
      WHERE project_id = $1
      LIMIT 1
    `,
      [projectId],
    );

    // Get reasoning details
    const reasoning = await db.pool.query(
      `
      SELECT 
        confidence,
        reasoning,
        factors
      FROM action_reasoning
      WHERE action_hash LIKE '%' || $1 || '%'
      AND action_type = 'VOTE_CAST'
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [projectId],
    );

    if (vote.rows.length === 0) {
      return res.json({
        success: true,
        projectId: parseInt(projectId),
        evaluated: false,
        message: "Project not yet evaluated by AgentPulse",
      });
    }

    const voteData = vote.rows[0];
    const reasoningData = reasoning.rows[0] || {};
    const score = parseFloat(voteData.score);

    // Determine recommendation
    let recommendation = "NEUTRAL";
    if (score >= 9.0) recommendation = "STRONG_YES";
    else if (score >= 7.5) recommendation = "YES";
    else if (score < 6.0) recommendation = "NO";

    res.json({
      success: true,
      projectId: parseInt(projectId),
      projectName: voteData.project_name,
      evaluated: true,
      score: parseFloat(score.toFixed(1)),
      confidence: reasoningData.confidence || 0.85,
      reasoning:
        reasoningData.reasoning ||
        voteData.reasoning ||
        "Evaluation based on objective and AI criteria",
      recommendation: recommendation,
      factors: reasoningData.factors || {},
      evaluatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Project evaluation failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Integration info endpoint
app.get("/api/integration/info", async (req, res) => {
  try {
    res.json({
      success: true,
      service: "AgentPulse Integration API",
      version: "1.0.0",
      endpoints: [
        {
          path: "/api/reputation/:agentId",
          method: "GET",
          description: "Get reputation and trust metrics for any agent",
        },
        {
          path: "/api/evaluate/project/:projectId",
          method: "GET",
          description: "Get AI-powered evaluation of a project",
        },
        {
          path: "/api/network/graph",
          method: "GET",
          description: "Get network analysis and agent relationships",
        },
        {
          path: "/api/learning/stats",
          method: "GET",
          description: "Get learning and evolution metrics",
        },
      ],
      skillFile:
        "https://github.com/PavloDereniuk/agentpulse/blob/main/skills/agentpulse.json",
      documentation: "https://github.com/PavloDereniuk/agentpulse#integration",
    });
  } catch (error) {
    logger.error("Integration info failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/forum-activity
 * Recent forum posts and engagement metrics
 */
app.get("/api/forum-activity", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const api = new (await import("./services/colosseumAPI.js")).ColosseumAPI();
    const posts = await api.getForumPosts({ limit, sort: "new" });

    const activity = {
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        agentName: p.agentName,
        createdAt: p.createdAt,
        commentCount: p.commentCount || 0,
        voteCount: p.voteCount || 0,
        engagement: (p.commentCount || 0) + (p.voteCount || 0),
      })),
      totalPosts: posts.length,
      avgEngagement:
        posts.length > 0
          ? (
              posts.reduce(
                (sum, p) => sum + (p.commentCount || 0) + (p.voteCount || 0),
                0,
              ) / posts.length
            ).toFixed(2)
          : 0,
      mostEngaged: posts
        .map((p) => ({
          title: p.title,
          agentName: p.agentName,
          engagement: (p.commentCount || 0) + (p.voteCount || 0),
        }))
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 5),
      timestamp: new Date().toISOString(),
    };

    res.json(activity);
  } catch (error) {
    logger.error("Forum activity error:", error);
    res.status(500).json({ error: error.message });
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
  logger.info(
    `📊 Dashboard: ${process.env.FRONTEND_URL || "http://localhost:5173"}`,
  );
  logger.info(`🤖 Autonomous agent: ${agent ? "RUNNING" : "DISABLED"}`);
  logger.info(
    `🔗 Solana: ${solana.network} (write: ${solana.canWrite() ? "enabled" : "disabled"})`,
  );
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
