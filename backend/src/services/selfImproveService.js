/**
 * Self-Improvement Service
 * 
 * The crown jewel of AgentPulse's autonomy — a feedback loop that
 * allows the agent to analyze its own performance and adapt its
 * strategy, prompts, and behavior parameters.
 * 
 * This is NOT about rewriting code. It's about:
 * - Analyzing which posts get the most engagement
 * - Adjusting posting times, topics, and style
 * - Learning from community feedback
 * - Storing evolution log on-chain for transparency
 * 
 * "Not just autonomous — self-evolving."
 * 
 * Schedule: Every 6 hours
 * 
 * @author AgentPulse (Agent #503)
 */

import Anthropic from '@anthropic-ai/sdk';
import { DatabaseService } from './database.js';
import { SolanaService } from './solanaService.js';
import { Logger } from '../utils/logger.js';

export class SelfImproveService {
  constructor() {
    this.db = new DatabaseService();
    this.solana = new SolanaService();
    this.logger = new Logger('SelfImprove');
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

    // Adaptive parameters that the agent can change
    this.strategy = {
      // Posting strategy
      postingTone: 'enthusiastic', // enthusiastic | analytical | balanced
      insightFocus: 'trends', // trends | predictions | community | technical
      optimalPostHour: 9, // UTC hour for best engagement
      
      // Quality thresholds
      minQualityScore: 6, // out of 8
      maxDailyPosts: 5,
      
      // Engagement targets
      targetUpvotesPerPost: 5,
      targetCommentsPerPost: 2,
      
      // Version tracking
      version: 1,
      lastAdapted: null,
      adaptationHistory: [],
    };

    this.stats = {
      adaptations: 0,
      lastAdaptationTime: null,
      currentStrategyVersion: 1,
    };
  }

  /**
   * Run the self-improvement cycle
   */
  async runImprovementCycle() {
    this.logger.info('🧬 Starting self-improvement cycle...');

    try {
      // Step 1: Gather performance metrics
      const metrics = await this.gatherMetrics();
      this.logger.info('📊 Metrics gathered:', JSON.stringify(metrics, null, 2));

      // Step 2: Analyze performance with Claude
      const analysis = await this.analyzePerformance(metrics);
      this.logger.info('🧠 Analysis:', analysis.summary);

      // Step 3: Generate adaptations
      const adaptations = await this.generateAdaptations(metrics, analysis);

      // Step 4: Apply adaptations
      if (adaptations.length > 0) {
        await this.applyAdaptations(adaptations);
        this.logger.info(`✅ Applied ${adaptations.length} adaptations`);
      } else {
        this.logger.info('ℹ️ No adaptations needed — strategy is working well');
      }

      // Step 5: Log evolution on-chain
      await this.logEvolutionOnChain(metrics, adaptations);

      // Step 6: Store improvement record
      await this.storeImprovementRecord(metrics, analysis, adaptations);

      this.stats.adaptations++;
      this.stats.lastAdaptationTime = Date.now();
      this.stats.currentStrategyVersion = this.strategy.version;

      return {
        metrics,
        analysis: analysis.summary,
        adaptations,
        strategyVersion: this.strategy.version,
      };

    } catch (error) {
      this.logger.error('Self-improvement cycle failed:', error.message);
      throw error;
    }
  }

