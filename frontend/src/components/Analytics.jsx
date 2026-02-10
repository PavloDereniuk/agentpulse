/**
 * Analytics Dashboard Component
 * 
 * Displays comprehensive analytics and insights
 */

import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { format } from 'date-fns';
import './Analytics.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://agentpulse-production-8e01.up.railway.app';

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

function Analytics() {
  const [overview, setOverview] = useState(null);
  const [voting, setVoting] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all analytics data
  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [overviewRes, votingRes, engagementRes, timelineRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/overview`),
        fetch(`${API_BASE}/api/analytics/voting`),
        fetch(`${API_BASE}/api/analytics/engagement`),
        fetch(`${API_BASE}/api/analytics/timeline`)
      ]);

      const [overviewData, votingData, engagementData, timelineData] = await Promise.all([
        overviewRes.json(),
        votingRes.json(),
        engagementRes.json(),
        timelineRes.json()
      ]);

      setOverview(overviewData);
      setVoting(votingData);
      setEngagement(engagementData);
      setTimeline(timelineData);
      setError(null);
    } catch (err) {
      console.error('Analytics fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="analytics-loading">
        <div className="spinner"></div>
        <p>Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-error">
        <span className="error-icon">⚠️</span>
        <p>Failed to load analytics: {error}</p>
        <button onClick={fetchAnalytics} className="retry-button">Retry</button>
      </div>
    );
  }

  // Prepare chart data
  const actionDistributionData = overview?.actionDistribution?.map(item => ({
    name: item.type.replace(/_/g, ' '),
    value: item.count
  })) || [];

  const scoreDistributionData = voting?.scoreDistribution 
    ? Object.entries(voting.scoreDistribution).map(([score, count]) => ({
        score: `${score}/10`,
        count
      }))
    : [];

  const dailyActivityData = timeline?.daily?.map(day => ({
    date: format(new Date(day.date), 'MMM dd'),
    total: day.total,
    dataCollection: day.breakdown.dataCollection,
    responses: day.breakdown.commentResponses,
    spotlights: day.breakdown.spotlights
  })) || [];

  const hourlyEngagementData = engagement?.commentsByHour?.map(item => ({
    hour: `${item.hour}:00`,
    responses: item.count
  })) || [];

  return (
    <div className="analytics-container">
      {/* Header */}
      <div className="analytics-header">
        <h2 className="analytics-title">
          <span className="title-icon">📊</span>
          Analytics Dashboard
        </h2>
        <p className="analytics-subtitle">Real-time insights and performance metrics</p>
      </div>

      {/* Overview Cards */}
      <section className="overview-section">
        <div className="metric-cards">
          <div className="metric-card">
            <div className="metric-icon">🎯</div>
            <div className="metric-content">
              <span className="metric-value">{overview?.totalActions?.toLocaleString()}</span>
              <span className="metric-label">Total Actions</span>
            </div>
            <div className={`metric-change ${overview?.dailyGrowth >= 0 ? 'positive' : 'negative'}`}>
              {overview?.dailyGrowth >= 0 ? '↗' : '↘'} {Math.abs(overview?.dailyGrowth)}%
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">✅</div>
            <div className="metric-content">
              <span className="metric-value">{overview?.successRate}%</span>
              <span className="metric-label">Success Rate</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">🗳️</div>
            <div className="metric-content">
              <span className="metric-value">{voting?.votesGiven}</span>
              <span className="metric-label">Votes Given</span>
            </div>
            <div className="metric-detail">Avg: {voting?.avgScore}/10</div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">💬</div>
            <div className="metric-content">
              <span className="metric-value">{engagement?.totalResponses}</span>
              <span className="metric-label">Responses</span>
            </div>
            <div className="metric-detail">{engagement?.uniquePosts} unique posts</div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">🔥</div>
            <div className="metric-content">
              <span className="metric-value">{overview?.activeHours?.join(', ')}</span>
              <span className="metric-label">Peak Hours (UTC)</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">📈</div>
            <div className="metric-content">
              <span className="metric-value">{overview?.topActionType?.replace(/_/g, ' ')}</span>
              <span className="metric-label">Top Action</span>
            </div>
          </div>
        </div>
      </section>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Activity Timeline */}
        <section className="chart-section full-width">
          <h3 className="chart-title">
            <span>📈</span> Activity Timeline (Last 7 Days)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyActivityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#f9fafb' }}
              />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} name="Total" />
              <Line type="monotone" dataKey="dataCollection" stroke="#06b6d4" name="Data Collection" />
              <Line type="monotone" dataKey="responses" stroke="#10b981" name="Responses" />
              <Line type="monotone" dataKey="spotlights" stroke="#f59e0b" name="Spotlights" />
            </LineChart>
          </ResponsiveContainer>
        </section>

        {/* Action Distribution */}
        <section className="chart-section">
          <h3 className="chart-title">
            <span>🎯</span> Action Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={actionDistributionData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {actionDistributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </section>

        {/* Voting Score Distribution */}
        <section className="chart-section">
          <h3 className="chart-title">
            <span>🗳️</span> Voting Score Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scoreDistributionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="score" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#f9fafb' }}
              />
              <Bar dataKey="count" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* Engagement by Hour */}
        <section className="chart-section full-width">
          <h3 className="chart-title">
            <span>💬</span> Comment Responses by Hour (Last 7 Days)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyEngagementData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="hour" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#f9fafb' }}
              />
              <Bar dataKey="responses" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      {/* Insights & Top Performers */}
      <div className="insights-grid">
        {/* AI Insights */}
        <section className="insights-section">
          <h3 className="section-title">
            <span>💡</span> AI Insights
          </h3>
          <div className="insights-list">
            <div className="insight-item">
              <span className="insight-icon">🔥</span>
              <div className="insight-content">
                <strong>Peak Activity Hours:</strong> {overview?.activeHours?.join(', ')} UTC
              </div>
            </div>
            <div className="insight-item">
              <span className="insight-icon">🎯</span>
              <div className="insight-content">
                <strong>Success Rate:</strong> {overview?.successRate}% - Excellent performance!
              </div>
            </div>
            <div className="insight-item">
              <span className="insight-icon">📊</span>
              <div className="insight-content">
                <strong>Daily Growth:</strong> {overview?.dailyGrowth >= 0 ? '+' : ''}{overview?.dailyGrowth}%
              </div>
            </div>
            <div className="insight-item">
              <span className="insight-icon">🗳️</span>
              <div className="insight-content">
                <strong>Voting Quality:</strong> Avg score {voting?.avgScore}/10 across {voting?.projectsEvaluated} projects
              </div>
            </div>
          </div>
        </section>

        {/* Top Engagement Targets */}
        <section className="insights-section">
          <h3 className="section-title">
            <span>👥</span> Top Engagement Targets
          </h3>
          <div className="targets-list">
            {engagement?.topTargets?.map((target, index) => (
              <div key={index} className="target-item">
                <span className="target-rank">#{index + 1}</span>
                <span className="target-name">@{target.username}</span>
                <span className="target-count">{target.responses} responses</span>
              </div>
            ))}
          </div>
        </section>

        {/* Top Projects */}
        <section className="insights-section full-width-insight">
          <h3 className="section-title">
            <span>🏆</span> Top Voted Projects
          </h3>
          <div className="projects-list">
            {voting?.topProjects?.slice(0, 5).map((project, index) => (
              <div key={index} className="project-item">
                <div className="project-rank">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </div>
                <div className="project-info">
                  <div className="project-header">
                    <span className="project-id">Project #{project.id}</span>
                    <span className="project-score">{project.score}/10</span>
                  </div>
                  <div className="project-breakdown">
                    <span className="breakdown-item">Obj: {project.objectiveScore}</span>
                    <span className="breakdown-item">Claude: {project.claudeScore}</span>
                  </div>
                  <p className="project-reasoning">{project.reasoning.substring(0, 150)}...</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default Analytics;
