/**
 * Reasoning Service для AgentPulse
 * 
 * 
 * @author AgentPulse (Agent #503)
 */

import { Logger } from '../utils/logger.js';

export class ReasoningService {
  constructor() {
    this.logger = new Logger('ReasoningService');
  }

  /**
   * Генерує reasoning для голосування за проект
   * @param {Object} project - Проект хакатону
   * @param {Object} evaluation - Результат оцінки
   * @returns {Object} reasoning data
   */
  generateVoteReasoning(project, evaluation) {
    const hasDemo = !!(project.presentationLink || project.demoUrl);
    const hasRepo = !!project.repoLink;
    const hasVideo = !!project.presentationLink;
    const descriptionQuality = this.assessDescriptionQuality(project.description);

    const reasoningSteps = [
      `=== VOTE DECISION FOR PROJECT #${project.id} ===`,
      ``,
      `1. PROJECT OVERVIEW`,
      `   Name: "${project.name}"`,
      `   Tagline: ${project.tagline || 'N/A'}`,
      `   Description length: ${project.description?.length || 0} chars`,
      ``,
      `2. OBJECTIVE ANALYSIS (40% weight)`,
      `   Score: ${evaluation.objectiveScore.toFixed(1)}/10`,
      `   ✓ Demo/Deployment: ${hasDemo ? '✅ YES (+3.0)' : '❌ NO (0.0)'}`,
      `   ✓ GitHub Repository: ${hasRepo ? '✅ YES (+2.0)' : '❌ NO (0.0)'}`,
      `   ✓ Description: ${descriptionQuality.label} (${descriptionQuality.score})`,
      `   ✓ Video Demo: ${hasVideo ? '✅ YES (+1.0)' : '❌ NO (0.0)'}`,
      ``,
      `3. AI EVALUATION BY CLAUDE (60% weight)`,
      `   Overall Score: ${evaluation.claudeScore.toFixed(1)}/10`,
      `   Breakdown:`,
      `   • Innovation: ${evaluation.breakdown.innovation}/10 - ${this.interpretScore(evaluation.breakdown.innovation)}`,
      `   • Effort: ${evaluation.breakdown.effort}/10 - ${this.interpretScore(evaluation.breakdown.effort)}`,
      `   • Potential: ${evaluation.breakdown.potential}/10 - ${this.interpretScore(evaluation.breakdown.potential)}`,
      `   • Ecosystem Fit: ${evaluation.breakdown.fit}/10 - ${this.interpretScore(evaluation.breakdown.fit)}`,
      `   `,
      `   Claude's Assessment: "${evaluation.reasoning}"`,
      ``,
      `4. FINAL CALCULATION`,
      `   Formula: (Objective × 0.4) + (Claude × 0.6)`,
      `   Result: (${evaluation.objectiveScore.toFixed(1)} × 0.4) + (${evaluation.claudeScore.toFixed(1)} × 0.6)`,
      `   Final Score: ${evaluation.finalScore.toFixed(2)}/10`,
      `   `,
      `   Threshold: 5.5/10 (balanced strategy)`,
      `   ${evaluation.finalScore >= 7.5 ? '⭐ EXCELLENT PROJECT - Priority vote!' : ''}`,
      ``,
      `5. DECISION`,
      evaluation.finalScore >= 5.5 
        ? `   ✅ VOTE FOR THIS PROJECT`
        : `   ❌ SKIP - Below quality threshold`,
      evaluation.finalScore >= 5.5
        ? `   Confidence: ${this.calculateConfidence(evaluation.finalScore)}%`
        : `   Reason: Score ${evaluation.finalScore.toFixed(1)} < 5.5 threshold`,
      ``,
      `=== END OF REASONING ===`,
    ];

    return {
      decision: evaluation.finalScore >= 5.5 ? 'VOTE' : 'SKIP',
      reasoning: reasoningSteps.join('\n'),
      confidence: this.calculateConfidence(evaluation.finalScore) / 100,
      factors: {
        projectId: project.id,
        projectName: project.name,
        objectiveScore: evaluation.objectiveScore,
        claudeScore: evaluation.claudeScore,
        finalScore: evaluation.finalScore,
        hasDemo,
        hasRepo,
        hasVideo,
        descriptionQuality: descriptionQuality.label,
        innovation: evaluation.breakdown.innovation,
        effort: evaluation.breakdown.effort,
        potential: evaluation.breakdown.potential,
        fit: evaluation.breakdown.fit,
        thresholdMet: evaluation.finalScore >= 5.5,
        isPriority: evaluation.finalScore >= 7.5,
      },
    };
  }

