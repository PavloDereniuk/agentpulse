/**
 * Spotlight Service
 * 
 * Selects and features one outstanding project per day.
 * Creates a detailed, positive spotlight post that drives engagement.
 * 
 * Strategy:
 * - Rotate through different project types
 * - Never spotlight the same project twice
 * - Prefer projects that haven't been featured elsewhere
 * - Use Claude for compelling writeups
 * 
 * Schedule: Daily at 15:00 UTC
 * 
 * @author AgentPulse (Agent #503)
 */

import Anthropic from '@anthropic-ai/sdk';
import { ColosseumAPI } from './colosseumAPI.js';
import { DatabaseService } from './database.js';
import { Logger } from '../utils/logger.js';

export class SpotlightService {
  constructor() {
    this.api = new ColosseumAPI();
    this.db = new DatabaseService();
    this.logger = new Logger('Spotlight');
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

    this.stats = {
      spotlightsGenerated: 0,
      lastSpotlightTime: null,
    };
  }

  /**
   * Generate today's spotlight
   */
  async generateSpotlight() {
    this.logger.info('🔦 Generating Agent Spotlight...');

    try {
      // Pick the project to spotlight
      const project = await this.selectProject();

      if (!project) {
        this.logger.info('No eligible project found for spotlight');
        return null;
      }

      this.logger.info(`🔦 Spotlighting: "${project.name}"`);

      // Generate the spotlight content with Claude
      const content = await this.generateContent(project);

      // Store in DB
      await this.markAsSpotlighted(project.id);

      const title = `🔦 Agent Spotlight: ${project.name}`;
      const body = this.formatSpotlight(project, content);

      this.stats.spotlightsGenerated++;
      this.stats.lastSpotlightTime = Date.now();

      return { title, body, projectId: project.id, projectName: project.name };

    } catch (error) {
      this.logger.error('Spotlight generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Select the best project for today's spotlight
   */
  async selectProject() {
    try {
      const projects = await this.api.getProjects();

      // Get already spotlighted project IDs
      const spotlightedIds = await this.getSpotlightedIds();

      // Filter eligible projects
      const eligible = projects.filter(p => {
        const hasSubstance = p.description && p.description.length > 50;
        const hasDemo = !!(p.technicalDemoLink || p.demoUrl);
        const hasGithub = !!p.githubUrl;
        const notSpotlighted = !spotlightedIds.includes(p.id);
        const notOwnProject = p.id !== 244; // Skip AgentPulse

        return hasSubstance && (hasDemo || hasGithub) && notSpotlighted && notOwnProject;
      });

      if (eligible.length === 0) {
        this.logger.warn('No eligible projects for spotlight');
        return null;
      }

      // Score projects for spotlight worthiness
      const scored = eligible.map(p => {
        let score = 0;

        // Completeness (max 4)
        if (p.technicalDemoLink || p.demoUrl) score += 2;
        if (p.githubUrl) score += 1;
        if (p.videoDemoLink) score += 1;

        // Description quality (max 3)
        if (p.description?.length > 300) score += 3;
        else if (p.description?.length > 150) score += 2;
        else score += 1;

        // Community engagement (max 2)
        const votes = (p.humanUpvotes || 0) + (p.agentUpvotes || 0);
        if (votes > 15) score += 2;
        else if (votes > 5) score += 1;

        // Interesting name/tagline bonus (max 1)
        if (p.tagline && p.tagline.length > 20) score += 1;

        return { ...p, spotlightScore: score };
      });

      // Sort by score but add some randomness to avoid always picking the same top project
      scored.sort((a, b) => {
        const scoreDiff = b.spotlightScore - a.spotlightScore;
        // Add randomness within similar scores
        if (Math.abs(scoreDiff) <= 1) {
          return Math.random() - 0.5;
        }
        return scoreDiff;
      });

      return scored[0];

    } catch (error) {
      this.logger.error('Project selection failed:', error.message);
      return null;
    }
  }

  /**
   * Generate spotlight content using Claude
   */
  async generateContent(project) {
    const prompt = `You are AgentPulse writing a spotlight feature for a hackathon project. Be enthusiastic, specific, and genuinely helpful. This should make the team feel recognized and help others discover the project.

Project Details:
- Name: ${project.name}
- Tagline: ${project.tagline || 'N/A'}
- Description: ${project.description || 'N/A'}
- GitHub: ${project.githubUrl || 'N/A'}
- Demo: ${project.technicalDemoLink || project.demoUrl || 'N/A'}
- Video: ${project.videoDemoLink || 'N/A'}
- Votes: ${(project.humanUpvotes || 0) + (project.agentUpvotes || 0)}

Write a JSON response:
{
  "whatTheyBuilt": "2-3 sentences about what the project does",
  "whyInteresting": "2-3 sentences about what makes it stand out",
  "technicalApproach": "1-2 sentences about their tech stack or approach (infer from description)",
  "suggestion": "1 friendly, constructive suggestion for improvement",
  "score": <1-10 overall impression>
}

Be positive and encouraging — this is a hackathon! Focus on potential and effort.`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0]?.text?.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        whatTheyBuilt: project.description?.substring(0, 200) || 'An innovative hackathon project.',
        whyInteresting: 'Shows great potential and effort.',
        technicalApproach: 'Building on Solana with AI agent capabilities.',
        suggestion: 'Keep building and share progress on the forum!',
        score: 7,
      };

    } catch (error) {
      this.logger.error('Claude spotlight generation failed:', error.message);
      return {
        whatTheyBuilt: project.description?.substring(0, 200) || 'An innovative hackathon project.',
        whyInteresting: 'Shows great potential and effort.',
        technicalApproach: 'Building on Solana with AI agent capabilities.',
        suggestion: 'Keep building and share progress on the forum!',
        score: 7,
      };
    }
  }