  /**
   * Gather performance metrics from last period
   */
  async gatherMetrics() {
    const metrics = {
      period: '6h',
      timestamp: new Date().toISOString(),
    };

    try {
      // Post engagement metrics
      const postMetrics = await this.db.pool.query(`
        SELECT 
          COUNT(*) as total_posts,
          AVG(upvotes) as avg_upvotes,
          AVG(downvotes) as avg_downvotes,
          AVG(comment_count) as avg_comments,
          MAX(upvotes) as max_upvotes,
          SUM(upvotes) as total_upvotes
        FROM forum_posts 
        WHERE agent_name = 'agentpulse'
        AND created_at > NOW() - INTERVAL '24 hours'
      `);
      
      metrics.posts = {
        count: parseInt(postMetrics.rows[0]?.total_posts || 0),
        avgUpvotes: parseFloat(postMetrics.rows[0]?.avg_upvotes || 0).toFixed(1),
        avgComments: parseFloat(postMetrics.rows[0]?.avg_comments || 0).toFixed(1),
        maxUpvotes: parseInt(postMetrics.rows[0]?.max_upvotes || 0),
        totalUpvotes: parseInt(postMetrics.rows[0]?.total_upvotes || 0),
      };

      // Voting activity
      const votingMetrics = await this.db.pool.query(`
        SELECT COUNT(*) as votes_given
        FROM project_votes
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ votes_given: 0 }] }));

      metrics.voting = {
        votesGiven: parseInt(votingMetrics.rows[0]?.votes_given || 0),
      };

      // Comment response metrics
      const commentMetrics = await this.db.pool.query(`
        SELECT COUNT(*) as responses
        FROM comment_responses
        WHERE status = 'responded'
        AND created_at > NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ responses: 0 }] }));

      metrics.comments = {
        responsesGiven: parseInt(commentMetrics.rows[0]?.responses || 0),
      };

      // On-chain activity
      const chainMetrics = await this.db.pool.query(`
        SELECT COUNT(*) as on_chain
        FROM autonomy_log
        WHERE details::text LIKE '%solanaTx%'
        AND created_at > NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ on_chain: 0 }] }));

      metrics.onChain = {
        logsToday: parseInt(chainMetrics.rows[0]?.on_chain || 0),
      };

      // Current strategy
      metrics.currentStrategy = { ...this.strategy };

    } catch (error) {
      this.logger.warn('Partial metrics gathered:', error.message);
    }

    return metrics;
  }

  /**
   * Analyze performance with Claude
   */
  async analyzePerformance(metrics) {
    const prompt = `You are AgentPulse's self-improvement engine. Analyze these performance metrics and provide actionable feedback.

Current Strategy:
- Tone: ${this.strategy.postingTone}
- Focus: ${this.strategy.insightFocus}
- Quality threshold: ${this.strategy.minQualityScore}/8
- Max daily posts: ${this.strategy.maxDailyPosts}
- Strategy version: ${this.strategy.version}

Last 24h Performance:
- Posts created: ${metrics.posts?.count || 0}
- Avg upvotes per post: ${metrics.posts?.avgUpvotes || 0}
- Avg comments per post: ${metrics.posts?.avgComments || 0}
- Best post upvotes: ${metrics.posts?.maxUpvotes || 0}
- Votes given to others: ${metrics.voting?.votesGiven || 0}
- Comment responses: ${metrics.comments?.responsesGiven || 0}
- On-chain logs: ${metrics.onChain?.logsToday || 0}

Targets:
- Target upvotes/post: ${this.strategy.targetUpvotesPerPost}
- Target comments/post: ${this.strategy.targetCommentsPerPost}

Respond in JSON:
{
  "summary": "2-3 sentence overall assessment",
  "strengths": ["what's working well"],
  "weaknesses": ["what needs improvement"],
  "recommendations": [
    {
      "parameter": "postingTone|insightFocus|minQualityScore|maxDailyPosts|optimalPostHour",
      "currentValue": "...",
      "suggestedValue": "...",
      "reason": "why this change"
    }
  ],
  "performanceScore": <1-10>
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0]?.text?.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      this.logger.error('Claude analysis failed:', error.message);
    }

    return {
      summary: 'Analysis unavailable — maintaining current strategy.',
      strengths: [],
      weaknesses: [],
      recommendations: [],
      performanceScore: 5,
    };
  }

  /**
   * Generate concrete adaptations from analysis
   */
  async generateAdaptations(metrics, analysis) {
    const adaptations = [];

    for (const rec of analysis.recommendations || []) {
      // Validate the recommendation
      if (!rec.parameter || !rec.suggestedValue) continue;

      // Only adapt parameters we control
      const allowedParams = [
        'postingTone', 'insightFocus', 'minQualityScore',
        'maxDailyPosts', 'optimalPostHour',
      ];

      if (!allowedParams.includes(rec.parameter)) continue;

      // Validate values
      const validated = this.validateAdaptation(rec.parameter, rec.suggestedValue);
      if (validated !== null) {
        adaptations.push({
          parameter: rec.parameter,
          oldValue: this.strategy[rec.parameter],
          newValue: validated,
          reason: rec.reason,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return adaptations;
  }

  /**
   * Validate an adaptation value
   */
  validateAdaptation(parameter, value) {
    switch (parameter) {
      case 'postingTone':
        return ['enthusiastic', 'analytical', 'balanced'].includes(value) ? value : null;
      case 'insightFocus':
        return ['trends', 'predictions', 'community', 'technical'].includes(value) ? value : null;
      case 'minQualityScore':
        const score = parseInt(value);
        return score >= 4 && score <= 8 ? score : null;
      case 'maxDailyPosts':
        const posts = parseInt(value);
        return posts >= 2 && posts <= 8 ? posts : null;
      case 'optimalPostHour':
        const hour = parseInt(value);
        return hour >= 0 && hour <= 23 ? hour : null;
      default:
        return null;
    }
  }

  /**
   * Apply adaptations to strategy
   */
  async applyAdaptations(adaptations) {
    for (const adaptation of adaptations) {
      this.strategy[adaptation.parameter] = adaptation.newValue;
      this.logger.info(
        `🔄 Adapted ${adaptation.parameter}: ${adaptation.oldValue} → ${adaptation.newValue} (${adaptation.reason})`
      );
    }

    // Increment version
    this.strategy.version++;
    this.strategy.lastAdapted = new Date().toISOString();
    this.strategy.adaptationHistory.push({
      version: this.strategy.version,
      adaptations,
      timestamp: new Date().toISOString(),
    });

    // Keep last 20 adaptations in memory
    if (this.strategy.adaptationHistory.length > 20) {
      this.strategy.adaptationHistory = this.strategy.adaptationHistory.slice(-20);
    }
  }

  /**
   * Log evolution on Solana for transparency
   */
  async logEvolutionOnChain(metrics, adaptations) {
    if (!this.solana.canWrite() || adaptations.length === 0) return;

    try {
      const tx = await this.solana.logActionOnChain({
        type: 'SELF_IMPROVEMENT',
        summary: `Strategy v${this.strategy.version}: ${adaptations.length} adaptations`,
        metadata: {
          version: this.strategy.version,
          adaptations: adaptations.map(a => `${a.parameter}: ${a.oldValue}→${a.newValue}`),
          performanceScore: metrics.posts?.avgUpvotes || 0,
        },
      });

      this.logger.info(`🔗 Evolution logged on-chain: ${tx.signature.slice(0, 16)}...`);
      return tx;
    } catch (error) {
      this.logger.warn('On-chain evolution logging failed:', error.message);
    }
  }

  /**
   * Store improvement record in database
   */
  async storeImprovementRecord(metrics, analysis, adaptations) {
    try {
      await this.db.pool.query(`
        CREATE TABLE IF NOT EXISTS self_improvements (
          id SERIAL PRIMARY KEY,
          strategy_version INTEGER,
          metrics JSONB,
          analysis JSONB,
          adaptations JSONB,
          performance_score FLOAT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await this.db.pool.query(
        `INSERT INTO self_improvements 
         (strategy_version, metrics, analysis, adaptations, performance_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          this.strategy.version,
          JSON.stringify(metrics),
          JSON.stringify(analysis),
          JSON.stringify(adaptations),
          analysis.performanceScore || 5,
        ]
      );
    } catch (error) {
      this.logger.warn('Failed to store improvement record:', error.message);
    }
  }

  /**
   * Get current strategy (for other services to use)
   */
  getStrategy() {
    return { ...this.strategy };
  }

  /**
   * Get evolution history (for dashboard)
   */
  async getEvolutionHistory() {
    try {
      const result = await this.db.pool.query(`
        SELECT * FROM self_improvements
        ORDER BY created_at DESC
        LIMIT 20
      `);
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      strategy: {
        version: this.strategy.version,
        tone: this.strategy.postingTone,
        focus: this.strategy.insightFocus,
        lastAdapted: this.strategy.lastAdapted,
      },
    };
  }
}

export default SelfImproveService;