  /**
   * Генерує reasoning для відповіді на коментар
   * @param {Object} comment - Коментар від користувача
   * @param {Object} response - Згенерована відповідь
   * @returns {Object} reasoning data
   */
  generateCommentReasoning(comment, response) {
    const reasoningSteps = [
      `=== COMMENT RESPONSE DECISION ===`,
      ``,
      `1. COMMENT ANALYSIS`,
      `   Author: ${comment.author || 'Unknown'}`,
      `   Posted: ${comment.timestamp || 'Unknown time'}`,
      `   Content preview: "${comment.content?.slice(0, 150)}..."`,
      `   Length: ${comment.content?.length || 0} characters`,
      ``,
      `2. CONTEXT EVALUATION`,
      `   Topic: ${response.topic || 'General discussion'}`,
      `   Sentiment: ${response.sentiment || 'Neutral'}`,
      `   Question detected: ${response.hasQuestion ? 'Yes' : 'No'}`,
      `   Urgency level: ${response.urgency || 'Normal'}`,
      ``,
      `3. RESPONSE STRATEGY`,
      `   Approach: ${response.strategy || 'Helpful and informative'}`,
      `   Tone: ${response.tone || 'Professional yet friendly'}`,
      `   Key points to address:`,
      response.keyPoints?.map(p => `   • ${p}`).join('\n') || '   • Provide value',
      ``,
      `4. GENERATED RESPONSE`,
      `   Length: ${response.content?.length || 0} characters`,
      `   Preview: "${response.content?.slice(0, 100)}..."`,
      ``,
      `5. DECISION`,
      `   ✅ POST RESPONSE`,
      `   Rationale: Maintaining community engagement and providing value`,
      `   Expected impact: ${response.expectedImpact || 'Positive community interaction'}`,
      ``,
      `=== END OF REASONING ===`,
    ];

    return {
      decision: 'POST_COMMENT',
      reasoning: reasoningSteps.join('\n'),
      confidence: response.confidence || 0.85,
      factors: {
        commentAuthor: comment.author,
        commentLength: comment.content?.length || 0,
        sentiment: response.sentiment,
        hasQuestion: response.hasQuestion,
        urgency: response.urgency,
        strategy: response.strategy,
        tone: response.tone,
        responseLength: response.content?.length || 0,
      },
    };
  }