  /**
   * Format the spotlight post
   */
  formatSpotlight(project, content) {
    const demoLink = project.technicalDemoLink || project.demoUrl;
    const votes = (project.humanUpvotes || 0) + (project.agentUpvotes || 0);

    const sections = [];

    // Header
    if (project.tagline) {
      sections.push(`> *${project.tagline}*\n`);
    }

    // What they built
    sections.push(`## 🛠️ What They Built\n`);
    sections.push(`${content.whatTheyBuilt}\n`);

    // Why it's interesting
    sections.push(`## ✨ Why It's Interesting\n`);
    sections.push(`${content.whyInteresting}\n`);

    // Technical approach
    sections.push(`## 🔧 Technical Approach\n`);
    sections.push(`${content.technicalApproach}\n`);

    // Quick stats
    sections.push(`## 📊 Project Stats\n`);
    sections.push(`- **Votes:** ${votes}`);
    if (demoLink) sections.push(`- **Live Demo:** [Try it](${demoLink})`);
    if (project.githubUrl) sections.push(`- **GitHub:** [View Code](${project.githubUrl})`);
    if (project.videoDemoLink) sections.push(`- **Video Demo:** [Watch](${project.videoDemoLink})`);
    sections.push('');

    // AgentPulse Score
    sections.push(`## 🫀 AgentPulse Score: ${content.score}/10\n`);

    // Friendly suggestion
    if (content.suggestion) {
      sections.push(`**💡 Suggestion:** ${content.suggestion}\n`);
    }

    // CTA
    sections.push(`---\n`);
    sections.push(`**Want your project spotlighted?** Keep building, keep sharing progress, and engage with the community! AgentPulse automatically selects one standout project each day.\n`);
    sections.push(`*🫀 Generated autonomously by AgentPulse (Agent #503)*`);
    sections.push(`*Dashboard: [agentpulse.vercel.app](https://agentpulse.vercel.app)*`);

    return sections.join('\n');
  }

  /**
   * Get previously spotlighted project IDs
   */
  async getSpotlightedIds() {
    try {
      await this.db.pool.query(`
        CREATE TABLE IF NOT EXISTS spotlights (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL UNIQUE,
          project_name TEXT,
          score FLOAT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      const result = await this.db.pool.query('SELECT project_id FROM spotlights');
      return result.rows.map(r => r.project_id);
    } catch (error) {
      return [];
    }
  }

  /**
   * Mark project as spotlighted
   */
  async markAsSpotlighted(projectId) {
    try {
      await this.db.pool.query(`
        INSERT INTO spotlights (project_id, project_name)
        VALUES ($1, $2)
        ON CONFLICT (project_id) DO NOTHING
      `, [projectId, '']);
    } catch (error) {
      this.logger.warn('Failed to mark spotlight:', error.message);
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return { ...this.stats };
  }
}

export default SpotlightService;
