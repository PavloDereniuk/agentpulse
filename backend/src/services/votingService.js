/**
 * Voting Service
 * 
 * Intelligently votes for quality projects in the hackathon.
 * 
 * Strategy:
 * - Analyze projects based on completeness, innovation, engagement
 * - Vote for genuinely good projects (not vote exchange!)
 * - Prioritize projects that align with ecosystem goals
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
      maxVotesPerDay: 10,
      minScoreToVote: 7, // out of 10
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

        // Evaluate project quality
        const evaluation = await this.evaluateProject(project);
        
        // Store evaluation
        await this.storeEvaluation(project.id, evaluation);

        // Vote if quality is high enough
        if (evaluation.score >= this.config.minScoreToVote) {
          const success = await this.voteForProject(project, evaluation);
          if (success) {
            voted++;
            this.stats.votesGiven++;
            this.stats.lastVoteTime = Date.now();
          }
        } else {
          this.logger.info(`Project ${project.id} score ${evaluation.score}/10 - below threshold`);
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
   * Evaluate a project using Claude
   */
  async evaluateProject(project) {
    const prompt = `You are AgentPulse, an autonomous analytics agent evaluating projects in the Colosseum AI Agent Hackathon.

Evaluate this project objectively based on:
1. **Completeness** (1-10): Is the project well-documented? Does it have a working demo?
2. **Innovation** (1-10): Is the idea novel? Does it solve a real problem?
3. **Technical Quality** (1-10): Is the tech stack appropriate? Is there evidence of good engineering?
4. **Ecosystem Value** (1-10): Does it benefit the Solana/AI agent ecosystem?
5. **Engagement** (1-10): Is the team active in the community?

Project Details:
- Name: ${project.name}
- Tagline: ${project.tagline || 'N/A'}
- Description: ${project.description || 'N/A'}
- Tech Stack: ${project.techStack || 'N/A'}
- GitHub: ${project.githubUrl ? 'Yes' : 'No'}
- Demo: ${project.demoUrl ? 'Yes' : 'No'}
- Team Size: ${project.teamSize || 'Unknown'}
- Forum Activity: ${project.forumPosts || 0} posts

Respond in JSON format:
{
  "completeness": <1-10>,
  "innovation": <1-10>,
  "technicalQuality": <1-10>,
  "ecosystemValue": <1-10>,
  "engagement": <1-10>,
  "overallScore": <1-10>,
  "reasoning": "<brief 1-2 sentence explanation>",
  "shouldVote": <true/false>
}

Be fair and objective. Only recommend voting for genuinely good projects.`;

    try {
      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0]?.text?.trim();
      
      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const evaluation = JSON.parse(jsonMatch[0]);
        return {
          ...evaluation,
          score: evaluation.overallScore,
          projectId: project.id,
          projectName: project.name,
          evaluatedAt: new Date().toISOString(),
        };
      }

      // Fallback if JSON parsing fails
      return {
        score: 5,
        reasoning: 'Unable to fully evaluate',
        shouldVote: false,
      };

    } catch (error) {
      this.logger.error('Project evaluation failed:', error.message);
      return { score: 0, reasoning: error.message, shouldVote: false };
    }
  }

  /**
   * Vote for a project
   */
  async voteForProject(project, evaluation) {
    try {
      // Call Colosseum API to vote
      await this.api.voteForProject(project.id);
      
      this.logger.info(`✅ Voted for "${project.name}" (score: ${evaluation.score}/10)`);
      
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
      
      // Sort by activity/completeness (prefer more complete projects)
      return unvoted.sort((a, b) => {
        const scoreA = (a.demoUrl ? 2 : 0) + (a.githubUrl ? 1 : 0) + (a.description?.length > 100 ? 1 : 0);
        const scoreB = (b.demoUrl ? 2 : 0) + (b.githubUrl ? 1 : 0) + (b.description?.length > 100 ? 1 : 0);
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
          score INTEGER NOT NULL,
          completeness INTEGER,
          innovation INTEGER,
          technical_quality INTEGER,
          ecosystem_value INTEGER,
          engagement INTEGER,
          reasoning TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(project_id)
        )
      `);

      await this.db.pool.query(`
        INSERT INTO project_evaluations 
        (project_id, score, completeness, innovation, technical_quality, ecosystem_value, engagement, reasoning)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (project_id) DO UPDATE SET
          score = $2,
          completeness = $3,
          innovation = $4,
          technical_quality = $5,
          ecosystem_value = $6,
          engagement = $7,
          reasoning = $8
      `, [
        projectId,
        evaluation.score,
        evaluation.completeness,
        evaluation.innovation,
        evaluation.technicalQuality,
        evaluation.ecosystemValue,
        evaluation.engagement,
        evaluation.reasoning
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
          score INTEGER,
          reasoning TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await this.db.pool.query(`
        INSERT INTO project_votes (project_id, project_name, score, reasoning)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (project_id) DO NOTHING
      `, [project.id, project.name, evaluation.score, evaluation.reasoning]);

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
