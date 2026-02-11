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
import mockReputation from './services/mockReputationService.js';
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
      logger.warn('Solana unavailable:', solanaError?.message || 'Unknown error');
      solanaStatus = { available: false };
    }

    res.json({
      status: 'ok',
      agent: agent ? agent.getStats() : null,  // ← ДОДАЙ ЦЕ!
      database: db.pool ? 'connected' : 'disconnected',
      solana: solanaStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Health check error:", error?.message || error);
    
    res.json({
      status: 'degraded',
      agent: agent ? agent.getStats() : null,  // ← І ТУТ!
      error: error?.message || 'Unknown error',
      timestamp: new Date().toISOString()
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
      logger.warn('Solana network unavailable:', err.message);
      networkStatus = { available: false, error: 'Network unavailable' };
    }
    
    // Try to get wallet balance
    if (solana.canWrite()) {
      try {
        walletBalance = await solana.getAgentWalletBalance();
      } catch (err) {
        logger.warn('Wallet balance unavailable:', err.message);
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
      stats: solana.getStats() || { network: 'devnet', walletConfigured: false },
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
  try {
    // Get from database
    const logs = await db.pool.query(`
      SELECT * FROM autonomy_log 
      WHERE details::text LIKE '%solanaTx%'
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
    if (proofsCache && (now - proofsCacheTime) < PROOFS_CACHE_TTL) {
      logger.info('Returning cached proofs');
      return res.json(proofsCache);
    }
    
    const limit = parseInt(req.query.limit) || 20;
    
    // Get from database
    const result = await db.pool.query(`
      SELECT *
      FROM autonomy_log 
      WHERE details IS NOT NULL
      ORDER BY created_at DESC 
      LIMIT $1
    `, [limit]);

    // Format as proofs
// Format as proofs with better summaries
const proofs = result.rows.map(log => {
  const details = log.details || {};
  const solanaTx = details.solanaTx || details.signature || null;
  const action = details.action || log.action_type || 'ACTION';
  
  // Generate better summary based on action type
  let summary = '';
  switch(action) {
    case 'DATA_COLLECTION':
      const dc = details.details || {};
      summary = `Collected ${dc.projectsCount || 0} projects, ${dc.postsCount || 0} posts`;
      break;
    case 'COMMENT_RESPONSE':
      summary = `Responded to @${details.respondedTo} on post #${details.postId}`;
      break;
    case 'COMMENT_CHECK':
      const cc = details.details || {};
      summary = `Checked comments: ${cc.responded || 0}/${cc.processed || 0} responded`;
      break;
    case 'AGENT_SPOTLIGHT':
      summary = details.title || `Agent Spotlight published`;
      break;
    case 'SELF_EVALUATION':
      const se = details.metrics || {};
      summary = `Self-check: ${se.votesGiven} votes, ${se.onChainLogs} logs, ${se.commentResponses} responses`;
      break;
     case 'SELF_IMPROVEMENT':
    const si = details.improvements || details.changes || {};
    if (si.strategyVersion) {
      summary = `Strategy upgraded to v${si.strategyVersion}`;
    } else {
      summary = `Self-improvement cycle completed`;
    }
      break;
    case 'POST_DECISION':
      summary = `Post decision: ${details.decision} (quality: ${details.qualityScore}/10)`;
      break;
    case 'VOTING_CYCLE':
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
    hash: details.hash || details.actionHash || (solanaTx ? solanaTx.slice(0, 16) : null),
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
    const topActionType = typeResult.rows[0]?.action_type || 'N/A';
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
      .map(row => parseInt(row.hour));
    
    res.json({
      totalActions,
      successRate: parseFloat(successRate),
      topActionType,
      activeHours,
      dailyGrowth: parseFloat(dailyGrowth),
      actionDistribution: typeResult.rows.map(row => ({
        type: row.action_type,
        count: parseInt(row.count)
      })),
      uptime: agent ? Math.floor(agent.getStats().uptime) : 0
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
    // Total evaluations and average score
    const statsResult = await db.pool.query(`
      SELECT 
        COUNT(*) as total_evaluations,
        AVG(score) as avg_score,
        MAX(score) as max_score,
        MIN(score) as min_score
      FROM project_evaluations
    `);
    
    // Score distribution
    const distributionResult = await db.pool.query(`
      SELECT 
        FLOOR(score) as score_bucket,
        COUNT(*) as count
      FROM project_evaluations
      WHERE score IS NOT NULL
      GROUP BY score_bucket
      ORDER BY score_bucket
    `);
    
    // Top projects by score
    const topProjectsResult = await db.pool.query(`
      SELECT 
        project_id,
        score,
        completeness,
        innovation,
        technical_quality,
        ecosystem_value,
        engagement,
        reasoning,
        created_at
      FROM project_evaluations
      ORDER BY score DESC
      LIMIT 10
    `);
    
    // Recent voting activity (last 7 days)
    const activityResult = await db.pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as votes,
        AVG(score) as avg_score
      FROM project_evaluations
      WHERE created_at > NOW() - INTERVAL '7 days'
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
      topProjects: topProjectsResult.rows.map(row => ({
        id: row.project_id,
        score: parseFloat(row.score).toFixed(1),
        breakdown: {
          completeness: row.completeness,
          innovation: row.innovation,
          technicalQuality: row.technical_quality,
          ecosystemValue: row.ecosystem_value,
          engagement: row.engagement
        },
        reasoning: row.reasoning,
        votedAt: row.created_at
      })),
      recentActivity: activityResult.rows.map(row => ({
        date: row.date,
        votes: parseInt(row.votes),
        avgScore: parseFloat(row.avg_score).toFixed(1)
      }))
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
    const avgResponseTime = parseFloat(responseTimeResult.rows[0]?.avg_minutes || 0);
    
    res.json({
      totalResponses: parseInt(commentStats?.total_responses) || 0,
      uniquePosts: parseInt(commentStats?.unique_posts) || 0,
      avgResponseTime: avgResponseTime > 0 ? `${avgResponseTime.toFixed(1)} min` : 'N/A',
      commentsByHour: hourlyResult.rows.map(row => ({
        hour: parseInt(row.hour),
        count: parseInt(row.count)
      })),
      dailyEngagement: dailyResult.rows.map(row => ({
        date: row.date,
        responses: parseInt(row.responses),
        posts: parseInt(row.posts),
        votes: parseInt(row.votes)
      })),
      topTargets: topTargetsResult.rows.map(row => ({
        username: row.username,
        responses: parseInt(row.responses)
      }))
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
    const { period = '7d' } = req.query;
    
    // Determine interval based on period
    let interval = '7 days';
    let groupBy = 'DATE(created_at)';
    if (period === '24h') {
      interval = '24 hours';
      groupBy = "DATE_TRUNC('hour', created_at)";
    } else if (period === '30d') {
      interval = '30 days';
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
      hourly: hourlyResult.rows.map(row => ({
        timestamp: row.timestamp,
        total: parseInt(row.total),
        breakdown: {
          dataCollection: parseInt(row.data_collection),
          commentResponses: parseInt(row.comment_responses),
          commentChecks: parseInt(row.comment_checks),
          voting: parseInt(row.voting)
        }
      })),
      daily: dailyResult.rows.map(row => ({
        date: row.date,
        total: parseInt(row.total),
        breakdown: {
          dataCollection: parseInt(row.data_collection),
          commentResponses: parseInt(row.comment_responses),
          spotlights: parseInt(row.spotlights),
          digests: parseInt(row.digests)
        }
      }))
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
app.get('/api/proofs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const type = req.query.type; // Optional filter by action type
    
    logger.info(`Fetching proofs (limit: ${limit}, type: ${type || 'all'})`);
    
    // Get on-chain proofs
    const proofs = await solana.getOnChainProofs(limit);
    
    // Filter by type if requested
    const filteredProofs = type 
      ? proofs.filter(p => p.type === type)
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
          logger.warn(`Failed to get reasoning for ${proof.hash}:`, error.message);
          return {
            ...proof,
            reasoning: null,
            confidence: null,
            factors: {},
          };
        }
      })
    );
    
    // Calculate stats
    const stats = {
      total: proofsWithReasoning.length,
      byType: {},
      averageConfidence: 0,
      withReasoning: 0,
    };
    
    // Count by type
    proofsWithReasoning.forEach(p => {
      stats.byType[p.type] = (stats.byType[p.type] || 0) + 1;
      if (p.reasoning) stats.withReasoning++;
    });
    
    // Calculate average confidence
    const withConfidence = proofsWithReasoning.filter(p => p.confidence !== null);
    if (withConfidence.length > 0) {
      const sum = withConfidence.reduce((acc, p) => acc + p.confidence, 0);
      stats.averageConfidence = (sum / withConfidence.length * 100).toFixed(1);
    }
    
    res.json({
      success: true,
      stats,
      proofs: proofsWithReasoning,
    });
    
  } catch (error) {
    logger.error('Failed to get proofs:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get stats about action types
app.get('/api/proofs/stats', async (req, res) => {
  try {
    const proofs = await solanaService.getOnChainProofs(500);
    
    const stats = {
      total: proofs.length,
      byType: {},
      timeline: {},
    };
    
    proofs.forEach(p => {
      // Count by type
      stats.byType[p.type] = (stats.byType[p.type] || 0) + 1;
      
      // Count by date
      if (p.timestamp) {
        const date = p.timestamp.split('T')[0];
        stats.timeline[date] = (stats.timeline[date] || 0) + 1;
      }
    });
    
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Failed to get proof stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get reasoning proofs directly from database (faster, doesn't need blockchain)
app.get('/api/proofs/db', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const type = req.query.type;
    
    logger.info(`Fetching proofs from DB (limit: ${limit}, type: ${type || 'all'})`);
    
    // Build query
    let query = 'SELECT * FROM action_reasoning';
    const params = [];
    
    if (type) {
      query += ' WHERE action_type = $1';
      params.push(type);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    // Get from database
    const result = await db.pool.query(query, params);
    const proofs = result.rows;
    
    // Calculate stats
    const stats = {
      total: proofs.length,
      byType: {},
      averageConfidence: 0,
      withReasoning: proofs.length,
    };
    
    // Count by type
    proofs.forEach(p => {
      stats.byType[p.action_type] = (stats.byType[p.action_type] || 0) + 1;
    });
    
    // Calculate average confidence
    const withConfidence = proofs.filter(p => p.confidence !== null);
    if (withConfidence.length > 0) {
      const sum = withConfidence.reduce((acc, p) => acc + p.confidence, 0);
      stats.averageConfidence = (sum / withConfidence.length * 100).toFixed(1);
    }
    
    // Format for frontend
    const formattedProofs = proofs.map(p => ({
      type: p.action_type,
      reasoning: p.reasoning,
      confidence: p.confidence,
      factors: p.factors,
      timestamp: p.created_at,
      hash: p.action_hash,
      // Mock explorer URL since we don't have on-chain signature from DB
      explorerUrl: '#',
      verified: true,
    }));
    
    res.json({
      success: true,
      stats,
      proofs: formattedProofs,
      source: 'database',
    });
    
  } catch (error) {
    logger.error('Failed to get proofs from DB:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});


// ============================================================================
// REPUTATION API ENDPOINTS
// ============================================================================

// Get agent reputation
app.get('/api/reputation/:agentId', (req, res) => {
  try {
    const { agentId } = req.params;
    const reputation = mockReputation.getReputation(parseInt(agentId));
    
    if (!reputation) {
      return res.status(404).json({ error: 'Reputation not found' });
    }
    
    res.json(reputation);
  } catch (error) {
    console.error('Get reputation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get protocol activities
app.get('/api/reputation/:agentId/protocols', (req, res) => {
  try {
    const { agentId } = req.params;
    const activities = mockReputation.getProtocolActivities(parseInt(agentId));
    res.json(activities);
  } catch (error) {
    console.error('Get protocol activities error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get protocol ecosystem stats
app.get('/api/protocol-stats', (req, res) => {
  try {
    const stats = mockReputation.getProtocolStats();
    res.json(stats);
  } catch (error) {
    console.error('Get protocol stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get score breakdown
app.get('/api/reputation/:agentId/breakdown', (req, res) => {
  try {
    const { agentId } = req.params;
    const breakdown = mockReputation.getScoreBreakdown(parseInt(agentId));
    
    if (!breakdown) {
      return res.status(404).json({ error: 'Reputation not found' });
    }
    
    res.json(breakdown);
  } catch (error) {
    console.error('Get score breakdown error:', error);
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
    "name": "AgentPulse Analytics API",
    "description": "The First Autonomous Analytics Agent for AI Agent Communities. Provides real-time insights, project rankings, trends, and ecosystem health data for the Colosseum AI Agent Hackathon.",
    "version": "1.0.0",
    "agent": {
      "name": "AgentPulse",
      "id": "503",
      "wallet": "5EAgc3EnyZWT7yNHsjv5ohtbpap8VJMDeAGueBGzg1o2",
      "twitter": "@PDereniuk"
    },
    "api": {
      "base_url": "https://agentpulse-production-8e01.up.railway.app",
      "documentation": "https://agentpulse.vercel.app",
      "rate_limit": "100 requests per minute",
      "authentication": "None (public API)"
    },
    "endpoints": [
      {
        "path": "/api/leaderboard",
        "method": "GET",
        "description": "Project rankings with AgentPulse Score"
      },
      {
        "path": "/api/leaderboard/trends",
        "method": "GET",
        "description": "Rising stars and trending projects"
      },
      {
        "path": "/api/agent-insights",
        "method": "POST",
        "description": "AI-generated project analysis",
        "body": { "projectId": "number", "focusArea": "string (optional)" }
      },
      {
        "path": "/api/ecosystem-stats",
        "method": "GET",
        "description": "Overall hackathon statistics"
      },
      {
        "path": "/api/forum-activity",
        "method": "GET",
        "description": "Recent forum activity"
      },
      {
        "path": "/api/proof",
        "method": "GET",
        "description": "On-chain autonomy proofs"
      }
    ]
  };
  res.json(skillData);
});

/**
 * POST /api/agent-insights
 * Get AI-generated insights about a specific project
 */
app.post("/api/agent-insights", async (req, res) => {
  try {
    const { projectId, focusArea = 'overall' } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    // Get project data from Colosseum API
    const api = new (await import('./services/colosseumAPI.js')).ColosseumAPI();
    const projects = await api.getProjects({ limit: 500 });
    const project = projects.find(p => p.id === parseInt(projectId));

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate insights using InsightGenerator
    const insightGen = new (await import('./services/insightGenerator.js')).InsightGenerator();
    const prompt = `Analyze this AI agent project from the Colosseum Hackathon:

Project: ${project.name}
Description: ${project.description || 'No description'}
Votes: ${project.voteCount || 0}
Has Demo: ${project.presentationLink ? 'Yes' : 'No'}
Has GitHub: ${project.repoLink ? 'Yes' : 'No'}
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
        strengths: ['Project exists'],
        concerns: ['Analysis format issue']
      };
    }

    res.json({
      projectId: project.id,
      projectName: project.name,
      ...parsedInsight,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Agent insights error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ecosystem-stats
 * Overall hackathon ecosystem statistics
 */
app.get("/api/ecosystem-stats", async (req, res) => {
  try {
    const api = new (await import('./services/colosseumAPI.js')).ColosseumAPI();
    const projects = await api.getProjects({ limit: 500 });
    const forumPosts = await api.getForumPosts({ limit: 200 });

    const stats = {
      totalProjects: projects.length,
      totalVotes: projects.reduce((sum, p) => sum + (p.voteCount || 0), 0),
      avgVotesPerProject: projects.length > 0
        ? (projects.reduce((sum, p) => sum + (p.voteCount || 0), 0) / projects.length).toFixed(2)
        : 0,
      projectsWithDemo: projects.filter(p => p.presentationLink).length,
      projectsWithRepo: projects.filter(p => p.repoLink).length,
      projectsWithDescription: projects.filter(p => p.description && p.description.length > 100).length,

      // Calculate category distribution (based on keywords in descriptions)
      topCategories: (() => {
        const categories = {
          'Trading/DeFi': 0,
          'Analytics/Data': 0,
          'Infrastructure': 0,
          'Gaming': 0,
          'Social': 0,
          'Security': 0,
          'AI/ML': 0,
          'Other': 0
        };

        projects.forEach(p => {
          const desc = (p.description || '').toLowerCase();
          if (/trading|defi|swap|liquidity|yield|perp/.test(desc)) categories['Trading/DeFi']++;
          else if (/analytics|dashboard|data|metrics|tracking/.test(desc)) categories['Analytics/Data']++;
          else if (/infrastructure|sdk|api|framework|protocol/.test(desc)) categories['Infrastructure']++;
          else if (/game|gaming|minecraft|nft/.test(desc)) categories['Gaming']++;
          else if (/social|community|forum|chat/.test(desc)) categories['Social']++;
          else if (/security|audit|safety|verify/.test(desc)) categories['Security']++;
          else if (/ai|ml|llm|gpt|claude|model/.test(desc)) categories['AI/ML']++;
          else categories['Other']++;
        });

        return Object.entries(categories)
          .map(([category, count]) => ({ category, count }))
          .filter(c => c.count > 0)
          .sort((a, b) => b.count - a.count);
      })(),

      // Forum stats
      totalForumPosts: forumPosts.length,
      avgCommentsPerPost: forumPosts.length > 0
        ? (forumPosts.reduce((sum, p) => sum + (p.commentCount || 0), 0) / forumPosts.length).toFixed(2)
        : 0,

      // Activity score (1-100 based on multiple factors)
      activityScore: Math.min(100, Math.round(
        (projects.length / 5) + // 20 pts per 100 projects
        (stats.avgVotesPerProject * 2) + // votes
        (forumPosts.length / 2) + // forum activity
        ((projects.filter(p => p.presentationLink).length / projects.length) * 30) + // demo %
        ((projects.filter(p => p.repoLink).length / projects.length) * 30) // repo %
      )),

      timestamp: new Date().toISOString()
    };

    res.json(stats);

  } catch (error) {
    logger.error('Ecosystem stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/forum-activity
 * Recent forum posts and engagement metrics
 */
app.get("/api/forum-activity", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const api = new (await import('./services/colosseumAPI.js')).ColosseumAPI();
    const posts = await api.getForumPosts({ limit, sort: 'new' });

    const activity = {
      posts: posts.map(p => ({
        id: p.id,
        title: p.title,
        agentName: p.agentName,
        createdAt: p.createdAt,
        commentCount: p.commentCount || 0,
        voteCount: p.voteCount || 0,
        engagement: (p.commentCount || 0) + (p.voteCount || 0)
      })),
      totalPosts: posts.length,
      avgEngagement: posts.length > 0
        ? ((posts.reduce((sum, p) => sum + (p.commentCount || 0) + (p.voteCount || 0), 0)) / posts.length).toFixed(2)
        : 0,
      mostEngaged: posts
        .map(p => ({
          title: p.title,
          agentName: p.agentName,
          engagement: (p.commentCount || 0) + (p.voteCount || 0)
        }))
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 5),
      timestamp: new Date().toISOString()
    };

    res.json(activity);

  } catch (error) {
    logger.error('Forum activity error:', error);
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
