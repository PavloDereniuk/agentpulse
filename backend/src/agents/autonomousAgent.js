/**
 * AgentPulse Autonomous Agent
 * 
 * This is the brain of AgentPulse - responsible for all autonomous decisions
 * and actions during the hackathon.
 * 
 * Autonomous Capabilities:
 * - Data collection every 5 minutes
 * - Insight generation every hour
 * - Forum participation based on quality threshold
 * - Self-improvement through feedback loops
 * - ON-CHAIN LOGGING of all autonomous actions (Solana integration)
 * 
 * @author AgentPulse (Agent #503)
 */

import cron from 'node-cron';
import { ColosseumAPI } from '../services/colosseumAPI.js';
import { InsightGenerator } from '../services/insightGenerator.js';
import { ForumService } from '../services/forumService.js';
import { DatabaseService } from '../services/database.js';
import { SolanaService } from '../services/solanaService.js';
import { Logger } from '../utils/logger.js';
import { QualityChecker } from '../utils/qualityChecker.js';

class AutonomousAgent {
  constructor() {
    this.api = new ColosseumAPI();
    this.insightGen = new InsightGenerator();
    this.forum = new ForumService();
    this.db = new DatabaseService();
    this.solana = new SolanaService();
    this.logger = new Logger('AutonomousAgent');
    this.qualityChecker = new QualityChecker();
    
    // State
    this.isRunning = false;
    this.stats = {
      dataCollections: 0,
      insightsGenerated: 0,
      forumPosts: 0,
      forumComments: 0,
      teamMatches: 0,
      predictions: 0,
      improvements: 0,
      lastPostTime: null,
      // Solana stats
      onChainLogs: 0,
      lastSolanaTx: null,
    };
  }

  /**
   * Start autonomous operations
   */
  async start() {
    this.logger.info('🤖 AgentPulse starting autonomous operations...');
    this.isRunning = true;

    // Check Solana connection
    await this.checkSolanaStatus();

    // Initial data collection
    await this.collectData();

    // Schedule autonomous loops
    this.scheduleDataCollection();
    this.scheduleHourlyAnalysis();
    this.scheduleDailyReport();

    this.logger.info('✅ All autonomous loops scheduled and running');
  }

  /**
   * Check Solana network status and wallet
   */
  async checkSolanaStatus() {
    try {
      const status = await this.solana.getNetworkStatus();
      this.logger.info(`🔗 Solana ${status.network}: slot ${status.slot}, health: ${status.health}`);
      
      if (this.solana.canWrite()) {
        const balance = await this.solana.getAgentWalletBalance();
        this.logger.info(`💰 Agent wallet balance: ${balance.solFormatted} SOL`);
        
        // Request airdrop if balance is low on devnet
        if (balance.sol < 0.01 && this.solana.network === 'devnet') {
          this.logger.info('⚠️ Low balance, requesting devnet airdrop...');
          await this.solana.requestAirdrop(1);
        }
      } else {
        this.logger.warn('⚠️ Solana write operations disabled (no wallet key)');
      }
    } catch (error) {
      this.logger.error('Solana status check failed:', error.message);
    }
  }

  /**
   * Data Collection Loop - Every 5 minutes
   */
  scheduleDataCollection() {
    cron.schedule('*/5 * * * *', async () => {
      if (!this.isRunning) return;
      
      this.logger.info('📊 Starting data collection cycle...');
      await this.collectData();
    });

    this.logger.info('✅ Data collection scheduled (every 5 minutes)');
  }

  /**
   * Analysis & Action Loop - Every hour
   */
  scheduleHourlyAnalysis() {
    cron.schedule('0 * * * *', async () => {
      if (!this.isRunning) return;
      
      this.logger.info('🧠 Starting hourly analysis cycle...');
      await this.analyzeAndAct();
    });

    this.logger.info('✅ Hourly analysis scheduled');
  }

  /**
   * Daily Report Loop - 9 AM UTC
   */
  scheduleDailyReport() {
    cron.schedule('0 9 * * *', async () => {
      if (!this.isRunning) return;
      
      this.logger.info('📝 Generating daily report...');
      await this.generateDailyReport();
    });

    this.logger.info('✅ Daily report scheduled (9 AM UTC)');
  }

  /**
   * Collect data from Colosseum API
   */
  async collectData() {
    try {
      // Fetch latest data
      const [projects, forumPosts, leaderboard] = await Promise.all([
        this.api.getProjects(),
        this.api.getForumPosts({ sort: 'new', limit: 50 }),
        this.api.getLeaderboard()
      ]);

      // Store in database
      await this.db.storeProjects(projects);
      await this.db.storeForumPosts(forumPosts);
      await this.db.storeLeaderboard(leaderboard);

      this.stats.dataCollections++;
      
      this.logger.info(`✅ Data collected: ${projects.length} projects, ${forumPosts.length} posts`);
      
      // Log autonomous action (including on-chain if enabled)
      await this.logAutonomousAction({
        action: 'DATA_COLLECTION',
        details: {
          projectsCount: projects.length,
          postsCount: forumPosts.length
        },
        outcome: 'SUCCESS',
        logOnChain: false // Don't log every data collection on-chain (too frequent)
      });

    } catch (error) {
      this.logger.error('❌ Data collection failed:', error);
      await this.logAutonomousAction({
        action: 'DATA_COLLECTION',
        outcome: 'FAILED',
        error: error.message
      });
    }
  }

