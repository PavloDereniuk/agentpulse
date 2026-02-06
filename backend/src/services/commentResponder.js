/**
 * Comment Responder Service
 * 
 * Automatically responds to comments on AgentPulse's forum posts
 * with thoughtful, relevant replies.
 * 
 * Features:
 * - Monitors comments on agent's posts
 * - Filters spam and low-quality comments
 * - Generates contextual responses via Claude
 * - Rate limiting to avoid spam
 * - On-chain logging of responses
 * 
 * @author AgentPulse (Agent #503)
 */

import Anthropic from '@anthropic-ai/sdk';
import { ColosseumAPI } from './colosseumAPI.js';
import { DatabaseService } from './database.js';
import { Logger } from '../utils/logger.js';

export class CommentResponder {
  constructor() {
    this.api = new ColosseumAPI();
    this.db = new DatabaseService();
    this.logger = new Logger('CommentResponder');
    
    // Initialize Claude
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    // Config
    this.config = {
      maxResponsesPerHour: 5,
      minCommentLength: 20,
      responseDelay: 2000, // 2 sec between responses
      skipPatterns: [
        /vote.*exchange/i,
        /vote.*for.*vote/i,
        /upvote.*if.*upvote/i,
        /\$[A-Z]+/,  // Token shills like $RICO
        /buy.*token/i,
        /airdrop/i,
      ],
    };
    
    // Stats
    this.stats = {
      commentsProcessed: 0,
      responsesGenerated: 0,
      commentsSkipped: 0,
      lastRunTime: null,
    };
  }

  /**
   * Main function: Check and respond to new comments
   */
  async checkAndRespond() {
    this.logger.info('🔍 Checking for new comments to respond to...');
    this.stats.lastRunTime = new Date();

    try {
      // 1. Get our posts
      const myPostsData = await this.api.getMyPosts({ sort: 'new', limit: 20 });
      const posts = myPostsData.posts || [];
      
      if (posts.length === 0) {
        this.logger.info('No posts found');
        return { processed: 0, responded: 0 };
      }

      this.logger.info(`Found ${posts.length} posts to check`);

      let totalProcessed = 0;
      let totalResponded = 0;

      // 2. Check each post for new comments
      for (const post of posts) {
        const result = await this.processPostComments(post);
        totalProcessed += result.processed;
        totalResponded += result.responded;
        
        // Rate limiting between posts
        await this.delay(1000);
      }

      this.logger.info(`✅ Comment check complete: ${totalProcessed} processed, ${totalResponded} responses`);
      
      return { processed: totalProcessed, responded: totalResponded };

    } catch (error) {
      this.logger.error('Comment check failed:', error.message);
      throw error;
    }
  }

  /**
   * Process comments on a single post
   */
  async processPostComments(post) {
    let processed = 0;
    let responded = 0;

    try {
      // Get comments for this post
      const commentsData = await this.api.getComments(post.id, { sort: 'new', limit: 50 });
      const comments = commentsData.comments || [];
      
      if (comments.length === 0) return { processed: 0, responded: 0 };

      // Get already responded comment IDs from database
      const respondedIds = await this.getRespondedCommentIds(post.id);

      // Filter to new, unresponded comments
      const newComments = comments.filter(c => 
        !respondedIds.includes(c.id) && 
        c.agentId !== 503 && // Not our own comments
        !c.isDeleted
      );

      if (newComments.length === 0) return { processed: 0, responded: 0 };

      this.logger.info(`Post ${post.id}: ${newComments.length} new comments to process`);

      // Process each comment
      for (const comment of newComments) {
        processed++;
        this.stats.commentsProcessed++;

        // Check if should respond
        const shouldRespond = this.shouldRespondTo(comment);
        
        if (!shouldRespond.respond) {
          this.logger.info(`Skipping comment ${comment.id}: ${shouldRespond.reason}`);
          this.stats.commentsSkipped++;
          await this.markCommentProcessed(post.id, comment.id, 'skipped', shouldRespond.reason);
          continue;
        }

        // Check rate limit
        const canRespond = await this.checkRateLimit();
        if (!canRespond) {
          this.logger.warn('Rate limit reached, stopping for this cycle');
          break;
        }

        // Generate and post response
        try {
          const response = await this.generateResponse(post, comment);
          
          if (response) {
            await this.postResponse(post.id, comment, response);
            responded++;
            this.stats.responsesGenerated++;
            this.logger.info(`✅ Responded to comment ${comment.id} by ${comment.agentName}`);
          }
          
          // Delay between responses
          await this.delay(this.config.responseDelay);
          
        } catch (error) {
          this.logger.error(`Failed to respond to comment ${comment.id}:`, error.message);
          await this.markCommentProcessed(post.id, comment.id, 'error', error.message);
        }
      }

    } catch (error) {
      this.logger.error(`Failed to process comments for post ${post.id}:`, error.message);
    }

    return { processed, responded };
  }

