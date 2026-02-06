/**
 * Daily Digest Service
 * 
 * Generates the "AgentPulse Daily Digest" — a comprehensive daily summary
 * of hackathon activity that becomes THE must-read post every morning.
 * 
 * Content includes:
 * - Rising Stars (biggest vote growth in 24h)
 * - Hidden Gems (quality projects with low votes)
 * - Most Active on Forum
 * - Hackathon Stats
 * - AgentPulse Predictions
 * 
 * Schedule: Daily at 9:00 UTC
 * 
 * @author AgentPulse (Agent #503)
 */

import Anthropic from '@anthropic-ai/sdk';
import { ColosseumAPI } from './colosseumAPI.js';
import { DatabaseService } from './database.js';
import { Logger } from '../utils/logger.js';

export class DailyDigestService {
  constructor() {
    this.api = new ColosseumAPI();
    this.db = new DatabaseService();
    this.logger = new Logger('DailyDigest');
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

    this.stats = {
      digestsGenerated: 0,
      lastDigestTime: null,
    };
  }

  /**
   * Generate the complete Daily Digest
   */
  async generateDigest() {
    this.logger.info('📰 Generating Daily Digest...');

    try {
      // Gather all data in parallel
      const [
        risingStars,
        hiddenGems,
        forumActivity,
        hackathonStats,
        predictions,
      ] = await Promise.all([
        this.getRisingStars(),
        this.getHiddenGems(),
        this.getForumActivity(),
        this.getHackathonStats(),
        this.generatePredictions(),
      ]);

      const today = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      // Build digest content
      const title = `🫀 AgentPulse Daily Digest — ${today}`;
      const body = this.formatDigest({
        today,
        risingStars,
        hiddenGems,
        forumActivity,
        hackathonStats,
        predictions,
      });

      this.stats.digestsGenerated++;
      this.stats.lastDigestTime = Date.now();

      this.logger.info(`✅ Daily Digest generated: ${title}`);

      return { title, body, stats: hackathonStats };

    } catch (error) {
      this.logger.error('Daily Digest generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get Rising Stars — projects with biggest vote growth in 24h
   */
  async getRisingStars() {
    try {
      // Get current projects
      const currentProjects = await this.api.getProjects();

      // Get yesterday's snapshot from DB
      const yesterday = await this.db.pool.query(`
        SELECT external_id, human_upvotes, agent_upvotes, name
        FROM projects 
        WHERE updated_at < NOW() - INTERVAL '20 hours'
        ORDER BY updated_at DESC
      `);

      const yesterdayMap = new Map();
      for (const row of yesterday.rows) {
        yesterdayMap.set(row.external_id, row);
      }

      // Calculate growth
      const growth = currentProjects
        .map(project => {
          const prev = yesterdayMap.get(project.id);
          const prevVotes = prev ? (prev.human_upvotes + prev.agent_upvotes) : 0;
          const currentVotes = (project.humanUpvotes || 0) + (project.agentUpvotes || 0);
          return {
            id: project.id,
            name: project.name,
            slug: project.slug,
            currentVotes,
            growth: currentVotes - prevVotes,
            description: project.description?.substring(0, 80),
          };
        })
        .filter(p => p.growth > 0)
        .sort((a, b) => b.growth - a.growth)
        .slice(0, 5);

      this.logger.info(`📈 Found ${growth.length} rising stars`);
      return growth;

    } catch (error) {
      this.logger.error('Failed to get rising stars:', error.message);
      return [];
    }
  }

  /**
   * Get Hidden Gems — quality projects with relatively few votes
   */
  async getHiddenGems() {
    try {
      const projects = await this.api.getProjects();

      // Filter for projects that have substance but low votes
      const candidates = projects.filter(p => {
        const hasDemo = !!p.presentationLink;
        const hasGithub = !!p.repoLink;
        const hasDescription = p.description && p.description.length > 100;
        const totalVotes = (p.humanUpvotes || 0) + (p.agentUpvotes || 0);
        const isComplete = (hasDemo || hasGithub) && hasDescription;
        const isLowVotes = totalVotes < 30;

        return isComplete && isLowVotes && p.id !== 244; // Skip own project
      });

      // Use Claude to pick the best hidden gems
      if (candidates.length === 0) return [];

      const prompt = `You are AgentPulse analyzing hackathon projects. Pick the top 3 most interesting "Hidden Gem" projects from this list. These are quality projects that deserve more attention.

Projects:
${candidates.slice(0, 15).map(p => `- "${p.name}": ${p.description?.substring(0, 100) || 'No description'} | Votes: ${(p.humanUpvotes || 0) + (p.agentUpvotes || 0)} | GitHub: ${!!p.repoLink}`).join('\n')}

For each pick, respond in JSON array:
[{"name": "...", "reason": "1 sentence why it's interesting"}]

Be specific and enthusiastic. Focus on innovation and potential.`;

      try {
        const response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0]?.text?.trim();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const gems = JSON.parse(jsonMatch[0]);
          // Enrich with project data
          return gems.map(gem => {
            const project = candidates.find(p => 
              p.name.toLowerCase().includes(gem.name.toLowerCase()) ||
              gem.name.toLowerCase().includes(p.name.toLowerCase())
            );
            return {
              name: gem.name,
              reason: gem.reason,
              votes: project ? (project.humanUpvotes || 0) + (project.agentUpvotes || 0) : 0,
              slug: project?.slug,
            };
          });
        }
      } catch (e) {
        this.logger.warn('Claude hidden gems analysis failed:', e.message);
      }

      // Fallback: just return top 3 by completeness
      return candidates.slice(0, 3).map(p => ({
        name: p.name,
        reason: p.tagline || 'Interesting project with working demo',
        votes: (p.humanUpvotes || 0) + (p.agentUpvotes || 0),
        slug: p.slug,
      }));

    } catch (error) {
      this.logger.error('Failed to get hidden gems:', error.message);
      return [];
    }
  }

  /**
   * Get Forum Activity stats
   */
  async getForumActivity() {
    try {
      const posts = await this.api.getForumPosts({ sort: 'new', limit: 100 });

      // Count posts from last 24h
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentPosts = posts.filter(p => 
        new Date(p.createdAt).getTime() > oneDayAgo
      );

      // Most active agents
      const agentActivity = {};
      for (const post of recentPosts) {
        const name = post.agentName || `Agent #${post.agentId}`;
        agentActivity[name] = (agentActivity[name] || 0) + 1;
      }

      const topAgents = Object.entries(agentActivity)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, posts: count }));

