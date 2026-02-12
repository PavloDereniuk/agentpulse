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

import Anthropic from "@anthropic-ai/sdk";
import { ColosseumAPI } from "./colosseumAPI.js";
import { DatabaseService } from "./database.js";
import { SolanaService } from "./solanaService.js";
import { Logger } from "../utils/logger.js";
import { ReasoningService } from "./reasoningService.js";
import { ACTION_TYPES } from "./solanaService.js";
import { AnchorService } from "./anchorService.js";

export class VotingService {
  constructor() {
    this.api = new ColosseumAPI();
    this.db = new DatabaseService();
    this.solana = new SolanaService();
    this.logger = new Logger("VotingService");
    this.reasoningService = new ReasoningService();

    // Anchor on-chain program
    this.anchor = new AnchorService();
    this.anchor.initialize().catch((err) => {
      this.logger.warn("Anchor init failed (non-critical):", err.message);
    });

    // Initialize Claude for project evaluation
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Config
    this.config = {
      maxVotesPerDay: 150,
      minScoreToVote: 5.5,
      excellenceThreshold: 7.5,
      skipOwnProject: true,
      ownProjectId: 244,
    };

    // Stats
    this.stats = {
      projectsEvaluated: 0,
      votesGiven: 0,
      lastVoteTime: null,
    };

    // Will be set by AutonomousAgent to read evolved strategy
    this.strategyProvider = null;
  }

  /**
   * Get evolved min score threshold (fallback to config)
   */
  getMinScoreThreshold() {
    if (this.strategyProvider) {
      try {
        const strategy = this.strategyProvider.getStrategy();
        // Strategy minQualityScore is 0-8, map to vote threshold
        if (strategy.minQualityScore !== undefined) {
          // minQualityScore 6 → minScore 5.5, 7 → 6.0, 5 → 5.0
          return Math.max(4.0, strategy.minQualityScore - 0.5);
        }
      } catch {}
    }
    return this.config.minScoreToVote;
  }

