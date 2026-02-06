/**
 * Voting Service - Enhanced Version
 * 
 * Intelligently votes for quality projects in the hackathon.
 * 
 * Strategy:
 * - Hybrid evaluation: objective metrics (40%) + Claude analysis (60%)
 * - Hackathon-friendly scoring (projects are WIP)
 * - Vote for genuinely good projects (not vote exchange!)
 * - Rate limit to avoid spam
 * - Log all votes on-chain for transparency
 * 
 * @author AgentPulse (Agent #503)
 */

import Anthropic from '@anthropic-ai/sdk';
import { ColosseumAPI } from './colosseumAPI.js';
import { DatabaseService } from './database.js';
import { Logger } from '../utils/logger.js';

export class VotingService {
  constructor() {
    this.api = new ColosseumAPI();
    this.db = new DatabaseService();
    this.logger = new Logger('VotingService');
    
    // Initialize Claude for project evaluation
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    // Config
    this.config = {
      maxVotesPerDay: 15, // Increased from 10
      minScoreToVote: 6, // Lowered from 7 (more realistic for hackathon)
      skipOwnProject: true,
      ownProjectId: 244, // AgentPulse project ID
    };
    
    // Stats
    this.stats = {
      projectsEvaluated: 0,
      votesGiven: 0,
      lastVoteTime: null,
    };
  }

  /**
   * Main function: Evaluate and vote for quality projects
   */
  async evaluateAndVote() {
    this.logger.info('🗳️ Starting voting cycle...');

    try {
      // Check daily vote limit
      const todayVotes = await this.getTodayVoteCount();
      if (todayVotes >= this.config.maxVotesPerDay) {
        this.logger.info(`Daily vote limit reached (${todayVotes}/${this.config.maxVotesPerDay})`);
        return { evaluated: 0, voted: 0, reason: 'daily_limit' };
      }

      const remainingVotes = this.config.maxVotesPerDay - todayVotes;

      // Get projects we haven't voted for yet
      const projects = await this.getUnvotedProjects();
      
      if (projects.length === 0) {
        this.logger.info('No new projects to evaluate');
        return { evaluated: 0, voted: 0, reason: 'no_projects' };
      }

      this.logger.info(`Found ${projects.length} projects to evaluate`);

      let evaluated = 0;
      let voted = 0;

      // Evaluate and vote
      for (const project of projects) {
        if (voted >= remainingVotes) break;
        
        // Skip own project
        if (project.id === this.config.ownProjectId) continue;

        evaluated++;
        this.stats.projectsEvaluated++;

        // HYBRID EVALUATION: Objective + Claude
        const objectiveScore = this.calculateObjectiveScore(project);
        const claudeEval = await this.evaluateWithClaude(project);
        
        // Combine: 40% objective + 60% Claude
        const finalScore = (objectiveScore * 0.4) + (claudeEval.score * 0.6);
        
        const evaluation = {
          projectId: project.id,
          projectName: project.name,
          objectiveScore,
          claudeScore: claudeEval.score,
          finalScore: Math.round(finalScore * 10) / 10,
          breakdown: {
            objective: objectiveScore,
            claude: claudeEval.score,
            ...claudeEval.breakdown
          },
          reasoning: claudeEval.reasoning,
          shouldVote: finalScore >= this.config.minScoreToVote,
          evaluatedAt: new Date().toISOString()
        };
        
        this.logger.info(
          `Project ${project.id} (${project.name}): ` +
          `Obj=${objectiveScore}/10, Claude=${claudeEval.score}/10, ` +
          `Final=${evaluation.finalScore}/10`
        );

        // Store evaluation
        await this.storeEvaluation(project.id, evaluation);

        // Vote if quality is high enough
        if (evaluation.shouldVote && finalScore >= this.config.minScoreToVote) {
          const success = await this.voteForProject(project, evaluation);
          if (success) {
            voted++;
            this.stats.votesGiven++;
            this.stats.lastVoteTime = Date.now();
          }
        } else {
          this.logger.info(`Project ${project.id} score ${evaluation.finalScore}/10 - below threshold`);
        }

        // Rate limiting
        await this.delay(2000);
      }

      this.logger.info(`✅ Voting complete: ${evaluated} evaluated, ${voted} votes given`);
      
      return { evaluated, voted };

    } catch (error) {
      this.logger.error('Voting cycle failed:', error.message);
      throw error;
    }
  }

