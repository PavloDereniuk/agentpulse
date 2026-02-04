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
        // Check quality threshold
        const qualityScore = await this.qualityChecker.evaluate(insight);
        
        if (qualityScore.passesThreshold) {
          // Decide: Should we post this?
          const shouldPost = await this.decideToPost(insight, qualityScore);
          
          if (shouldPost) {
            await this.postInsightToForum(insight);
          }
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
      hasActionableValue: insight.actionable,
      isNovel: !await this.db.isDuplicateInsight(insight)
    };

    const shouldPost = Object.values(checks).every(v => v === true);

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
      const post = await this.forum.createPost({
        title: insight.title,
        body: insight.body,
        tags: insight.tags
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
      this.logger.error('❌ Forum post failed:', error);
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
    // Check past posts performance
    const pastPosts = await this.db.getRecentPosts(24); // Last 24 hours
    
    let totalUpvotes = 0;
    let totalEngagement = 0;

    for (const post of pastPosts) {
      const current = await this.forum.getPost(post.id);
      totalUpvotes += current.upvotes;
      totalEngagement += current.commentCount;
    }

    const avgUpvotes = pastPosts.length > 0 ? totalUpvotes / pastPosts.length : 0;
    
    // If performance is low, adjust algorithms
    if (avgUpvotes < 3 && pastPosts.length >= 3) {
      await this.adjustQualityThreshold('increase');
      this.stats.improvements++;
      
      this.logger.info('🔧 Self-improvement: Increased quality threshold');
    }

    await this.logAutonomousAction({
      action: 'SELF_EVALUATION',
      metrics: {
        avgUpvotes,
        totalPosts: pastPosts.length
      }
    });
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
