/**
 * Database Service
 *
 * Handles all database operations
 */

import pg from "pg";
import { Logger } from "../utils/logger.js";

const { Pool } = pg;

export class DatabaseService {
  constructor() {
    this.logger = new Logger("Database");
    this.pool = null;
    this.initialize();
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      // Only initialize if DATABASE_URL is provided
      if (!process.env.DATABASE_URL) {
        this.logger.warn(
          "⚠️  DATABASE_URL not set - database features disabled",
        );
        return;
      }

      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false,
        },
      });

      // Test connection
      const client = await this.pool.connect();
      this.logger.info("✅ Database connected");
      client.release();

      // Create tables if they don't exist
      await this.createTables();
    } catch (error) {
      this.logger.error("❌ Database connection failed:", error.message);
      this.logger.warn("⚠️  Database features will be disabled");
      this.pool = null;
    }
  }

  /**
   * Create necessary tables
   */
  async createTables() {
    if (!this.pool) return;

    const queries = [
      // Projects table
      `CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        external_id INTEGER UNIQUE,
        name TEXT,
        slug TEXT UNIQUE,
        description TEXT,
        status TEXT,
        human_upvotes INTEGER DEFAULT 0,
        agent_upvotes INTEGER DEFAULT 0,
        data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // Forum posts table
      `CREATE TABLE IF NOT EXISTS forum_posts (
        id SERIAL PRIMARY KEY,
        external_id INTEGER UNIQUE,
        agent_id INTEGER,
        agent_name TEXT,
        title TEXT,
        body TEXT,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        fetched_at TIMESTAMP DEFAULT NOW()
      )`,

      // Autonomy log table
      `CREATE TABLE IF NOT EXISTS autonomy_log (
        id SERIAL PRIMARY KEY,
        action TEXT,
        details JSONB,
        outcome TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`,

      // Insights table
      `CREATE TABLE IF NOT EXISTS insights (
        id SERIAL PRIMARY KEY,
        title TEXT,
        body TEXT,
        data_points INTEGER,
        quality_score FLOAT,
        posted BOOLEAN DEFAULT FALSE,
        posted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      // Leaderboard snapshots table
      `CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id SERIAL PRIMARY KEY,
    data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  )`,

      // Comment responses table
      `CREATE TABLE IF NOT EXISTS comment_responses (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL,
    comment_id INTEGER NOT NULL,
    response_id INTEGER,
    status VARCHAR(50) NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, comment_id)
  )`,

      // Project votes table
      `CREATE TABLE IF NOT EXISTS project_votes (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    project_name VARCHAR(255),
    score INTEGER,
    reasoning TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`,

      // Project evaluations table
      `CREATE TABLE IF NOT EXISTS project_evaluations (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE,
    score INTEGER NOT NULL,
    completeness INTEGER,
    innovation INTEGER,
    technical_quality INTEGER,
    ecosystem_value INTEGER,
    engagement INTEGER,
    reasoning TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`,
    ];

    for (const query of queries) {
      try {
        await this.pool.query(query);
      } catch (error) {
        this.logger.error("Failed to create table:", error.message);
      }
    }

    this.logger.info("✅ Database tables ready");
  }

  /**
   * Store projects
   */
  async storeProjects(projects) {
    if (!this.pool || !projects || projects.length === 0) return;

    try {
      for (const project of projects) {
        await this.pool.query(
          `INSERT INTO projects (external_id, name, slug, description, status, human_upvotes, agent_upvotes, data, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (external_id) 
           DO UPDATE SET 
             name = $2,
             description = $4,
             status = $5,
             human_upvotes = $6,
             agent_upvotes = $7,
             data = $8,
             updated_at = NOW()`,
          [
            project.id,
            project.name,
            project.slug,
            project.description,
            project.status,
            project.humanUpvotes || 0,
            project.agentUpvotes || 0,
            JSON.stringify(project),
          ],
        );
      }
      this.logger.info(`✅ Stored ${projects.length} projects`);
    } catch (error) {
      this.logger.error("Failed to store projects:", error.message);
    }
  }

  /**
   * Store forum posts
   */
  async storeForumPosts(posts) {
    if (!this.pool || !posts || posts.length === 0) return;

    try {
      for (const post of posts) {
        await this.pool.query(
          `INSERT INTO forum_posts (external_id, agent_id, agent_name, title, body, upvotes, downvotes, comment_count, data, created_at, fetched_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           ON CONFLICT (external_id)
           DO UPDATE SET
             upvotes = $6,
             downvotes = $7,
             comment_count = $8,
             data = $9,
             fetched_at = NOW()`,
          [
            post.id,
            post.agentId,
            post.agentName,
            post.title,
            post.body,
            post.upvotes || 0,
            post.downvotes || 0,
            post.commentCount || 0,
            JSON.stringify(post),
            post.createdAt,
          ],
        );
      }
      this.logger.info(`✅ Stored ${posts.length} forum posts`);
    } catch (error) {
      this.logger.error("Failed to store forum posts:", error.message);
    }
  }

  /**
   * Store leaderboard data
   */
  async storeLeaderboard(leaderboard) {
    if (!this.pool || !leaderboard) return;
    // TODO: Implement leaderboard storage
  }

  /**
   * Log autonomous action
   */
  async logAction(action) {
    if (!this.pool) return;

    try {
      await this.pool.query(
        "INSERT INTO autonomy_log (action, details, outcome, created_at) VALUES ($1, $2, $3, NOW())",
        [action.action, JSON.stringify(action), action.outcome || "PENDING"],
      );
    } catch (error) {
      this.logger.error("Failed to log action:", error.message);
    }
  }

  /**
   * Get recent posts
   */
  async getRecentPosts(hours = 24) {
    if (!this.pool) return [];

    try {
      const result = await this.pool.query(
        `SELECT * FROM forum_posts 
         WHERE agent_name = $1 
         AND created_at > NOW() - INTERVAL '${hours} hours'
         ORDER BY created_at DESC`,
        [process.env.AGENT_NAME || "agentpulse"],
      );
      return result.rows;
    } catch (error) {
      this.logger.error("Failed to get recent posts:", error.message);
      return [];
    }
  }

  /**
   * Get last post time
   */
  async getLastPostTime() {
    if (!this.pool) return null;

    try {
      const result = await this.pool.query(
        `SELECT MAX(created_at) as last_post 
         FROM forum_posts 
         WHERE agent_name = $1`,
        [process.env.AGENT_NAME || "agentpulse"],
      );
      return result.rows[0]?.last_post
        ? new Date(result.rows[0].last_post).getTime()
        : null;
    } catch (error) {
      this.logger.error("Failed to get last post time:", error.message);
      return null;
    }
  }

  /**
   * Get today's post count
   */
  async getTodayPostCount() {
    if (!this.pool) return 0;

    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count 
         FROM forum_posts 
         WHERE agent_name = $1 
         AND DATE(created_at) = CURRENT_DATE`,
        [process.env.AGENT_NAME || "agentpulse"],
      );
      return parseInt(result.rows[0]?.count || 0);
    } catch (error) {
      this.logger.error("Failed to get today post count:", error.message);
      return 0;
    }
  }

  /**
   * Check if insight is duplicate
   */
  async isDuplicateInsight(insight) {
    if (!this.pool) return false;

    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count 
         FROM insights 
         WHERE title ILIKE $1 
         AND created_at > NOW() - INTERVAL '7 days'`,
        [`%${insight.title}%`],
      );
      return parseInt(result.rows[0]?.count || 0) > 0;
    } catch (error) {
      this.logger.error("Failed to check duplicate insight:", error.message);
      return false;
    }
  }

  /**
   * Store predictions
   */
  async storePredictions(predictions) {
    if (!this.pool) return;
    // TODO: Implement predictions storage
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.logger.info("Database connection closed");
    }
  }
}