  /**
   * Генерує reasoning для Daily Digest
   * @param {Object} stats - Статистика хакатону
   * @param {Object} insights - Згенеровані інсайти
   * @returns {Object} reasoning data
   */
  generateDigestReasoning(stats, insights) {
    const reasoningSteps = [
      `=== DAILY DIGEST GENERATION DECISION ===`,
      ``,
      `1. ECOSYSTEM SNAPSHOT`,
      `   Total agents: ${stats.totalAgents || 0}`,
      `   Total projects: ${stats.totalProjects || 0}`,
      `   New projects (24h): ${stats.newProjects || 0}`,
      `   Active voters: ${stats.activeVoters || 0}`,
      `   Forum activity: ${stats.forumPosts || 0} posts, ${stats.forumComments || 0} comments`,
      ``,
      `2. TREND ANALYSIS`,
      `   Top trending category: ${insights.topCategory || 'Unknown'}`,
      `   Trending projects: ${insights.trendingProjects?.join(', ') || 'Multiple'}`,
      `   Key development: ${insights.keyDevelopment || 'Steady progress'}`,
      `   Community sentiment: ${insights.sentiment || 'Positive'}`,
      ``,
      `3. QUALITY METRICS`,
      `   Average project score: ${stats.averageScore?.toFixed(1) || 'N/A'}/10`,
      `   Projects with demos: ${stats.projectsWithDemos || 0} (${((stats.projectsWithDemos / stats.totalProjects) * 100).toFixed(0)}%)`,
      `   GitHub integration: ${stats.projectsWithRepos || 0} (${((stats.projectsWithRepos / stats.totalProjects) * 100).toFixed(0)}%)`,
      ``,
      `4. NOTEWORTHY INSIGHTS`,
      insights.keyFindings?.map(f => `   • ${f}`).join('\n') || '   • Ecosystem continues to evolve',
      ``,
      `5. DECISION`,
      `   ✅ PUBLISH DAILY DIGEST`,
      `   Purpose: Help community discover quality projects and understand trends`,
      `   Value proposition: Synthesize complex ecosystem data into actionable insights`,
      `   Expected reach: ${insights.expectedReach || 'High - all hackathon participants'}`,
      ``,
      `=== END OF REASONING ===`,
    ];

    return {
      decision: 'PUBLISH_DIGEST',
      reasoning: reasoningSteps.join('\n'),
      confidence: 0.95,
      factors: {
        totalProjects: stats.totalProjects,
        newProjects: stats.newProjects,
        topCategory: insights.topCategory,
        sentiment: insights.sentiment,
        averageScore: stats.averageScore,
        projectsWithDemos: stats.projectsWithDemos,
        dataQuality: stats.dataQuality || 'high',
      },
    };
  }

  /**
   * Генерує reasoning для зміни стратегії
   * @param {Object} oldStrategy - Стара стратегія
   * @param {Object} newStrategy - Нова стратегія
   * @param {Object} performance - Дані про продуктивність
   * @returns {Object} reasoning data
   */
  generateStrategyReasoning(oldStrategy, newStrategy, performance) {
    const reasoningSteps = [
      `=== AUTONOMOUS STRATEGY ADJUSTMENT ===`,
      ``,
      `1. PERFORMANCE ANALYSIS (${performance.days} days)`,
      `   Data points analyzed: ${performance.dataPoints}`,
      `   Success rate: ${performance.successRate.toFixed(1)}%`,
      `   Correlation with human votes: ${performance.correlation.toFixed(3)}`,
      `   Accuracy: ${performance.oldAccuracy.toFixed(1)}%`,
      ``,
      `2. OLD STRATEGY`,
      `   ${JSON.stringify(oldStrategy, null, 2)}`,
      ``,
      `3. IDENTIFIED OPTIMIZATION`,
      `   Finding: ${performance.finding}`,
      `   Root cause: ${performance.rootCause}`,
      `   Proposed change: ${performance.proposedChange}`,
      ``,
      `4. NEW STRATEGY`,
      `   ${JSON.stringify(newStrategy, null, 2)}`,
      ``,
      `5. EXPECTED IMPACT`,
      `   Predicted accuracy: ${performance.expectedAccuracy.toFixed(1)}%`,
      `   Improvement: +${performance.expectedImprovement.toFixed(1)}%`,
      `   Confidence in change: ${(performance.confidence * 100).toFixed(0)}%`,
      ``,
      `6. DECISION`,
      `   ✅ ADJUST STRATEGY`,
      `   Type: ${performance.type || 'Weights adjustment'}`,
      `   Rationale: Self-optimization to better align with human voting patterns`,
      `   Rollback trigger: If accuracy drops below ${(performance.oldAccuracy - 5).toFixed(1)}%`,
      ``,
      `=== END OF REASONING ===`,
    ];

    return {
      decision: 'ADJUST_STRATEGY',
      reasoning: reasoningSteps.join('\n'),
      confidence: performance.confidence,
      factors: {
        daysAnalyzed: performance.days,
        dataPoints: performance.dataPoints,
        oldAccuracy: performance.oldAccuracy,
        newAccuracy: performance.expectedAccuracy,
        improvement: performance.expectedImprovement,
        correlation: performance.correlation,
        type: performance.type,
        oldStrategy: oldStrategy,
        newStrategy: newStrategy,
      },
    };
  }

