/**
 * Colosseum API Service
 * 
 * Wrapper for all Colosseum API interactions
 * Updated with verified working endpoints
 */

import axios from 'axios';
import { Logger } from '../utils/logger.js';

export class ColosseumAPI {
  constructor() {
    this.baseURL = process.env.COLOSSEUM_API_BASE || 'https://agents.colosseum.com/api';
    this.apiKey = process.env.AGENT_API_KEY;
    this.agentId = process.env.AGENT_ID;
    this.logger = new Logger('ColosseumAPI');
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
        ...(this.agentId && { 'X-Agent-Id': this.agentId })
      }
    });
  }

  /**
   * Get agent status
   */
  async getAgentStatus() {
    try {
      const response = await this.client.get('/agents/status');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get agent status:', error.message);
      throw error;
    }
  }

  /**
   * Get leaderboard (verified working)
   */
  async getLeaderboard(params = {}) {
    try {
      const response = await this.client.get('/leaderboard', {
        params: { limit: 100, ...params }
      });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get leaderboard:', error.message);
      throw error;
    }
  }

  /**
   * Get all projects (verified working)
   */
  async getProjects(params = {}) {
    try {
      const response = await this.client.get('/projects', {
        params: { limit: 100, ...params }
      });
      // API returns { projects: [...] }
      return response.data.projects || [];
    } catch (error) {
      this.logger.error('Failed to get projects:', error.message);
      throw error;
    }
  }

  /**
   * Get project by slug
   */
  async getProject(slug) {
    try {
      const response = await this.client.get(`/projects/${slug}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get project ${slug}:`, error.message);
      throw error;
    }
  }

  /**
   * Get forum posts (verified working)
   */
  async getForumPosts(params = {}) {
    try {
      const response = await this.client.get('/forum/posts', {
        params: { limit: 100, ...params }
      });
      // API returns { posts: [...] }
      return response.data.posts || [];
    } catch (error) {
      this.logger.error('Failed to get forum posts:', error.message);
      throw error;
    }
  }

  /**
   * Get single forum post
   */
  async getForumPost(postId) {
    try {
      const response = await this.client.get(`/forum/posts/${postId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get post ${postId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get comments on a post
   */
  async getComments(postId, params = {}) {
    try {
      const response = await this.client.get(`/forum/posts/${postId}/comments`, { params });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get comments for post ${postId}:`, error.message);
      throw error;
    }
  }

  /**
   * Create forum post
   */
  async createPost(data) {
    try {
      const response = await this.client.post('/forum/posts', data);
      this.logger.info(`✅ Created forum post: "${data.title}"`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create post:', error.message);
      throw error;
    }
  }

  /**
   * Create comment
   */
  async createComment(postId, body) {
    try {
      const response = await this.client.post(`/forum/posts/${postId}/comments`, { body });
      this.logger.info(`✅ Created comment on post ${postId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create comment on post ${postId}:`, error.message);
      throw error;
    }
  }

  /**
   * Vote on post
   */
  async votePost(postId, value) {
    try {
      const response = await this.client.post(`/forum/posts/${postId}/vote`, { value });
      this.logger.info(`✅ Voted ${value > 0 ? 'up' : 'down'} on post ${postId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to vote on post ${postId}:`, error.message);
      throw error;
    }
  }

  /**
   * Vote on project
   */
  async voteProject(projectId, value = 1) {
    try {
      const response = await this.client.post(`/projects/${projectId}/vote`, { value });
      this.logger.info(`✅ Voted on project ${projectId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to vote on project ${projectId}:`, error.message);
      throw error;
    }
  }

  /**
   * Vote for project (alias for compatibility)
   */
  async voteForProject(projectId) {
    return this.voteProject(projectId, 1);
  }

  /**
   * Get my project (verified working with auth)
   */
  async getMyProject() {
    try {
      const response = await this.client.get('/my-project');
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      this.logger.error('Failed to get my project:', error.message);
      throw error;
    }
  }

  /**
   * Create project
   */
  async createProject(data) {
    try {
      const response = await this.client.post('/my-project', data);
      this.logger.info(`✅ Created project: "${data.name}"`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create project:', error.message);
      throw error;
    }
  }

  /**
   * Update project
   */
  async updateProject(data) {
    try {
      const response = await this.client.put('/my-project', data);
      this.logger.info(`✅ Updated project`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to update project:', error.message);
      throw error;
    }
  }

  /**
   * Submit project
   */
  async submitProject() {
    try {
      const response = await this.client.post('/my-project/submit');
      this.logger.info(`✅ SUBMITTED PROJECT!`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to submit project:', error.message);
      throw error;
    }
  }

  /**
   * Search forum
   */
  async searchForum(query, params = {}) {
    try {
      const response = await this.client.get('/forum/search', {
        params: { q: query, ...params }
      });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to search forum:', error.message);
      throw error;
    }
  }

  /**
   * Get my posts
   */
  async getMyPosts(params = {}) {
    try {
      const response = await this.client.get('/forum/me/posts', { params });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get my posts:', error.message);
      throw error;
    }
  }

  /**
   * Get my comments
   */
  async getMyComments(params = {}) {
    try {
      const response = await this.client.get('/forum/me/comments', { params });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get my comments:', error.message);
      throw error;
    }
  }
}

export default ColosseumAPI;
