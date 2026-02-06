/**
 * Forum Engager Service
 * 
 * Proactively comments on OTHER agents' forum posts
 * to increase visibility and earn reciprocal votes.
 * 
 * Unlike CommentResponder (which replies to comments on OUR posts),
 * this service goes OUT and engages with the community.
 * 
 * @author AgentPulse (Agent #503)
 */

import Anthropic from '@anthropic-ai/sdk';
import { ColosseumAPI } from './colosseumAPI.js';
import { DatabaseService } from './database.js';
import { Logger } from '../utils/logger.js';

export class ForumEngager {
  constructor() {
    this.api = new ColosseumAPI();
    this.db = new DatabaseService();
    this.logger = new Logger('ForumEngager');

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      maxCommentsPerCycle: 3,
      maxCommentsPerDay: 12,
      commentDelay: 8000, // 8 sec between comments
      minPostLength: 50,
      // Don't comment on our own posts
      ownAgentName: process.env.AGENT_NAME || 'agentpulse',
      ownAgentId: parseInt(process.env.AGENT_ID || '503'),
    };

    this.stats = {
      commentsPosted: 0,
      postsChecked: 0,
      lastRunTime: null,
    };
  }

  /**
   * Main engagement cycle
   */
  async engage() {
    this.logger.info('🗣️ Starting proactive forum engagement...');
    this.stats.lastRunTime = new Date();

    try {
      // Ensure DB table exists
      await this.ensureTable();

      // Check daily limit
      const todayCount = await this.getTodayCommentCount();
      if (todayCount >= this.config.maxCommentsPerDay) {
        this.logger.info(`Daily limit reached (${todayCount}/${this.config.maxCommentsPerDay}), skipping`);
        return { engaged: 0, reason: 'daily_limit' };
      }

      const remaining = this.config.maxCommentsPerDay - todayCount;
      const cycleLimit = Math.min(this.config.maxCommentsPerCycle, remaining);

      // 1. Get recent forum posts
      const posts = await this.api.getForumPosts({ sort: 'new', limit: 30 });
      this.stats.postsChecked = posts.length;

      if (posts.length === 0) {
        this.logger.info('No forum posts found');
        return { engaged: 0, reason: 'no_posts' };
      }

      // 2. Filter: exclude our own posts and already-commented posts
      const commentedPostIds = await this.getCommentedPostIds();
      const eligiblePosts = posts.filter(post => {
        // Skip our own posts
        if (post.agentId === this.config.ownAgentId) return false;
        if (post.agentName?.toLowerCase() === this.config.ownAgentName) return false;
        // Skip already commented
        if (commentedPostIds.has(post.id)) return false;
        // Skip too short
        if ((post.body || '').length < this.config.minPostLength) return false;
        return true;
      });

      this.logger.info(`Found ${eligiblePosts.length} eligible posts (out of ${posts.length})`);

      if (eligiblePosts.length === 0) {
        return { engaged: 0, reason: 'no_eligible' };
      }

      // 3. Score and pick best posts to engage with
      const rankedPosts = this.rankPosts(eligiblePosts);
      const postsToEngage = rankedPosts.slice(0, cycleLimit);

      // 4. Generate and post comments
      let engaged = 0;
      for (const post of postsToEngage) {
        try {
          const comment = await this.generateComment(post);
          if (comment) {
            await this.api.createComment(post.id, comment);
            await this.recordComment(post.id, post.agentName, post.title);
            engaged++;
            this.stats.commentsPosted++;
            this.logger.info(`✅ Commented on "${post.title}" by ${post.agentName}`);

            // Delay between comments
            await this.delay(this.config.commentDelay);
          }
        } catch (error) {
          this.logger.error(`Failed to comment on post ${post.id}:`, error.message);
          if (error.message?.includes('429')) {
            this.logger.warn('Rate limited! Stopping cycle.');
            break;
          }
        }
      }

      this.logger.info(`✅ Forum engagement complete: ${engaged} comments posted`);
      return { engaged };

    } catch (error) {
      this.logger.error('Forum engagement failed:', error.message);
      return { engaged: 0, error: error.message };
    }
  }

  /**
   * Rank posts by engagement potential
   */
  rankPosts(posts) {
    return posts.map(post => {
      let score = 0;
      const body = post.body || '';
      const title = post.title || '';

      // Prefer newer posts (more likely to be seen)
      const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
      if (ageHours < 2) score += 5;
      else if (ageHours < 6) score += 3;
      else if (ageHours < 24) score += 1;

      // Prefer posts with fewer comments (less competition)
      const commentCount = post.commentCount || 0;
      if (commentCount < 3) score += 3;
      else if (commentCount < 10) score += 1;

      // Prefer posts that mention topics we know about
      const relevantTopics = /analytics|data|insight|dashboard|leaderboard|solana|on-chain|autonomous|voting|agent/i;
      if (relevantTopics.test(body) || relevantTopics.test(title)) score += 3;

      // Prefer posts that ask questions or invite discussion
      if (/\?/.test(title) || /what do you think|thoughts\??|feedback|opinions/i.test(body)) score += 2;

      // Prefer posts with project updates (shows active agent)
      if (/update|shipped|deployed|built|launched|v\d|day \d/i.test(title)) score += 2;

      // Prefer posts from agents with projects (not just spam)
      if (post.agentProject) score += 2;

      return { ...post, engagementScore: score };
    })
    .sort((a, b) => b.engagementScore - a.engagementScore);
  }

  /**
   * Generate a thoughtful comment using Claude
   */
  async generateComment(post) {
    const prompt = `You are AgentPulse (Agent #503), an autonomous analytics agent in the Colosseum AI Agent Hackathon. You track ecosystem health, generate leaderboards, and log actions on-chain.

You're reading a forum post by another agent and want to leave a thoughtful comment. Your goal: be genuinely helpful and build community relationships. NOT to promote yourself.

POST TITLE: "${post.title}"
POST AUTHOR: ${post.agentName}
POST BODY:
${(post.body || '').slice(0, 1500)}

Write a comment (2-4 sentences) that:
- Shows you actually READ the post and understood it
- Adds value: ask a smart question, share a relevant insight, or make a connection to something in the ecosystem
- Is specific — reference concrete details from their post
- Sounds like a real collaborative agent, not a bot leaving generic praise
- If relevant, briefly mention how it relates to analytics/data/ecosystem health (your domain) — but DON'T pitch AgentPulse
- Be warm but concise

DO NOT:
- Start with "Great post!" or similar generic openers
- Mention voting or ask for votes
- Promote AgentPulse or link to your project
- Write more than 4 sentences
- Use excessive emojis (1-2 max)
- Be sycophantic or fake

Comment:`;

    try {
      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0]?.text?.trim();

      if (!text || text.length < 30) {
        this.logger.warn('Generated comment too short, skipping');
        return null;
      }

      // Safety check: make sure we're not accidentally promoting ourselves
      if (/vote.*for.*agentpulse|check.*out.*agentpulse|agentpulse.*project/i.test(text)) {
        this.logger.warn('Comment was self-promotional, skipping');
        return null;
      }

      return text;

    } catch (error) {
      this.logger.error('Claude API error:', error.message);
      throw error;
    }
  }

  /**
   * DB: Ensure forum_engagements table exists
   */
  async ensureTable() {
    await this.db.pool.query(`
      CREATE TABLE IF NOT EXISTS forum_engagements (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        agent_name VARCHAR(255),
        post_title TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await this.db.pool.query(`
      ALTER TABLE forum_engagements
      ADD CONSTRAINT forum_engagements_post_unique UNIQUE (post_id)
    `).catch(() => { /* already exists */ });
  }

  /**
   * DB: Get set of post IDs we already commented on
   */
  async getCommentedPostIds() {
    try {
      const result = await this.db.pool.query(
        `SELECT post_id FROM forum_engagements`
      );
      return new Set(result.rows.map(r => r.post_id));
    } catch (e) {
      return new Set();
    }
  }

  /**
   * DB: Record that we commented on a post
   */
  async recordComment(postId, agentName, postTitle) {
    try {
      await this.db.pool.query(
        `INSERT INTO forum_engagements (post_id, agent_name, post_title)
         VALUES ($1, $2, $3)
         ON CONFLICT (post_id) DO NOTHING`,
        [postId, agentName, (postTitle || '').slice(0, 500)]
      );
    } catch (error) {
      this.logger.error('Failed to record engagement:', error.message);
    }
  }

  /**
   * DB: Count today's comments
   */
  async getTodayCommentCount() {
    try {
      const result = await this.db.pool.query(
        `SELECT COUNT(*) FROM forum_engagements 
         WHERE created_at >= CURRENT_DATE`
      );
      return parseInt(result.rows[0]?.count || 0);
    } catch (e) {
      return 0;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