  /**
   * Calculate objective score based on completeness
   * Returns 0-10 score
   */
  calculateObjectiveScore(project) {
    let score = 0;

    // 1. Name and tagline (1 point)
    if (project.name && project.name.length > 3) score += 0.5;
    if (project.tagline && project.tagline.length > 20) score += 0.5;

    // 2. Description quality (2.5 points)
    if (project.description) {
      if (project.description.length > 300) score += 2.5;
      else if (project.description.length > 150) score += 1.5;
      else if (project.description.length > 50) score += 0.5;
    }

    // 3. Demo/deployment (3 points - most important!)
    if (project.technicalDemoLink || project.demoUrl) {
      score += 2.0;
      // Bonus for deployed apps (not just GitHub links)
      const demoLink = project.technicalDemoLink || project.demoUrl || '';
      if (demoLink.includes('vercel') || demoLink.includes('netlify') || 
          demoLink.includes('railway') || demoLink.includes('.app') ||
          demoLink.includes('.xyz') || demoLink.includes('.com')) {
        score += 1.0;
      }
    }

    // 4. GitHub repository (2 points)
    if (project.githubUrl) {
      score += 1.5;
      // Bonus if not a placeholder
      if (!project.githubUrl.includes('github.com/user') && 
          !project.githubUrl.includes('github.com/example')) {
        score += 0.5;
      }
    }

    // 5. Video demo (1 point)
    if (project.videoDemoLink) score += 1.0;

    return Math.min(score, 10);
  }

  /**
   * Evaluate project with Claude (more positive for hackathon context)
   */
  async evaluateWithClaude(project) {
    const prompt = `You are AgentPulse evaluating projects in a 10-DAY AI AGENT HACKATHON on Solana.

IMPORTANT CONTEXT: This is a HACKATHON, not a finished product competition. Many projects are work-in-progress. Be encouraging and focus on POTENTIAL and EFFORT, not just completeness.

Project Details:
- Name: ${project.name}
- Tagline: ${project.tagline || 'N/A'}
- Description: ${project.description || 'N/A'}
- GitHub: ${project.githubUrl ? 'Yes' : 'No'}
- Demo: ${project.technicalDemoLink || project.demoUrl ? 'Yes' : 'No'}
- Video: ${project.videoDemoLink ? 'Yes' : 'No'}

Evaluate on:
1. **Innovation** (1-10): Is the idea interesting? Does it solve a problem?
2. **Effort** (1-10): Can you tell the team worked hard on this?
3. **Potential** (1-10): If finished, would this be useful?
4. **Fit** (1-10): Does it align with AI agents + Solana?

SCORING GUIDELINES (be generous for hackathon context):
- 8-10: Excellent hackathon project, clear effort, good idea
- 6-7: Good solid effort, functional concept
- 4-5: Basic idea, needs work but has potential
- 1-3: Minimal effort or unclear concept

Respond in JSON:
{
  "innovation": <1-10>,
  "effort": <1-10>,
  "potential": <1-10>,
  "fit": <1-10>,
  "score": <average of above, 1-10>,
  "reasoning": "<1-2 sentences focusing on positives and potential>"
}

Remember: This is a HACKATHON. Reward effort and ideas, not just polish!`;

    try {
      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0]?.text?.trim();
      
      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const evaluation = JSON.parse(jsonMatch[0]);
        return {
          score: evaluation.score || 5,
          breakdown: {
            innovation: evaluation.innovation,
            effort: evaluation.effort,
            potential: evaluation.potential,
            fit: evaluation.fit
          },
          reasoning: evaluation.reasoning || 'Evaluated by Claude'
        };
      }