  /**
   * Main function: Evaluate and vote for quality projects
   */
  async evaluateAndVote() {
    this.logger.info("🗳️ Starting voting cycle...");

    try {
      // Check daily vote limit
      const todayVotes = await this.getTodayVoteCount();
      if (todayVotes >= this.config.maxVotesPerDay) {
        this.logger.info(
          `Daily vote limit reached (${todayVotes}/${this.config.maxVotesPerDay})`,
        );
        return { evaluated: 0, voted: 0, reason: "daily_limit" };
      }

      const remainingVotes = this.config.maxVotesPerDay - todayVotes;

      // Get projects we haven't voted for yet
      const projects = await this.getUnvotedProjects();

      if (projects.length === 0) {
        this.logger.info("No new projects to evaluate");
        return { evaluated: 0, voted: 0, reason: "no_projects" };
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

        // Validate scores
        const validObjectiveScore =
          typeof objectiveScore === "number" ? objectiveScore : 5;
        const validClaudeScore =
          typeof claudeEval?.score === "number" ? claudeEval.score : 5;

        // Combine: 40% objective + 60% Claude
        const finalScore = validObjectiveScore * 0.4 + validClaudeScore * 0.6;

        const evaluation = {
          projectId: project.id,
          projectName: project.name,
          objectiveScore: validObjectiveScore,
          claudeScore: validClaudeScore,
          finalScore: Math.round(finalScore * 10) / 10,
          breakdown: {
            objective: validObjectiveScore,
            claude: validClaudeScore,
            innovation: claudeEval?.breakdown?.innovation || 5,
            effort: claudeEval?.breakdown?.effort || 5,
            potential: claudeEval?.breakdown?.potential || 5,
            fit: claudeEval?.breakdown?.fit || 5,
          },
          reasoning: claudeEval?.reasoning || "Evaluation completed",
          shouldVote: finalScore >= this.getMinScoreThreshold(),
          evaluatedAt: new Date().toISOString(),
        };

        this.logger.info(
          `Project ${project.id} (${project.name}): ` +
            `Obj=${validObjectiveScore.toFixed(1)}/10, Claude=${validClaudeScore.toFixed(1)}/10, ` +
            `Final=${evaluation.finalScore.toFixed(1)}/10`,
        );
        // Priority voting for excellent projects
        if (evaluation.finalScore >= this.config.excellenceThreshold) {
          this.logger.info(
            `⭐ EXCELLENT PROJECT: ${project.name} (${evaluation.finalScore}/10)`,
          );
        }

        // Store evaluation
        await this.storeEvaluation(project.id, evaluation);

        // Vote if quality meets threshold
        if (evaluation.shouldVote) {
          const success = await this.voteForProject(project, evaluation);
          if (success) {
            voted++;
            this.stats.votesGiven++;
            this.stats.lastVoteTime = Date.now();
          }
        } else {
          this.logger.info(
            `Project ${project.id} score ${evaluation.finalScore}/10 - below threshold (${this.getMinScoreThreshold()})`,
          );
        }

        // Rate limiting
        await this.delay(2000);
      }

      this.logger.info(
        `✅ Voting complete: ${evaluated} evaluated, ${voted} votes given`,
      );

      return { evaluated, voted };
    } catch (error) {
      this.logger.error("Voting cycle failed:", error.message);
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

    // 2. Description quality (3 points)
    if (project.description) {
      if (project.description.length > 300) score += 3;
      else if (project.description.length > 150) score += 2;
      else if (project.description.length > 50) score += 1;
    }

    // 3. GitHub repository (3 points)
    if (project.repoLink) {
      score += 2.5;
      if (
        !project.repoLink.includes("github.com/user") &&
        !project.repoLink.includes("github.com/example")
      ) {
        score += 0.5;
      }
    }

    // 4. Video/presentation (3 points)
    if (project.presentationLink) score += 3;

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
- Tagline: ${project.tagline || "N/A"}
- Description: ${project.description || "N/A"}
- Problem Statement: ${project.problemStatement || "N/A"}
- Technical Approach: ${project.technicalApproach || "N/A"}
- Target Audience: ${project.targetAudience || "N/A"}
- Business Model: ${project.businessModel || "N/A"}
- Competitive Landscape: ${project.competitiveLandscape || "N/A"}
- Future Vision: ${project.futureVision || "N/A"}
- GitHub: ${project.repoLink ? "Yes" : "No"}
- Live App: ${project.liveAppLink ? "Yes" : "No"}
- Demo/Video: ${project.presentationLink ? "Yes" : "No"}
- Solana Integration: ${project.solanaIntegration || "N/A"}

Evaluate on:
1. **Innovation** (1-10): Is the idea interesting? Does it solve a real problem?
2. **Effort** (1-10): Can you tell the team worked hard? Is the technical approach solid?
3. **Potential** (1-10): If finished, would this be useful? Is the business case viable?
4. **Fit** (1-10): Does it align with AI agents + Solana? Is Solana integration meaningful?

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
        model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
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
            fit: evaluation.fit,
          },
          reasoning: evaluation.reasoning || "Evaluated by Claude",
        };
      }

      // Fallback if JSON parsing fails
      return {
        score: 5,
        breakdown: { innovation: 5, effort: 5, potential: 5, fit: 5 },
        reasoning: "Unable to fully evaluate",
      };
    } catch (error) {
      this.logger.error("Claude evaluation failed:", error.message);
      return {
        score: 5,
        breakdown: { innovation: 5, effort: 5, potential: 5, fit: 5 },
        reasoning: error.message,
      };
    }
  }

  /**
   * Vote for a project
   */
  /**
   * Vote for a project with full reasoning
   */
  async voteForProject(project, evaluation) {
    try {
      // Call Colosseum API to vote
      await this.api.voteForProject(project.id);

      this.logger.info(
        `✅ Voted for "${project.name}" ` +
          `(final score: ${evaluation.finalScore}/10, ` +
          `obj: ${evaluation.objectiveScore}/10, ` +
          `claude: ${evaluation.claudeScore}/10)`,
      );

      // Generate detailed reasoning for this vote
      const reasoning = this.reasoningService.generateVoteReasoning(
        project,
        evaluation,
      );

      this.logger.info(
        `📝 Generated reasoning with confidence: ${(reasoning.confidence * 100).toFixed(1)}%`,
      );

      // Log the vote to database
      await this.logVote(project, evaluation);

      // Record vote on-chain via Anchor program
      if (this.anchor?.ready) {
        try {
          const anchorVote = await this.anchor.recordVote(
            project.id,
            "upvote",
            evaluation.reasoning,
          );
          if (anchorVote?.signature) {
            this.logger.info(`🔗 Anchor vote: ${anchorVote.explorerUrl}`);
          }
        } catch (anchorErr) {
          this.logger.warn(
            "Anchor vote failed (non-critical):",
            anchorErr.message,
          );
        }
      }

      // Log vote on-chain with full reasoning for transparency
      let solanaTx = null;
      if (this.solana.canWrite()) {
        try {
          solanaTx = await this.solana.logActionOnChain({
            type: ACTION_TYPES.VOTE_CAST,
            summary: `Voted for "${project.name}" (score: ${evaluation.finalScore}/10)`,
            reasoning: reasoning.reasoning,
            confidence: reasoning.confidence,
            factors: reasoning.factors,
            metadata: {
              projectId: project.id,
              projectName: project.name,
              score: evaluation.finalScore,
              objectiveScore: evaluation.objectiveScore,
              claudeScore: evaluation.claudeScore,
              innovation: evaluation.breakdown.innovation,
              effort: evaluation.breakdown.effort,
              potential: evaluation.breakdown.potential,
              fit: evaluation.breakdown.fit,
            },
          });

          this.logger.info(
            `📝 Vote logged on-chain: ${solanaTx.signature.slice(0, 16)}...`,
          );
          this.logger.info(`   Explorer: ${solanaTx.explorerUrl}`);

          // Update vote record with Solana signature
          await this.db.pool.query(
            `
          UPDATE project_votes 
          SET solana_tx = $1 
          WHERE project_id = $2
        `,
            [solanaTx.signature, project.id],
          );

          // Record on-chain via Anchor program
          if (this.anchor?.ready) {
            try {
              const confidence = evaluation.breakdown?.claude
                ? Math.round(
                    ((evaluation.breakdown.innovation +
                      evaluation.breakdown.effort +
                      evaluation.breakdown.potential +
                      evaluation.breakdown.fit) /
                      4) *
                      10,
                  )
                : 70;
              const anchorResult = await this.anchor.recordEvaluation(
                projectId,
                evaluation.projectName || `Project-${projectId}`,
                evaluation.finalScore,
                confidence,
                evaluation.reasoning,
              );
              if (anchorResult?.signature) {
                this.logger.info(
                  `🔗 Anchor evaluation: ${anchorResult.explorerUrl}`,
                );
              }
            } catch (anchorErr) {
              this.logger.warn(
                "Anchor evaluation failed (non-critical):",
                anchorErr.message,
              );
            }
          }
        } catch (solanaError) {
          this.logger.warn("Failed to log vote on-chain:", solanaError.message);
          // Continue - voting succeeded even if on-chain log failed
        }
      } else {
        this.logger.warn("⚠️ Solana not configured - vote not logged on-chain");
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to vote for project ${project.id}:`,
        error.message,
      );
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
      const unvoted = allProjects.filter(
        (p) => !votedIds.includes(p.id) && p.id !== this.config.ownProjectId,
      );

      // Sort by completeness (prefer more complete projects)
      return unvoted.sort((a, b) => {
        const scoreA =
          (a.demoUrl || a.technicalDemoLink ? 3 : 0) +
          (a.githubUrl ? 2 : 0) +
          (a.description?.length > 100 ? 1 : 0);
        const scoreB =
          (b.demoUrl || b.technicalDemoLink ? 3 : 0) +
          (b.githubUrl ? 2 : 0) +
          (b.description?.length > 100 ? 1 : 0);
        return scoreB - scoreA;
      });
    } catch (error) {
      this.logger.error("Failed to get unvoted projects:", error.message);
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
      return result.rows.map((r) => r.project_id);
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

      // Ensure columns exist
      await this.db.pool
        .query(
          `
        ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS should_vote BOOLEAN
      `,
        )
        .catch(() => {});
      await this.db.pool
        .query(
          `
        ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS final_score FLOAT
      `,
        )
        .catch(() => {});
      await this.db.pool
        .query(
          `
        ALTER TABLE project_evaluations ALTER COLUMN score DROP NOT NULL
      `,
        )
        .catch(() => {});

      await this.db.pool.query(
        `
  INSERT INTO project_evaluations 
  (project_id, objective_score, claude_score, final_score, score, reasoning, should_vote)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (project_id) DO UPDATE SET
    objective_score = $2,
    claude_score = $3,
    final_score = $4,
    score = $5,
    reasoning = $6,
    should_vote = $7,
    created_at = NOW()
`,
        [
          projectId,
          evaluation.objectiveScore,
          evaluation.claudeScore,
          evaluation.finalScore,
          Math.round(evaluation.finalScore),
          evaluation.reasoning,
          evaluation.shouldVote,
        ],
      );

      // Record on-chain via Anchor program
      if (this.anchor?.ready) {
        try {
          const confidence = evaluation.breakdown?.claude
            ? Math.round(
                ((evaluation.breakdown.innovation +
                  evaluation.breakdown.effort +
                  evaluation.breakdown.potential +
                  evaluation.breakdown.fit) /
                  4) *
                  10,
              )
            : 70;
          const anchorResult = await this.anchor.recordEvaluation(
            projectId,
            evaluation.projectName || `Project-${projectId}`,
            evaluation.finalScore,
            confidence,
            evaluation.reasoning,
          );
          if (anchorResult?.signature) {
            this.logger.info(
              `🔗 Anchor evaluation: ${anchorResult.explorerUrl}`,
            );
          }
        } catch (anchorErr) {
          this.logger.warn(
            "Anchor evaluation failed (non-critical):",
            anchorErr.message,
          );
        }
      }
    } catch (error) {
      this.logger.error("Failed to store evaluation:", error.message);
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
          solana_tx VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await this.db.pool.query(
        `
        INSERT INTO project_votes (project_id, project_name, score, reasoning)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (project_id) DO NOTHING
      `,
        [project.id, project.name, evaluation.finalScore, evaluation.reasoning],
      );
    } catch (error) {
      this.logger.error("Failed to log vote:", error.message);
    }
  }

  /**
   * Helper: delay execution
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get stats
   */
  getStats() {
    return { ...this.stats };
  }
}

export default VotingService;
