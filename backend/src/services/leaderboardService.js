/**
 * Leaderboard Service
 * 
 * Provides real-time leaderboard analytics, trends, and rankings
 * for the AgentPulse dashboard and API.
 * 
 * Features:
 * - Project rankings with multi-metric scoring
 * - Vote trend tracking over time
 * - Category breakdowns
 * - Historical snapshots for growth charts
 * 
 * @author AgentPulse (Agent #503)
 */

import { ColosseumAPI } from './colosseumAPI.js';
import { DatabaseService } from './database.js';
import { Logger } from '../utils/logger.js';

export class LeaderboardService {
  constructor() {
    this.api = new ColosseumAPI();
    this.db = new DatabaseService();
    this.logger = new Logger('Leaderboard');

    this.stats = {
      snapshotsStored: 0,
      lastSnapshotTime: null,
    };
  }

  /**
   * Get full leaderboard with AgentPulse scoring
   */
  async getLeaderboard() {
    try {
      const projects = await this.api.getProjects();

      const ranked = projects.map(p => {
        const totalVotes = (p.humanUpvotes || 0) + (p.agentUpvotes || 0);
        const completeness = this.calculateCompleteness(p);
        // Weighted score: 60% votes + 40% completeness
        const agentPulseScore = Math.round(
          (this.normalizeVotes(totalVotes, projects) * 6 + completeness * 4) * 10
        ) / 10;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          tagline: p.tagline,
          totalVotes,
          humanVotes: p.humanUpvotes || 0,
          agentVotes: p.agentUpvotes || 0,
          completeness,
          agentPulseScore,
          hasDemo: !!(p.technicalDemoLink || p.demoUrl),
          hasGithub: !!p.githubUrl,
          hasVideo: !!p.videoDemoLink,
          demoUrl: p.technicalDemoLink || p.demoUrl,
          githubUrl: p.githubUrl,
        };
      });

      // Sort by AgentPulse score
      ranked.sort((a, b) => b.agentPulseScore - a.agentPulseScore);

      // Add rank
      ranked.forEach((p, i) => { p.rank = i + 1; });

      return {
        projects: ranked,
        total: ranked.length,
        updatedAt: new Date().toISOString(),
        stats: {
          totalVotes: ranked.reduce((s, p) => s + p.totalVotes, 0),
          withDemo: ranked.filter(p => p.hasDemo).length,
          withGithub: ranked.filter(p => p.hasGithub).length,
          avgCompleteness: Math.round(
            ranked.reduce((s, p) => s + p.completeness, 0) / Math.max(ranked.length, 1) * 100
          ),
        },
      };

    } catch (error) {
      this.logger.error('Failed to get leaderboard:', error.message);
      throw error;
    }
  }

  /**
   * Get trends — compare current vs previous snapshot
   */
  async getTrends() {
    try {
      const current = await this.getLeaderboard();
      
      // Get previous snapshot from DB
      const prevSnapshot = await this.db.pool.query(`
        SELECT data FROM leaderboard_snapshots
        ORDER BY created_at DESC
        LIMIT 1 OFFSET 1
      `);

      if (prevSnapshot.rows.length === 0) {
        return {
          projects: current.projects.map(p => ({ ...p, trend: 0, trendDirection: 'new' })),
          movers: [],
        };
      }

      const prevData = prevSnapshot.rows[0].data;
      const prevMap = new Map();
      if (prevData?.projects) {
        prevData.projects.forEach(p => prevMap.set(p.id, p));
      }

      // Calculate trends
      const withTrends = current.projects.map(p => {
        const prev = prevMap.get(p.id);
        const prevRank = prev?.rank || current.projects.length;
        const trend = prevRank - p.rank; // Positive = moved up

        return {
          ...p,
          prevRank,
          trend,
          trendDirection: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable',
          voteGrowth: prev ? p.totalVotes - (prev.totalVotes || 0) : p.totalVotes,
        };
      });

      // Biggest movers
      const movers = [...withTrends]
        .sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend))
        .filter(p => p.trend !== 0)
        .slice(0, 5);

      return {
        projects: withTrends,
        movers,
      };

    } catch (error) {
      this.logger.error('Failed to get trends:', error.message);
      return { projects: [], movers: [] };
    }
  }

  /**
   * Store a snapshot for historical tracking
   */
  async storeSnapshot() {
    try {
      await this.db.pool.query(`
        CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
          id SERIAL PRIMARY KEY,
          data JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      const leaderboard = await this.getLeaderboard();

      await this.db.pool.query(
        `INSERT INTO leaderboard_snapshots (data) VALUES ($1)`,
        [JSON.stringify(leaderboard)]
      );

      this.stats.snapshotsStored++;
      this.stats.lastSnapshotTime = Date.now();

      this.logger.info(`📸 Leaderboard snapshot stored (${leaderboard.total} projects)`);

      // Cleanup old snapshots (keep last 50)
      await this.db.pool.query(`
        DELETE FROM leaderboard_snapshots
        WHERE id NOT IN (
          SELECT id FROM leaderboard_snapshots
          ORDER BY created_at DESC
          LIMIT 50
        )
      `);

    } catch (error) {
      this.logger.error('Failed to store snapshot:', error.message);
    }
  }

  /**
   * Get historical data for charts
   */
  async getHistory(projectId = null, limit = 24) {
    try {
      const snapshots = await this.db.pool.query(`
        SELECT data, created_at 
        FROM leaderboard_snapshots
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

      if (!projectId) {
        // Return overall stats history
        return snapshots.rows.reverse().map(row => ({
          timestamp: row.created_at,
          totalProjects: row.data?.total || 0,
          totalVotes: row.data?.stats?.totalVotes || 0,
          withDemo: row.data?.stats?.withDemo || 0,
        }));
      }

      // Return specific project history
      return snapshots.rows.reverse().map(row => {
        const project = row.data?.projects?.find(p => p.id === projectId);
        return {
          timestamp: row.created_at,
          rank: project?.rank || null,
          votes: project?.totalVotes || 0,
          score: project?.agentPulseScore || 0,
        };
      }).filter(d => d.rank !== null);

    } catch (error) {
      this.logger.error('Failed to get history:', error.message);
      return [];
    }
  }

  /**
   * Calculate project completeness (0-1)
   */
  calculateCompleteness(project) {
    let score = 0;
    let maxScore = 0;

    // Name (required, 1pt)
    maxScore += 1;
    if (project.name && project.name.length > 2) score += 1;

    // Description (2pts)
    maxScore += 2;
    if (project.description?.length > 300) score += 2;
    else if (project.description?.length > 100) score += 1;

    // Tagline (1pt)
    maxScore += 1;
    if (project.tagline && project.tagline.length > 10) score += 1;

    // Demo (3pts - most important)
    maxScore += 3;
    if (project.technicalDemoLink || project.demoUrl) score += 3;

    // GitHub (2pts)
    maxScore += 2;
    if (project.githubUrl) score += 2;

    // Video (1pt)
    maxScore += 1;
    if (project.videoDemoLink) score += 1;

    return score / maxScore;
  }

  /**
   * Normalize votes to 0-1 scale relative to max in the set
   */
  normalizeVotes(votes, allProjects) {
    const maxVotes = Math.max(
      ...allProjects.map(p => (p.humanUpvotes || 0) + (p.agentUpvotes || 0)),
      1
    );
    return votes / maxVotes;
  }

  /**
   * Get stats
   */
  getStats() {
    return { ...this.stats };
  }
}

export default LeaderboardService;