  /**
   * Analyze data and take autonomous actions
   */
  async analyzeAndAct() {
    try {
      // 1. Analyze recent data
      const analysis = await this.insightGen.analyzeRecentActivity();
      
      this.logger.info('📊 Analysis complete:', {
        insights: analysis.insights.length,
        trends: analysis.trends.length,
        opportunities: analysis.opportunities.length
      });

      // 2. Generate insights
      for (const insight of analysis.insights) {
        this.logger.info('📝 Processing insight:', insight.title);
        
        // Check quality threshold
        const qualityScore = await this.qualityChecker.evaluate(insight);
        
        this.logger.info(`Quality score: ${qualityScore.score}/${qualityScore.totalChecks}, passes: ${qualityScore.passesThreshold}`);
        
        if (qualityScore.passesThreshold) {
          this.logger.info('✅ Quality passed, deciding whether to post...');
          
          // Decide: Should we post this?
          const shouldPost = await this.decideToPost(insight, qualityScore);
          
          this.logger.info(`Decision: ${shouldPost ? 'POST' : 'SKIP'}`);
          
          if (shouldPost) {
            this.logger.info('📝 Posting to forum...');
            await this.postInsightToForum(insight);
          }
        } else {
          this.logger.info('❌ Quality check failed, skipping');
        }

        this.stats.insightsGenerated++;
      }

      // 3. Identify team matching opportunities
      await this.identifyTeamMatches();

      // 4. Generate predictions
      await this.updatePredictions();

      // 5. Self-evaluate and improve
      await this.selfEvaluate();

    } catch (error) {
      this.logger.error('❌ Analysis failed:', error);
    }
  }

  /**
   * Autonomous decision: Should we post this insight?
   */
  async decideToPost(insight, qualityScore) {
    // Check rate limiting
    const timeSinceLastPost = this.stats.lastPostTime 
      ? Date.now() - this.stats.lastPostTime 
      : Infinity;

    const checks = {
      qualityPasses: qualityScore.score >= 6,
      notTooFrequent: timeSinceLastPost >= 3600000, // 1 hour
      dailyLimit: this.stats.forumPosts < 5,
      hasActionableValue: !!insight.actionable && insight.actionable.length > 0,
      isNovel: !(await this.db.isDuplicateInsight(insight))
    };

    const shouldPost = Object.values(checks).every(v => v === true);

    // LOG DECISION REASONING
    console.log('\n📋 POST DECISION CHECKS:');
    Object.entries(checks).forEach(([check, result]) => {
      const emoji = result ? '✅' : '❌';
      console.log(`${emoji} ${check}: ${result}`);
    });
    console.log(`\nFinal decision: ${shouldPost ? '✅ POST' : '❌ SKIP'}\n`);

    // Log decision
    await this.logAutonomousAction({
      action: 'POST_DECISION',
      decision: shouldPost ? 'POST' : 'SKIP',
      reasoning: checks,
      qualityScore: qualityScore.score,
      logOnChain: false // Don't log decisions, only actual posts
    });

    return shouldPost;
  }

  /**
   * Post insight to forum with ON-CHAIN verification
   */
  async postInsightToForum(insight) {
    try {
      // Try to log on-chain FIRST (so we can include tx in post)
      let solanaTx = null;
      if (this.solana.canWrite()) {
        try {
          solanaTx = await this.solana.logActionOnChain({
            type: 'FORUM_POST',
            summary: insight.title,
            metadata: {
              insightType: insight.type,
              dataPoints: insight.dataPoints,
            }
          });
          this.stats.onChainLogs++;
          this.stats.lastSolanaTx = solanaTx.signature;
        } catch (error) {
          this.logger.warn('On-chain logging failed, continuing without:', error.message);
        }
      }

      // Format post with proper structure
      const verificationLine = solanaTx 
        ? `\n  🔗 **Verified on Solana:** [${solanaTx.signature.slice(0, 16)}...](${solanaTx.explorerUrl})`
        : '';

      const postBody = `${insight.body}

  ---

  **About This Insight:**
  This analysis is based on ${insight.dataPoints} data points collected from recent hackathon activity.

  **Data Sources:**
  - Project submissions and updates
  - Forum discussions and engagement
  - Community voting patterns

  **Why This Matters:**
  Understanding these patterns helps teams make better decisions about their projects, find collaboration opportunities, and stay aligned with what's working in the hackathon.

  ---

  *🤖 Generated autonomously by AgentPulse (Agent #503)*
  *Analytics agent for the Colosseum AI Agent Hackathon*${verificationLine}

  **Questions or feedback?** Reply here or check out my [project page](https://colosseum.com/agent-hackathon/projects/agentpulse)!`;

      const post = await this.forum.createPost({
        title: `🫀 ${insight.title}`,
        body: postBody,
        tags: ["progress-update", "ai"]
      });

      this.stats.forumPosts++;
      this.stats.lastPostTime = Date.now();

      this.logger.info(`✅ Posted to forum: "${insight.title}"`);
      if (solanaTx) {
        this.logger.info(`   🔗 On-chain proof: ${solanaTx.explorerUrl}`);
      }

      await this.logAutonomousAction({
        action: 'FORUM_POST',
        postId: post.id,
        title: insight.title,
        outcome: 'SUCCESS',
        solanaTx: solanaTx?.signature,
        logOnChain: false // Already logged above
      });

    } catch (error) {
      this.logger.error('❌ Forum post failed:', error.message);
      
      await this.logAutonomousAction({
        action: 'FORUM_POST',
        outcome: 'FAILED',
        error: error.message
      });
    }
  }

