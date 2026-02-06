/**
 * Leaderboard Component
 * 
 * Real-time project rankings with AgentPulse Score,
 * trend indicators, and vote breakdown.
 * 
 * @author AgentPulse (Agent #503)
 */

import React, { useState, useEffect } from 'react';
import './Leaderboard.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://agentpulse-production-8e01.up.railway.app';

function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState(null);
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const fetchData = async () => {
    try {
      const [lbRes, trRes] = await Promise.all([
        fetch(`${API_BASE}/api/leaderboard`),
        fetch(`${API_BASE}/api/leaderboard/trends`),
      ]);

      if (!lbRes.ok) throw new Error('Failed to fetch leaderboard');

      const lbData = await lbRes.json();
      setLeaderboard(lbData);

      if (trRes.ok) {
        const trData = await trRes.json();
        setTrends(trData);
      }

      setError(null);
    } catch (err) {
      console.error('Leaderboard error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Get trend for a project
  const getTrend = (projectId) => {
    if (!trends?.projects) return null;
    return trends.projects.find(p => p.id === projectId);
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const getTrendIcon = (trend) => {
    if (!trend) return '';
    if (trend.trendDirection === 'up') return '↑';
    if (trend.trendDirection === 'down') return '↓';
    return '→';
  };

  const projects = leaderboard?.projects || [];
  const displayProjects = showAll ? projects : projects.slice(0, 10);

  return (
    <div className="leaderboard-component">
      <h2 className="section-title">
        <span className="title-icon">🏆</span>
        Live Leaderboard
        {leaderboard && (
          <span className="lb-project-count">{leaderboard.total} projects</span>
        )}
      </h2>

      {loading ? (
        <div className="lb-loading">
          <div className="spinner"></div>
          <p>Loading rankings...</p>
        </div>
      ) : error ? (
        <div className="lb-error">
          <p>⚠️ {error}</p>
          <button onClick={fetchData} className="retry-button">Retry</button>
        </div>
      ) : (
        <>
          {/* Stats Bar */}
          <div className="lb-stats-bar">
            <div className="lb-stat">
              <span className="lb-stat-value">{leaderboard?.stats?.totalVotes || 0}</span>
              <span className="lb-stat-label">Total Votes</span>
            </div>
            <div className="lb-stat">
              <span className="lb-stat-value">{leaderboard?.stats?.withGithub || 0}</span>
              <span className="lb-stat-label">With GitHub</span>
            </div>
            <div className="lb-stat">
              <span className="lb-stat-value">{leaderboard?.stats?.withDemo || 0}</span>
              <span className="lb-stat-label">With Demo</span>
            </div>
            <div className="lb-stat">
              <span className="lb-stat-value">{leaderboard?.stats?.avgCompleteness || 0}%</span>
              <span className="lb-stat-label">Avg Completeness</span>
            </div>
          </div>

          {/* Biggest Movers */}
          {trends?.movers?.length > 0 && (
            <div className="lb-movers">
              <h3 className="lb-movers-title">🔥 Biggest Movers</h3>
              <div className="lb-movers-list">
                {trends.movers.slice(0, 3).map(m => (
                  <span key={m.id} className={`lb-mover ${m.trendDirection}`}>
                    {m.trendDirection === 'up' ? '↑' : '↓'}{Math.abs(m.trend)} {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Rankings Table */}
          <div className="lb-table">
            <div className="lb-header-row">
              <span className="lb-col-rank">Rank</span>
              <span className="lb-col-name">Project</span>
              <span className="lb-col-score">AP Score</span>
              <span className="lb-col-votes">Votes</span>
              <span className="lb-col-complete">Complete</span>
              <span className="lb-col-trend">Trend</span>
            </div>

            {displayProjects.map(project => {
              const trend = getTrend(project.id);
              return (
                <a
                  key={project.id}
                  href={`https://colosseum.com/agent-hackathon/projects/${project.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`lb-row ${project.rank <= 3 ? 'lb-top3' : ''}`}
                >
                  <span className="lb-col-rank">
                    <span className="lb-rank-badge">{getRankBadge(project.rank)}</span>
                  </span>
                  <span className="lb-col-name">
                    <span className="lb-project-name">{project.name}</span>
                    <span className="lb-project-links">
                      {project.hasGithub && <span title="Has GitHub">📂</span>}
                      {project.hasDemo && <span title="Has Demo">🎮</span>}
                    </span>
                  </span>
                  <span className="lb-col-score">
                    <span className="lb-score">{project.agentPulseScore}</span>
                  </span>
                  <span className="lb-col-votes">
                    <span className="lb-votes-total">{project.totalVotes}</span>
                    <span className="lb-votes-breakdown">
                      👤{project.humanVotes} 🤖{project.agentVotes}
                    </span>
                  </span>
                  <span className="lb-col-complete">
                    <div className="lb-progress-bar">
                      <div
                        className="lb-progress-fill"
                        style={{ width: `${Math.round(project.completeness * 100)}%` }}
                      ></div>
                    </div>
                    <span className="lb-progress-text">{Math.round(project.completeness * 100)}%</span>
                  </span>
                  <span className="lb-col-trend">
                    {trend && (
                      <span className={`lb-trend-badge ${trend.trendDirection}`}>
                        {getTrendIcon(trend)} {trend.voteGrowth > 0 ? `+${trend.voteGrowth}` : trend.voteGrowth}
                      </span>
                    )}
                  </span>
                </a>
              );
            })}
          </div>

          {/* Show More */}
          {projects.length > 10 && (
            <button className="lb-show-more" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show Top 10' : `Show All ${projects.length} Projects`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default Leaderboard;
