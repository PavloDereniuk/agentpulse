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
 * - Comment responses every 30 minutes
 * - Project voting (intelligent, merit-based)
 * - Self-improvement through feedback loops
 * - ON-CHAIN LOGGING of all autonomous actions
 * 
 * @author AgentPulse (Agent #503)
 */

import cron from 'node-cron';
import { ColosseumAPI } from '../services/colosseumAPI.js';
import { InsightGenerator } from '../services/insightGenerator.js';
import { ForumService } from '../services/forumService.js';
import { DatabaseService } from '../services/database.js';
import { SolanaService } from '../services/solanaService.js';
import { CommentResponder } from '../services/commentResponder.js';
import { VotingService } from '../services/votingService.js';
import { Logger } from '../utils/logger.js';
import { QualityChecker } from '../utils/qualityChecker.js';
import { DailyDigestService } from '../services/dailyDigestService.js';
import { SpotlightService } from '../services/spotlightService.js';
import { LeaderboardService } from '../services/leaderboardService.js';
import { SelfImproveService } from '../services/selfImproveService.js';

class AutonomousAgent {
  constructor() {
    this.api = new ColosseumAPI();
    this.insightGen = new InsightGenerator();
    this.forum = new ForumService();
    this.db = new DatabaseService();
    this.solana = new SolanaService();
    this.commentResponder = new CommentResponder();
    this.votingService = new VotingService();
    this.dailyDigest = new DailyDigestService();
    this.spotlight = new SpotlightService();
    this.leaderboard = new LeaderboardService();
    this.leaderboard = new LeaderboardService();
    this.selfImprove = new SelfImproveService();
    this.logger = new Logger('AutonomousAgent');
    this.qualityChecker = new QualityChecker();
    
    // State
    this.isRunning = false;
    this.stats = {
      dataCollections: 0,
      insightsGenerated: 0,
      forumPosts: 0,
      forumComments: 0,
      commentResponses: 0,
      projectsEvaluated: 0,
      votesGiven: 0,
      teamMatches: 0,
      predictions: 0,
      improvements: 0,
      lastPostTime: null,
      lastCommentCheckTime: null,
      lastVotingTime: null,
      // Solana stats
      onChainLogs: 0,
      lastSolanaTx: null,
      digestsGenerated: 0,
      lastDigestTime: null,
      spotlightsGenerated: 0,
      lastSpotlightTime: null,
      leaderboardSnapshots: 0,
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

    // Load persisted stats from database
    await this.loadStatsFromDB();

    // Schedule autonomous loops
    this.scheduleDataCollection();
    this.scheduleHourlyAnalysis();
    this.scheduleCommentResponses();
    this.scheduleVoting();
    this.scheduleDailyReport();
    this.scheduleDailyDigest();
    this.scheduleSpotlight();
    this.scheduleLeaderboardSnapshots();

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
   * Comment Response Loop - Every 30 minutes
   */
  scheduleCommentResponses() {
    // Run at :15 and :45 of each hour
    cron.schedule('15,45 * * * *', async () => {
      if (!this.isRunning) return;
      
      this.logger.info('💬 Starting comment response cycle...');
      await this.respondToComments();
    });

    this.logger.info('✅ Comment responses scheduled (every 30 minutes)');
  }

  /**
   * Voting Loop - Every 4 hours
   */
  scheduleVoting() {
    // Run at 8:00, 12:00, 16:00, 20:00 UTC
    cron.schedule('0 8,12,16,20 * * *', async () => {
      if (!this.isRunning) return;
      
      this.logger.info('🗳️ Starting voting cycle...');
      await this.evaluateAndVote();
    });

    this.logger.info('✅ Voting scheduled (every 4 hours)');
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
   * Daily Digest — 9:00 and 18:00 UTC
   */
  scheduleDailyDigest() {
    cron.schedule('0 9,18 * * *', async () => {
      if (!this.isRunning) return;
      this.logger.info('📰 Starting Daily Digest...');
      await this.runDailyDigest();
    });
    this.logger.info('✅ Daily Digest scheduled (9:00 + 18:00 UTC)');
  }

  async runDailyDigest() {
    try {
      const digest = await this.dailyDigest.generateDigest();
      
      let solanaTx = null;
      if (this.solana.canWrite()) {
        try {
          solanaTx = await this.solana.logActionOnChain({
            type: 'DAILY_DIGEST',
            summary: digest.title,
            metadata: digest.stats,
          });
          this.stats.onChainLogs++;
          this.stats.lastSolanaTx = solanaTx.signature;
        } catch (e) {
          this.logger.warn('On-chain digest logging failed:', e.message);
        }
      }

      const verificationLine = solanaTx
        ? `\n\n🔗 **Verified on Solana:** [${solanaTx.signature.slice(0, 16)}...](${solanaTx.explorerUrl})`
        : '';

      // Retry with backoff if rate limited
      let posted = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.forum.createPost({
            title: digest.title,
            body: digest.body + verificationLine,
            tags: ['progress-update', 'ai'],
          });
          posted = true;
          break;
        } catch (err) {
          if (err.message?.includes('429') && attempt < 3) {
            this.logger.warn(`Rate limited, retry ${attempt}/3 in 30s...`);
            await new Promise(r => setTimeout(r, 30000));
          } else {
            throw err;
          }
        }
      }

      await this.dailyDigest.storeDigest(digest);
      this.stats.digestsGenerated++;
      this.stats.forumPosts++;
      this.stats.lastDigestTime = Date.now();
      this.stats.lastPostTime = Date.now();
      this.logger.info(`✅ Daily Digest posted: "${digest.title}"`);

      await this.logAutonomousAction({
        action: 'DAILY_DIGEST',
        title: digest.title,
        outcome: 'SUCCESS',
        solanaTx: solanaTx?.signature,
      });
    } catch (error) {
      this.logger.error('Daily Digest failed:', error.message);
      await this.logAutonomousAction({
        action: 'DAILY_DIGEST',
        outcome: 'FAILED',
        error: error.message,
      });
    }
  }

  async runDigest() {
    this.logger.info('🧪 Manual trigger: Running Daily Digest');
    await this.runDailyDigest();
  }

  scheduleSpotlight() {
    cron.schedule('0 15 * * *', async () => {
      if (!this.isRunning) return;
      this.logger.info('🔦 Starting Agent Spotlight...');
      await this.runSpotlight();
    });
    this.logger.info('✅ Spotlight scheduled (15:00 UTC)');
  }

  async runSpotlight() {
    try {
      const spotlight = await this.spotlight.generateSpotlight();
      if (!spotlight) {
        this.logger.info('No eligible project for spotlight today');
        return;
      }

      let solanaTx = null;
      if (this.solana.canWrite()) {
        try {
          solanaTx = await this.solana.logActionOnChain({
            type: 'AGENT_SPOTLIGHT',
            summary: `Spotlight: ${spotlight.projectName}`,
            metadata: { projectId: spotlight.projectId },
          });
          this.stats.onChainLogs++;
          this.stats.lastSolanaTx = solanaTx.signature;
        } catch (e) {
          this.logger.warn('On-chain spotlight logging failed:', e.message);
        }
      }

      const verificationLine = solanaTx
        ? `\n\n🔗 **Verified on Solana:** [${solanaTx.signature.slice(0, 16)}...](${solanaTx.explorerUrl})`
        : '';

      // Retry with backoff
      let posted = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.forum.createPost({
            title: spotlight.title,
            body: spotlight.body + verificationLine,
            tags: ['progress-update', 'ai'],
          });
          posted = true;
          break;
        } catch (err) {
          if (err.message?.includes('429') && attempt < 3) {
            this.logger.warn(`Rate limited, retry ${attempt}/3 in 30s...`);
            await new Promise(r => setTimeout(r, 30000));
          } else {
            throw err;
          }
        }
      }

      this.stats.spotlightsGenerated++;
      this.stats.forumPosts++;
      this.stats.lastSpotlightTime = Date.now();
      this.stats.lastPostTime = Date.now();
      this.logger.info(`✅ Spotlight posted: "${spotlight.title}"`);

      await this.logAutonomousAction({
        action: 'AGENT_SPOTLIGHT',
        title: spotlight.title,
        projectId: spotlight.projectId,
        outcome: 'SUCCESS',
        solanaTx: solanaTx?.signature,
      });
    } catch (error) {
      this.logger.error('Spotlight failed:', error.message);
      await this.logAutonomousAction({
        action: 'AGENT_SPOTLIGHT',
        outcome: 'FAILED',
        error: error.message,
      });
    }
  }

  async runSpotlightManual() {
    this.logger.info('🧪 Manual trigger: Running Spotlight');
    await this.runSpotlight();
  }

   scheduleLeaderboardSnapshots() {
    cron.schedule('0 */4 * * *', async () => {
      if (!this.isRunning) return;
      try {
        await this.leaderboard.storeSnapshot();
        this.stats.leaderboardSnapshots++;
      } catch (e) {
        this.logger.error('Leaderboard snapshot failed:', e.message);
      }
    });
    this.logger.info('✅ Leaderboard snapshots scheduled (every 4h)');
  }

  /**
   * Respond to comments on our posts
   */
  async respondToComments() {
    try {
      this.stats.lastCommentCheckTime = Date.now();
      
      const result = await this.commentResponder.checkAndRespond();
      
      this.stats.commentResponses += result.responded;
      this.stats.forumComments += result.responded;
      
      // Log on-chain if we responded to any comments
      if (result.responded > 0 && this.solana.canWrite()) {
        try {
          const tx = await this.solana.logActionOnChain({
            type: 'COMMENT_RESPONSES',
            summary: `Responded to ${result.responded} comments`,
            metadata: {
              processed: result.processed,
              responded: result.responded,
            }
          });
          this.stats.onChainLogs++;
          this.stats.lastSolanaTx = tx.signature;
          this.logger.info(`🔗 Comment responses logged on-chain: ${tx.signature.slice(0, 16)}...`);
        } catch (error) {
          this.logger.warn('On-chain logging failed:', error.message);
        }
      }

      await this.logAutonomousAction({
        action: 'COMMENT_CHECK',
        details: {
          processed: result.processed,
          responded: result.responded,
        },
        outcome: 'SUCCESS',
      });

    } catch (error) {
      this.logger.error('Comment response cycle failed:', error.message);
      await this.logAutonomousAction({
        action: 'COMMENT_CHECK',
        outcome: 'FAILED',
        error: error.message,
      });
    }
  }

/**
 * Load stats from database on startup
 */
async loadStatsFromDB() {
  try {
    // Forum posts from autonomy_log
    try {
      const posts = await this.db.pool.query(
        `SELECT COUNT(*) FROM autonomy_log WHERE action = 'FORUM_POST' AND outcome = 'SUCCESS'`
      );
      this.stats.forumPosts = parseInt(posts.rows[0]?.count || 0);
    } catch (e) { /* table may not exist */ }

    // Comment responses
    try {
      const comments = await this.db.pool.query(
        `SELECT COUNT(*) FROM comment_responses WHERE status = 'responded'`
      );
      this.stats.commentResponses = parseInt(comments.rows[0]?.count || 0);
    } catch (e) { /* table may not exist */ }

    // Votes
    try {
      const votes = await this.db.pool.query(
        `SELECT COUNT(*) FROM project_votes`
      );
      this.stats.votesGiven = parseInt(votes.rows[0]?.count || 0);
    } catch (e) { /* table may not exist */ }

    // On-chain logs
    try {
      const logs = await this.db.pool.query(
        `SELECT COUNT(*) FROM autonomy_log WHERE details::text LIKE '%solanaTx%'`
      );
      this.stats.onChainLogs = parseInt(logs.rows[0]?.count || 0);
    } catch (e) { /* table may not exist */ }

    this.logger.info(`📊 Loaded stats from DB: ${this.stats.forumPosts} posts, ${this.stats.votesGiven} votes, ${this.stats.onChainLogs} on-chain logs`);
  } catch (error) {
    this.logger.warn('Could not load stats from DB:', error.message);
  }
}

  /**
   * Evaluate projects and vote for quality ones
   */
  async evaluateAndVote() {
    try {
      this.stats.lastVotingTime = Date.now();
      
      const result = await this.votingService.evaluateAndVote();
      
      this.stats.projectsEvaluated += result.evaluated;
      this.stats.votesGiven += result.voted;
      
      // Log on-chain if we voted for any projects
      if (result.voted > 0 && this.solana.canWrite()) {
        try {
          const tx = await this.solana.logActionOnChain({
            type: 'PROJECT_VOTING',
            summary: `Voted for ${result.voted} quality projects`,
            metadata: {
              evaluated: result.evaluated,
              voted: result.voted,
            }
          });
          this.stats.onChainLogs++;
          this.stats.lastSolanaTx = tx.signature;
          this.logger.info(`🔗 Voting activity logged on-chain: ${tx.signature.slice(0, 16)}...`);
        } catch (error) {
          this.logger.warn('On-chain logging failed:', error.message);
        }
      }

      await this.logAutonomousAction({
        action: 'VOTING_CYCLE',
        details: {
          evaluated: result.evaluated,
          voted: result.voted,
        },
        outcome: 'SUCCESS',
      });

    } catch (error) {
      this.logger.error('Voting cycle failed:', error.message);
      await this.logAutonomousAction({
        action: 'VOTING_CYCLE',
        outcome: 'FAILED',
        error: error.message,
      });
    }
  }

  /**
   * Collect data from Colosseum API
   */
  async collectData() {
    try {
      const [projects, forumPosts, leaderboard] = await Promise.all([
        this.api.getProjects(),
        this.api.getForumPosts({ sort: 'new', limit: 50 }),
        this.api.getLeaderboard()
      ]);

      await this.db.storeProjects(projects);
      await this.db.storeForumPosts(forumPosts);
      await this.db.storeLeaderboard(leaderboard);

      this.stats.dataCollections++;
      
      this.logger.info(`✅ Data collected: ${projects.length} projects, ${forumPosts.length} posts`);
      
      await this.logAutonomousAction({
        action: 'DATA_COLLECTION',
        details: {
          projectsCount: projects.length,
          postsCount: forumPosts.length
        },
        outcome: 'SUCCESS',
        logOnChain: false
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
      const analysis = await this.insightGen.analyzeRecentActivity();
      
      this.logger.info('📊 Analysis complete:', {
        insights: analysis.insights.length,
        trends: analysis.trends.length,
        opportunities: analysis.opportunities.length
      });

      for (const insight of analysis.insights) {
        this.logger.info('📝 Processing insight:', insight.title);
        
        const qualityScore = await this.qualityChecker.evaluate(insight);
        
        this.logger.info(`Quality score: ${qualityScore.score}/${qualityScore.totalChecks}, passes: ${qualityScore.passesThreshold}`);
        
        if (qualityScore.passesThreshold) {
          this.logger.info('✅ Quality passed, deciding whether to post...');
          
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

      await this.identifyTeamMatches();
      await this.updatePredictions();
      await this.selfEvaluate();

    } catch (error) {
      this.logger.error('❌ Analysis failed:', error);
    }
  }

  /**
   * Autonomous decision: Should we post this insight?
   */
  async decideToPost(insight, qualityScore) {
    const timeSinceLastPost = this.stats.lastPostTime 
      ? Date.now() - this.stats.lastPostTime 
      : Infinity;

    const checks = {
      qualityPasses: qualityScore.score >= 6,
      notTooFrequent: timeSinceLastPost >= 3600000,
      dailyLimit: this.stats.forumPosts < 5,
      hasActionableValue: !!insight.actionable && insight.actionable.length > 0,
      isNovel: !(await this.db.isDuplicateInsight(insight))
    };

    const shouldPost = Object.values(checks).every(v => v === true);

    console.log('\n📋 POST DECISION CHECKS:');
    Object.entries(checks).forEach(([check, result]) => {
      const emoji = result ? '✅' : '❌';
      console.log(`${emoji} ${check}: ${result}`);
    });
    console.log(`\nFinal decision: ${shouldPost ? '✅ POST' : '❌ SKIP'}\n`);

    await this.logAutonomousAction({
      action: 'POST_DECISION',
      decision: shouldPost ? 'POST' : 'SKIP',
      reasoning: checks,
      qualityScore: qualityScore.score,
      logOnChain: false
    });

    return shouldPost;
  }

  /**
   * Post insight to forum with ON-CHAIN verification
   */
  async postInsightToForum(insight) {
    try {
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
        logOnChain: false
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
    try {
      const matches = await this.insightGen.findTeamMatches();
      
      for (const match of matches) {
        await this.forum.createComment({
          postId: match.postId,
          body: match.recommendation
        });

        this.stats.teamMatches++;
      }

      if (matches.length > 0) {
        this.logger.info(`🤝 Suggested ${matches.length} team matches`);
      }
    } catch (error) {
      this.logger.error('Team matching failed:', error.message);
    }
  }

  /**
   * Update predictions
   */
  async updatePredictions() {
    try {
      const predictions = await this.insightGen.generatePredictions();
      await this.db.storePredictions(predictions);
      this.stats.predictions += predictions.length;
    } catch (error) {
      this.logger.error('Predictions update failed:', error.message);
    }
  }

  /**
   * Self-evaluation and improvement
   */
  async selfEvaluate() {
    try {
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
          onChainLogs: this.stats.onChainLogs,
          commentResponses: this.stats.commentResponses,
          votesGiven: this.stats.votesGiven,
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
            commentResponses: this.stats.commentResponses,
            votesGiven: this.stats.votesGiven,
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

    this.stats.forumPosts++;
    this.stats.lastPostTime = Date.now();

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

    await this.db.logAction(logEntry);

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
   * Get current stats including all metrics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: process.uptime(),
      isRunning: this.isRunning,
      solana: this.solana.getStats(),
      commentResponder: this.commentResponder.getStats(),
      voting: this.votingService.getStats(),
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
   * Manually trigger comment responses (for testing)
   */
  async runCommentResponses() {
    this.logger.info('🧪 Manual trigger: Running comment responses');
    await this.respondToComments();
  }

  /**
   * Manually trigger voting (for testing)
   */
  async runVoting() {
    this.logger.info('🧪 Manual trigger: Running voting cycle');
    await this.evaluateAndVote();
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
  // agent.start();
}