  /**
   * Генерує reasoning для Agent Spotlight
   * @param {Object} agent - Агент для spotlight
   * @param {Object} analysis - Результат аналізу
   * @returns {Object} reasoning data
   */
  generateSpotlightReasoning(agent, analysis) {
    const reasoningSteps = [
      `=== AGENT SPOTLIGHT SELECTION ===`,
      ``,
      `1. CANDIDATE SELECTION`,
      `   Agent ID: ${agent.id}`,
      `   Agent Name: ${agent.name}`,
      `   Project: ${agent.projectName || 'Unknown'}`,
      `   Total agents evaluated: ${analysis.totalEvaluated || 0}`,
      ``,
      `2. EVALUATION CRITERIA`,
      `   Innovation score: ${analysis.innovationScore}/10`,
      `   Community engagement: ${analysis.engagementScore}/10`,
      `   Technical quality: ${analysis.technicalScore}/10`,
      `   Uniqueness: ${analysis.uniquenessScore}/10`,
      ``,
      `3. STANDOUT QUALITIES`,
      analysis.standoutQualities?.map(q => `   • ${q}`).join('\n') || '   • Multiple strengths',
      ``,
      `4. DECISION`,
      `   ✅ FEATURE IN SPOTLIGHT`,
      `   Reason: ${analysis.selectionReason}`,
      `   Expected value: Help community discover exceptional work`,
      ``,
      `=== END OF REASONING ===`,
    ];

    return {
      decision: 'PUBLISH_SPOTLIGHT',
      reasoning: reasoningSteps.join('\n'),
      confidence: 0.90,
      factors: {
        agentId: agent.id,
        innovationScore: analysis.innovationScore,
        engagementScore: analysis.engagementScore,
        technicalScore: analysis.technicalScore,
        uniquenessScore: analysis.uniquenessScore,
      },
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Оцінює якість опису
   */
  assessDescriptionQuality(description) {
    if (!description) return { label: 'None', score: 0 };
    const length = description.length;
    
    if (length > 500) return { label: 'Excellent', score: 2.5 };
    if (length > 300) return { label: 'Detailed', score: 2.0 };
    if (length > 150) return { label: 'Good', score: 1.5 };
    if (length > 50) return { label: 'Basic', score: 0.5 };
    return { label: 'Minimal', score: 0.2 };
  }

  /**
   * Інтерпретує числовий score
   */
  interpretScore(score) {
    if (score >= 9) return 'Outstanding';
    if (score >= 8) return 'Excellent';
    if (score >= 7) return 'Very Good';
    if (score >= 6) return 'Good';
    if (score >= 5) return 'Acceptable';
    if (score >= 4) return 'Below Average';
    return 'Poor';
  }

  /**
   * Розраховує confidence based на score
   */
  calculateConfidence(finalScore) {
    // Higher scores = higher confidence
    if (finalScore >= 8.0) return 95;
    if (finalScore >= 7.0) return 90;
    if (finalScore >= 6.5) return 85;
    if (finalScore >= 6.0) return 80;
    if (finalScore >= 5.5) return 75;
    if (finalScore >= 5.0) return 70;
    if (finalScore >= 4.0) return 65;
    return 60;
  }

  /**
   * Отримати статистику reasoning
   */
  getStats() {
    return {
      service: 'ReasoningService',
      version: '1.0.0',
      capabilities: [
        'Vote reasoning',
        'Comment reasoning',
        'Digest reasoning',
        'Strategy reasoning',
        'Spotlight reasoning',
      ],
    };
  }
}

export default ReasoningService;
