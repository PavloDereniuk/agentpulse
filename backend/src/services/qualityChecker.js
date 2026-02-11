/**
 * Quality Checker
 * 
 * Evaluates insights before posting to ensure high quality
 * and prevent spam.
 * 
 * Quality Threshold: 6/8 checks must pass
 */

import { DatabaseService } from '../services/database.js';
import { Logger } from './logger.js';

export class QualityChecker {
  constructor() {
    this.db = new DatabaseService();
    this.logger = new Logger('QualityChecker');
    this.threshold = 0.75; // 6/8 = 0.75
    this.minPostInterval = 3600000; // 1 hour in ms
    this.maxDailyPosts = 5;
  }

  /**
   * Evaluate insight quality
   * Returns score and detailed breakdown
   */
  async evaluate(insight) {
    const checks = {
      hasData: this.checkHasData(insight),
      isNovel: await this.checkIsNovel(insight),
      isRelevant: this.checkRelevance(insight),
      answersQuestion: this.checkAnswersQuestion(insight),
      providesAction: this.checkProvidesAction(insight),
      notTooFrequent: await this.checkPostFrequency(),
      dailyLimit: await this.checkDailyLimit(),
      engagementPotential: this.predictEngagement(insight)
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    const score = passedChecks;
    const passesThreshold = passedChecks >= 6;

    const results = Object.entries(checks).map(([check, result]) => 
      `${result ? '✅' : '❌'} ${check}`
    ).join(', ');
    
    this.logger.info(`Quality Check: ${passedChecks}/${totalChecks} passed - ${passesThreshold ? 'WILL POST' : 'SKIP'} [${results}]`);

    return {
      score,
      totalChecks,
      passesThreshold,
      checks,
      breakdown: this.formatBreakdown(checks)
    };
  }

  /**
   * Check 1: Has sufficient data points
   */
  checkHasData(insight) {
    const dataPoints = insight.dataPoints || 0;
    return dataPoints >= 5;
  }

  /**
   * Check 2: Is novel (not duplicate or similar)
   */
  async checkIsNovel(insight) {
    // Check recent posts for similar content
    const recentPosts = await this.db.getRecentPosts(48); // Last 48 hours
    
    for (const post of recentPosts) {
      const similarity = this.calculateSimilarity(insight.title, post.title);
      if (similarity > 0.8) {
        return false; // Too similar
      }
    }
    
    return true;
  }

  /**
   * Check 3: Is relevant to hackathon/community
   */
  checkRelevance(insight) {
    const relevanceScore = this.calculateRelevanceScore(insight);
    return relevanceScore > 0.7;
  }

  /**
   * Check 4: Answers a question or solves an issue
   */
  checkAnswersQuestion(insight) {
    return !!insight.solvesIssue || !!insight.answersQuestion;
  }

  /**
   * Check 5: Provides actionable recommendations
   */
  checkProvidesAction(insight) {
    return !!insight.actionable && insight.actionable.length > 0;
  }

  /**
   * Check 6: Not posting too frequently
   */
  async checkPostFrequency() {
    const lastPost = await this.db.getLastPostTime();
    if (!lastPost) return true;
    
    const timeSince = Date.now() - lastPost;
    return timeSince >= this.minPostInterval;
  }

  /**
   * Check 7: Under daily limit
   */
  async checkDailyLimit() {
    const todayCount = await this.db.getTodayPostCount();
    return todayCount < this.maxDailyPosts;
  }

  /**
   * Check 8: Predicts good engagement
   */
  predictEngagement(insight) {
    // Simple heuristic for now
    // Can be improved with ML model
    let score = 0;
    
    // Has numbers/data
    if (/\d+/.test(insight.body)) score += 0.2;
    
    // Has specific examples
    if (insight.examples && insight.examples.length > 0) score += 0.2;
    
    // Trending topic
    if (insight.trending) score += 0.3;
    
    // Clear value proposition
    if (insight.title.includes('How to') || insight.title.includes('Guide')) score += 0.2;
    
    // Has visualization/data
    if (insight.hasVisualization) score += 0.1;
    
    return score > 0.6;
  }

  /**
   * Calculate text similarity (simple)
   */
  calculateSimilarity(text1, text2) {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size; // Jaccard similarity
  }

  /**
   * Calculate relevance score
   */
  calculateRelevanceScore(insight) {
    let score = 0;
    
    // Keywords related to hackathon
    const keywords = ['agent', 'solana', 'project', 'team', 'build', 'hackathon'];
    const text = (insight.title + ' ' + insight.body).toLowerCase();
    
    for (const keyword of keywords) {
      if (text.includes(keyword)) score += 0.15;
    }
    
    // Has tags
    if (insight.tags && insight.tags.length > 0) score += 0.2;
    
    return Math.min(score, 1.0);
  }

  /**
   * Format breakdown for logging
   */
  formatBreakdown(checks) {
    return Object.entries(checks).map(([check, passed]) => ({
      check,
      passed,
      emoji: passed ? '✅' : '❌'
    }));
  }

  /**
   * Adjust threshold based on performance
   */
  async adjust(direction) {
    if (direction === 'increase') {
      this.threshold = Math.min(this.threshold + 0.05, 0.9);
      this.minPostInterval = Math.min(this.minPostInterval * 1.2, 7200000); // Max 2 hours
    } else if (direction === 'decrease') {
      this.threshold = Math.max(this.threshold - 0.05, 0.6);
      this.minPostInterval = Math.max(this.minPostInterval * 0.8, 1800000); // Min 30 mins
    }

    // Log adjustment
    await this.db.logAction({
      action: 'QUALITY_ADJUSTMENT',
      direction,
      newThreshold: this.threshold,
      newInterval: this.minPostInterval
    });
  }

  /**
   * Get current settings
   */
  getSettings() {
    return {
      threshold: this.threshold,
      minPostInterval: this.minPostInterval,
      maxDailyPosts: this.maxDailyPosts
    };
  }
}