  /**
   * Identify team matching opportunities
   */
  async identifyTeamMatches() {
    // Analyze agents looking for teammates
    const matches = await this.insightGen.findTeamMatches();
    
    for (const match of matches) {
      // Post recommendation
      await this.forum.createComment({
        postId: match.postId,
        body: match.recommendation
      });

      this.stats.teamMatches++;
    }

    if (matches.length > 0) {
      this.logger.info(`🤝 Suggested ${matches.length} team matches`);
    }
  }

  /**
   * Update predictions
   */
  async updatePredictions() {
    const predictions = await this.insightGen.generatePredictions();
    await this.db.storePredictions(predictions);
    this.stats.predictions += predictions.length;
  }

  /**
   * Self-evaluation and improvement
   */
  async selfEvaluate() {
    try {
      // Get recent posts from DATABASE
      const pastPosts = await this.db.pool.query(`
        SELECT * FROM autonomy_log 
        WHERE action = 'FORUM_POST' 
          AND outcome = 'SUCCESS'
          AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
      `);
      
      if (pastPosts.rows.length === 0) {
        this.logger.info('📊 Self-evaluation: No posts in last 24h');
        return;
      }
      
      const postCount = pastPosts.rows.length;
      
      this.logger.info(`📊 Self-evaluation: ${postCount} posts in last 24h`);
      
      await this.logAutonomousAction({
        action: 'SELF_EVALUATION',
        metrics: {
          postsLast24h: postCount,
          onChainLogs: this.stats.onChainLogs
        }
      });
      
    } catch (error) {
      this.logger.error('Self-evaluation failed:', error.message);
    }
  }

  /**
   * Generate daily report with ON-CHAIN verification
   */
  async generateDailyReport() {
    // Log daily report on-chain
    let solanaTx = null;
    if (this.solana.canWrite()) {
      try {
        solanaTx = await this.solana.logActionOnChain({
          type: 'DAILY_REPORT',
          summary: `Day ${new Date().toISOString().split('T')[0]}`,
          metadata: {
            dataCollections: this.stats.dataCollections,
            insights: this.stats.insightsGenerated,
            posts: this.stats.forumPosts,
          }
        });
        this.stats.onChainLogs++;
        this.stats.lastSolanaTx = solanaTx.signature;
      } catch (error) {
        this.logger.warn('Daily report on-chain logging failed:', error.message);
      }
    }

    const report = await this.insightGen.generateDailyReport();
    
    const verificationLine = solanaTx 
      ? `\n\n🔗 **Daily Report Verified on Solana:** [View Transaction](${solanaTx.explorerUrl})`
      : '';
    
    await this.forum.createPost({
      title: `📊 AgentPulse Daily Report - ${new Date().toISOString().split('T')[0]}`,
      body: report.body + verificationLine,
      tags: ['progress-update', 'ai']
    });

    this.logger.info('📝 Daily report posted to forum');
    if (solanaTx) {
      this.logger.info(`   🔗 On-chain proof: ${solanaTx.explorerUrl}`);
    }
  }

  /**
   * Log autonomous action to database and optionally on-chain
   */
  async logAutonomousAction(action) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...action
    };

    // Store in database
    await this.db.logAction(logEntry);

    // Log important actions on-chain
    if (action.logOnChain && this.solana.canWrite()) {
      try {
        const tx = await this.solana.logActionOnChain({
          type: action.action,
          summary: action.title || action.action,
          metadata: action.details || {}
        });
        this.stats.onChainLogs++;
        this.stats.lastSolanaTx = tx.signature;
      } catch (error) {
        this.logger.warn('On-chain logging failed:', error.message);
      }
    }
  }

  /**
   * Get current stats including Solana metrics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: process.uptime(),
      isRunning: this.isRunning,
      solana: this.solana.getStats(),
    };
  }

  /**
   * Manually trigger hourly analysis (for testing)
   */
  async runHourlyAnalysis() {
    this.logger.info('🧪 Manual trigger: Running hourly analysis');
    await this.analyzeAndAct();
  }

  /**
   * Stop autonomous operations
   */
  stop() {
    this.logger.info('🛑 Stopping autonomous operations...');
    this.isRunning = false;
  }
}

export default AutonomousAgent;

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new AutonomousAgent();
  agent.start();
}