      // Fallback if JSON parsing fails
      return {
        score: 5,
        breakdown: { innovation: 5, effort: 5, potential: 5, fit: 5 },
        reasoning: 'Unable to fully evaluate'
      };

    } catch (error) {
      this.logger.error('Claude evaluation failed:', error.message);
      return { 
        score: 5, 
        breakdown: { innovation: 5, effort: 5, potential: 5, fit: 5 },
        reasoning: error.message 
      };
    }
  }

  /**
   * Vote for a project
   */
  async voteForProject(project, evaluation) {
    try {
      // Call Colosseum API to vote
      await this.api.voteForProject(project.id);
      
      this.logger.info(
        `✅ Voted for "${project.name}" ` +
        `(final score: ${evaluation.finalScore}/10, ` +
        `obj: ${evaluation.objectiveScore}/10, ` +
        `claude: ${evaluation.claudeScore}/10)`
      );
      
      // Log the vote
      await this.logVote(project, evaluation);
      
      return true;

    } catch (error) {
      this.logger.error(`Failed to vote for project ${project.id}:`, error.message);
      return false;
    }
  }

  /**
   * Get projects we haven't voted for
   */
  async getUnvotedProjects() {
    try {
      // Get all projects
      const allProjects = await this.api.getProjects();
      
      // Get IDs of projects we've already evaluated/voted
      const votedIds = await this.getVotedProjectIds();
      
      // Filter to unvoted projects
      const unvoted = allProjects.filter(p => 
        !votedIds.includes(p.id) && 
        p.id !== this.config.ownProjectId
      );
      
      // Sort by completeness (prefer more complete projects)
      return unvoted.sort((a, b) => {
        const scoreA = (a.demoUrl || a.technicalDemoLink ? 3 : 0) + 
                      (a.githubUrl ? 2 : 0) + 
                      (a.description?.length > 100 ? 1 : 0);
        const scoreB = (b.demoUrl || b.technicalDemoLink ? 3 : 0) + 
                      (b.githubUrl ? 2 : 0) + 
                      (b.description?.length > 100 ? 1 : 0);
        return scoreB - scoreA;
      });

    } catch (error) {
      this.logger.error('Failed to get unvoted projects:', error.message);
      return [];
    }
  }

  /**
   * Get IDs of projects we've voted for
   */
  async getVotedProjectIds() {
    try {
      const result = await this.db.pool.query(`
        SELECT project_id FROM project_votes
      `);
      return result.rows.map(r => r.project_id);
    } catch (error) {
      // Table might not exist yet
      return [];
    }
  }

  /**
   * Get today's vote count
   */
  async getTodayVoteCount() {
    try {
      const result = await this.db.pool.query(`
        SELECT COUNT(*) as count 
        FROM project_votes 
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      return parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Store project evaluation
   */
  async storeEvaluation(projectId, evaluation) {
    try {
      await this.db.pool.query(`
        CREATE TABLE IF NOT EXISTS project_evaluations (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL,
          objective_score FLOAT,
          claude_score FLOAT,
          final_score FLOAT,
          breakdown JSONB,
          reasoning TEXT,
          should_vote BOOLEAN,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(project_id)
        )
      `);

      await this.db.pool.query(`
        INSERT INTO project_evaluations 
        (project_id, objective_score, claude_score, final_score, breakdown, reasoning, should_vote)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (project_id) DO UPDATE SET
          objective_score = $2,
          claude_score = $3,
          final_score = $4,
          breakdown = $5,
          reasoning = $6,
          should_vote = $7,
          created_at = NOW()
      `, [
        projectId,
        evaluation.objectiveScore,
        evaluation.claudeScore,
        evaluation.finalScore,
        JSON.stringify(evaluation.breakdown),
        evaluation.reasoning,
        evaluation.shouldVote
      ]);

    } catch (error) {
      this.logger.error('Failed to store evaluation:', error.message);
    }
  }

  /**
   * Log vote to database
   */
  async logVote(project, evaluation) {
    try {
      await this.db.pool.query(`
        CREATE TABLE IF NOT EXISTS project_votes (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL UNIQUE,
          project_name VARCHAR(255),
          score FLOAT,
          reasoning TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await this.db.pool.query(`
        INSERT INTO project_votes (project_id, project_name, score, reasoning)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (project_id) DO NOTHING
      `, [
        project.id, 
        project.name, 
        evaluation.finalScore, 
        evaluation.reasoning
      ]);

    } catch (error) {
      this.logger.error('Failed to log vote:', error.message);
    }
  }

  /**
   * Helper: delay execution
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get stats
   */
  getStats() {
    return { ...this.stats };
  }
}

export default VotingService;
