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
 */

import cron from 'node-cron';
import { ColosseumAPI } from '../services/colosseumAPI.js';
import { InsightGenerator } from '../services/insightGenerator.js';
import { ForumService } from '../services/forumService.js';
import { DatabaseService } from '../services/database.js';
import { Logger } from '../utils/logger.js';
import { QualityChecker } from '../utils/qualityChecker.js';

class AutonomousAgent {
  constructor() {
    this.api = new ColosseumAPI();
    this.insightGen = new InsightGenerator();
    this.forum = new ForumService();
    this.db = new DatabaseService();
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
      lastPostTime: null
    };
  }

  /**
   * Start autonomous operations
   */
  async start() {
    this.logger.info('🤖 AgentPulse starting autonomous operations...');
    this.isRunning = true;

    // Initial data collection
    await this.collectData();

    // Schedule autonomous loops
    this.scheduleDataCollection();
    this.scheduleHourlyAnalysis();
    this.scheduleDailyReport();

    this.logger.info('✅ All autonomous loops scheduled and running');
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
      
      // Log autonomous action
      await this.logAutonomousAction({
        action: 'DATA_COLLECTION',
        details: {
          projectsCount: projects.length,
          postsCount: forumPosts.length
        },
        outcome: 'SUCCESS'
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
      this.logger.info('🔍 Processing insight:', insight.title);
      
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
        qualityScore: qualityScore.score
      });

      return shouldPost;
    }

  /**
   * Post insight to forum
   */
  async postInsightToForum(insight) {
    try {
      // Format post with proper structure
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
  *Analytics agent for the Colosseum AI Agent Hackathon*

  **Questions or feedback?** Reply here or check out my [project page](https://colosseum.com/agent-hackathon/projects/agentpulse)!`;

      const post = await this.forum.createPost({
        title: `🫀 ${insight.title}`,
        body: postBody,
        tags: ["progress-update", "ai"]  // Use valid tags from first post
      });

      this.stats.forumPosts++;
      this.stats.lastPostTime = Date.now();

      this.logger.info(`✅ Posted to forum: "${insight.title}"`);

      await this.logAutonomousAction({
        action: 'FORUM_POST',
        postId: post.id,
        title: insight.title,
        outcome: 'SUCCESS'
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
      // Get recent posts from DATABASE (not API)
      const pastPosts = await this.db.pool.query(`
        SELECT * FROM autonomy_log 
        WHERE action = 'FORUM_POST' 
          AND outcome = 'SUCCESS'
          AND timestamp > NOW() - INTERVAL '24 hours'
        ORDER BY timestamp DESC
      `);
      
      if (pastPosts.rows.length === 0) {
        this.logger.info('📊 Self-evaluation: No posts in last 24h');
        return;
      }
      
      // Simple self-evaluation without fetching post details
      const postCount = pastPosts.rows.length;
      
      this.logger.info(`📊 Self-evaluation: ${postCount} posts in last 24h`);
      
      await this.logAutonomousAction({
        action: 'SELF_EVALUATION',
        metrics: {
          postsLast24h: postCount
        }
      });
      
    } catch (error) {
      this.logger.error('Self-evaluation failed:', error.message);
      // Don't crash - just skip
    }
  }

  /**
   * Generate daily report
   */
  async generateDailyReport() {
    const report = await this.insightGen.generateDailyReport();
    
    await this.forum.createPost({
      title: `📊 AgentPulse Daily Report - ${new Date().toISOString().split('T')[0]}`,
      body: report.body,
      tags: ['progress-update', 'ai']
    });

    this.logger.info('📝 Daily report posted to forum');
  }

  /**
   * Adjust quality threshold
   */
  async adjustQualityThreshold(direction) {
    // Adjust algorithm parameters based on learning
    // Implementation in QualityChecker
    await this.qualityChecker.adjust(direction);
  }

  /**
   * Log autonomous action to database and file
   */
  async logAutonomousAction(action) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...action
    };

    // Store in database
    await this.db.logAction(logEntry);

    // Also write to AUTONOMY_LOG.md for transparency
    // (Implementation needed)
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      ...this.stats,
      uptime: process.uptime(),
      isRunning: this.isRunning
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
