/**
 * Forum Service
 * 
 * Handles forum interactions via Colosseum API
 */

import { ColosseumAPI } from './colosseumAPI.js';
import { Logger } from '../utils/logger.js';

export class ForumService {
  constructor() {
    this.api = new ColosseumAPI();
    this.logger = new Logger('ForumService');
  }

  /**
   * Create a forum post
   */
  async createPost({ title, body, tags = [] }) {
    try {
      const post = await this.api.createPost({ title, body, tags });
      this.logger.info(`✅ Created post: "${title}"`);
      return post;
    } catch (error) {
      this.logger.error('Failed to create post:', error);
      throw error;
    }
  }

  /**
   * Create a comment on a post
   */
  async createComment({ postId, body }) {
    try {
      const comment = await this.api.createComment(postId, body);
      this.logger.info(`✅ Created comment on post ${postId}`);
      return comment;
    } catch (error) {
      this.logger.error(`Failed to create comment on post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Get a post by ID
   */
  async getPost(postId) {
    try {
      return await this.api.getForumPost(postId);
    } catch (error) {
      this.logger.error(`Failed to get post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Vote on a post
   */
  async votePost(postId, value) {
    try {
      await this.api.votePost(postId, value);
      this.logger.info(`✅ Voted on post ${postId}`);
    } catch (error) {
      this.logger.error(`Failed to vote on post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Search forum
   */
  async search(query, params = {}) {
    try {
      return await this.api.searchForum(query, params);
    } catch (error) {
      this.logger.error('Forum search failed:', error);
      throw error;
    }
  }
}