  /**
   * Determine if we should respond to a comment
   */
  shouldRespondTo(comment) {
    // Check minimum length
    if (comment.body.length < this.config.minCommentLength) {
      return { respond: false, reason: 'too_short' };
    }

    // Check for spam patterns
    for (const pattern of this.config.skipPatterns) {
      if (pattern.test(comment.body)) {
        return { respond: false, reason: 'spam_pattern' };
      }
    }

    // Check if it's just an emoji or very low effort
    const textOnly = comment.body.replace(/[^\w\s]/g, '').trim();
    if (textOnly.length < 10) {
      return { respond: false, reason: 'low_effort' };
    }

    // Check if comment is asking a question or making a substantive point
    const hasQuestion = /\?/.test(comment.body);
    const hasSubstance = comment.body.length > 50;
    const mentionsUs = /@?agentpulse/i.test(comment.body);
    const isRelevant = /analytics|insight|data|track|monitor|dashboard|solana|agent/i.test(comment.body);

    if (hasQuestion || mentionsUs || (hasSubstance && isRelevant)) {
      return { respond: true, reason: 'relevant' };
    }

    // Default: respond to substantive comments
    if (hasSubstance) {
      return { respond: true, reason: 'substantive' };
    }

    return { respond: false, reason: 'not_relevant' };
  }

  /**
   * Generate a response using Claude
   */
  async generateResponse(post, comment) {
    const prompt = `You are AgentPulse, an autonomous analytics agent (Agent #503) participating in the Colosseum AI Agent Hackathon.

Your personality:
- Helpful and collaborative
- Data-driven and analytical  
- Enthusiastic about the agent ecosystem
- Professional but friendly
- You use 🫀 as your signature emoji

Context:
- This is a comment on YOUR forum post titled: "${post.title}"
- The commenter is: ${comment.agentName}${comment.agentClaim ? ` (@${comment.agentClaim.xUsername})` : ''}
- Your project focuses on analytics, insights, and on-chain verification of autonomous actions

The comment you're responding to:
"${comment.body}"

Write a brief, helpful response (2-4 sentences). Guidelines:
- Be genuine and specific to what they said
- If they mention their project, acknowledge it positively
- If they ask a question, answer it
- If they suggest collaboration, be open to it
- Don't be overly promotional about AgentPulse
- End with something engaging (question, offer to help, etc.)
- Keep it concise - this is a forum comment, not an essay

DO NOT:
- Agree to vote exchanges
- Promise to vote for their project in exchange for votes
- Be generic or templated
- Use excessive emojis
- Write more than 4 sentences

Response:`;

    try {
      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0]?.text?.trim();
      
      if (!text || text.length < 20) {
        this.logger.warn('Generated response too short, skipping');
        return null;
      }

      return text;

    } catch (error) {
      this.logger.error('Claude API error:', error.message);
      throw error;
    }
  }

  /**
   * Post the response to the forum
   */
  async postResponse(postId, originalComment, responseText) {
    // Add mention of the commenter
    const fullResponse = `@${originalComment.agentName} ${responseText}`;

    // Post comment
    const result = await this.api.createComment(postId, fullResponse);

    // Mark as processed in database
    await this.markCommentProcessed(postId, originalComment.id, 'responded', null, result.comment?.id);

    // Log autonomous action
    await this.logAction({
      action: 'COMMENT_RESPONSE',
      postId,
      originalCommentId: originalComment.id,
      responseCommentId: result.comment?.id,
      respondedTo: originalComment.agentName,
    });

    return result;
  }

  /**
   * Check if we're within rate limits
   */
  async checkRateLimit() {
    try {
      const result = await this.db.pool.query(`
        SELECT COUNT(*) as count 
        FROM comment_responses 
        WHERE created_at > NOW() - INTERVAL '1 hour'
          AND status = 'responded'
      `);
      
      const count = parseInt(result.rows[0]?.count || 0);
      return count < this.config.maxResponsesPerHour;
      
    } catch (error) {
      // If table doesn't exist, allow
      return true;
    }
  }

  /**
   * Get IDs of comments we've already processed
   */
  async getRespondedCommentIds(postId) {
    try {
      const result = await this.db.pool.query(`
        SELECT comment_id FROM comment_responses WHERE post_id = $1
      `, [postId]);
      
      return result.rows.map(r => r.comment_id);
    } catch (error) {
      // Table might not exist yet
      return [];
    }
  }

  /**
   * Mark a comment as processed in database
   */
  async markCommentProcessed(postId, commentId, status, reason = null, responseId = null) {
    try {
      // Ensure table exists
      await this.db.pool.query(`
        CREATE TABLE IF NOT EXISTS comment_responses (
          id SERIAL PRIMARY KEY,
          post_id INTEGER NOT NULL,
          comment_id INTEGER NOT NULL,
          response_id INTEGER,
          status VARCHAR(50) NOT NULL,
          reason VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(post_id, comment_id)
        )
      `);

      await this.db.pool.query(`
        INSERT INTO comment_responses (post_id, comment_id, response_id, status, reason)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (post_id, comment_id) DO UPDATE SET
          status = $4,
          reason = $5,
          response_id = $3
      `, [postId, commentId, responseId, status, reason]);

    } catch (error) {
      this.logger.error('Failed to mark comment processed:', error.message);
    }
  }

  /**
   * Log autonomous action
   */
  async logAction(action) {
    try {
      await this.db.logAction({
        timestamp: new Date().toISOString(),
        ...action,
        outcome: 'SUCCESS',
      });
    } catch (error) {
      this.logger.error('Failed to log action:', error.message);
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

export default CommentResponder;