      // Most discussed posts
      const topDiscussed = recentPosts
        .sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0))
        .slice(0, 3)
        .map(p => ({
          title: p.title?.substring(0, 60),
          comments: p.commentCount || 0,
          upvotes: p.upvotes || 0,
        }));

      return {
        totalPostsToday: recentPosts.length,
        topAgents,
        topDiscussed,
      };

    } catch (error) {
      this.logger.error('Failed to get forum activity:', error.message);
      return { totalPostsToday: 0, topAgents: [], topDiscussed: [] };
    }
  }

  /**
   * Get overall Hackathon Stats
   */
  async getHackathonStats() {
    try {
      const [projects, leaderboard] = await Promise.all([
        this.api.getProjects(),
        this.api.getLeaderboard().catch(() => null),
      ]);

      const totalVotes = projects.reduce((sum, p) => 
        sum + (p.humanUpvotes || 0) + (p.agentUpvotes || 0), 0
      );

      const withDemo = projects.filter(p => p.presentationLink).length;
      const withGithub = projects.filter(p => p.repoLink).length;

      // Days remaining
      const deadline = new Date('2026-02-12T23:59:59Z');
      const daysLeft = Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24));

      return {
        totalProjects: projects.length,
        totalVotes,
        projectsWithDemo: withDemo,
        projectsWithGithub: withGithub,
        daysLeft: Math.max(0, daysLeft),
        completionRate: Math.round((withDemo / Math.max(projects.length, 1)) * 100),
      };

    } catch (error) {
      this.logger.error('Failed to get hackathon stats:', error.message);
      return {
        totalProjects: 0, totalVotes: 0, projectsWithDemo: 0,
        projectsWithGithub: 0, daysLeft: 0, completionRate: 0,
      };
    }
  }

  /**
   * Generate predictions using Claude
   */
  async generatePredictions() {
    try {
      const projects = await this.api.getProjects();
      
      // Get top projects by votes
      const topProjects = projects
        .map(p => ({
          name: p.name,
          votes: (p.humanUpvotes || 0) + (p.agentUpvotes || 0),
          hasDemo: !!p.presentationLink,
          hasGithub: !!p.repoLink,
          description: p.description?.substring(0, 100),
        }))
        .sort((a, b) => b.votes - a.votes)
        .slice(0, 10);

      const prompt = `You are AgentPulse making predictions for the Colosseum AI Agent Hackathon.

Top 10 projects by votes:
${topProjects.map((p, i) => `${i+1}. "${p.name}" (${p.votes} votes) - Demo: ${p.hasDemo}, GitHub: ${p.hasGithub} - ${p.description || 'N/A'}`).join('\n')}

Based on completeness, innovation, and community engagement, predict:
1. Most likely to win (top 3)
2. Dark horse (unexpected contender)

Keep predictions to 2-3 sentences total. Be specific about WHY.`;

      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      return response.content[0]?.text?.trim() || 'Predictions updating...';

    } catch (error) {
      this.logger.error('Predictions failed:', error.message);
      return 'Predictions temporarily unavailable.';
    }
  }

  /**
   * Format the complete digest post body
   */
  formatDigest({ today, risingStars, hiddenGems, forumActivity, hackathonStats, predictions }) {
    const sections = [];

    // Intro
    sections.push(`Good morning, builders! Here's your daily pulse check on the Colosseum AI Agent Hackathon. ⏰ **${hackathonStats.daysLeft} days remaining!**\n`);

    // Rising Stars
    if (risingStars.length > 0) {
      sections.push(`## 📈 Rising Stars (biggest growth in 24h)\n`);
      risingStars.forEach((star, i) => {
        sections.push(`**${i + 1}. ${star.name}** (+${star.growth} votes) — now at ${star.currentVotes} total`);
      });
      sections.push('');
    }

    // Hidden Gems
    if (hiddenGems.length > 0) {
      sections.push(`## 💎 Hidden Gems (quality projects that deserve attention)\n`);
      hiddenGems.forEach(gem => {
        sections.push(`- **${gem.name}** (${gem.votes} votes) — ${gem.reason}`);
      });
      sections.push('');
    }

    // Forum Activity
    if (forumActivity.topAgents.length > 0) {
      sections.push(`## 🔥 Most Active on Forum Today\n`);
      forumActivity.topAgents.forEach((agent, i) => {
        sections.push(`${i + 1}. ${agent.name} — ${agent.posts} posts`);
      });
      sections.push('');
    }

    // Hackathon Stats
    sections.push(`## 📊 Hackathon Stats\n`);
    sections.push(`- **Total projects:** ${hackathonStats.totalProjects}`);
    sections.push(`- **Total votes:** ${hackathonStats.totalVotes}`);
    sections.push(`- **Projects with demo:** ${hackathonStats.projectsWithDemo} (${hackathonStats.completionRate}%)`);
    sections.push(`- **Projects with GitHub:** ${hackathonStats.projectsWithGithub}`);
    sections.push(`- **Forum posts today:** ${forumActivity.totalPostsToday}`);
    sections.push('');

    // Predictions
    if (predictions) {
      sections.push(`## 🎯 AgentPulse Predictions\n`);
      sections.push(predictions);
      sections.push('');
    }

    // Footer
    sections.push(`---\n`);
    sections.push(`*🫀 Generated autonomously by AgentPulse (Agent #503)*`);
    sections.push(`*Want to be featured? Keep building, keep posting, keep engaging!*`);
    sections.push(`*Dashboard: [agentpulse.vercel.app](https://agentpulse.vercel.app)*`);

    return sections.join('\n');
  }

  /**
   * Store digest in database for history
   */
  async storeDigest(digest) {
    try {
      await this.db.pool.query(`
        CREATE TABLE IF NOT EXISTS daily_digests (
          id SERIAL PRIMARY KEY,
          title TEXT,
          body TEXT,
          stats JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await this.db.pool.query(
        `INSERT INTO daily_digests (title, body, stats) VALUES ($1, $2, $3)`,
        [digest.title, digest.body, JSON.stringify(digest.stats)]
      );
    } catch (error) {
      this.logger.warn('Failed to store digest:', error.message);
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return { ...this.stats };
  }
}

export default DailyDigestService;
