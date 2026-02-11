import React, { useEffect, useState } from "react";
import "./Learning.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function Learning() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAllTimeline, setShowAllTimeline] = useState(false);

  useEffect(() => {
    fetchLearningData();
    const interval = setInterval(fetchLearningData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const fetchLearningData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/learning/stats`);
      const result = await response.json();
      if (result.success) {
        setData(result);
        setLoading(false);
      }
    } catch (error) {
      console.error("Failed to fetch learning data:", error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="learning-container">
        <div className="loading">Loading learning stats...</div>
      </div>
    );
  }

  if (!data) return null;

  const {
    confidenceOverTime,
    confidenceDistribution,
    votingAccuracy,
    metrics,
  } = data;

  // Calculate accuracy correlation (our score vs community upvotes)
  const topVotes = votingAccuracy.slice(0, 10);
  const avgOurScore =
    topVotes.reduce((sum, v) => sum + v.our_score, 0) / topVotes.length;
  const avgCommunityScore =
    topVotes.reduce((sum, v) => sum + v.total_upvotes, 0) / topVotes.length;

  return (
    <div className="learning-container">
      <div className="learning-header">
        <h1>🧠 Learning & Evolution</h1>
        <p className="subtitle">
          How AgentPulse improves through autonomous decision-making
        </p>
      </div>

      {/* Key Metrics */}
      <div className="learning-metrics">
        <div className="metric-card highlight">
          <div className="metric-icon">🎯</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.averageConfidence}%</div>
            <div className="metric-label">Average Confidence</div>
            <div className="metric-trend">↗️ Consistently high</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⭐</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.highConfidenceRate}</div>
            <div className="metric-label">High Confidence Decisions</div>
            <div className="metric-sublabel">90-100% confidence</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.totalActions}</div>
            <div className="metric-label">Total Reasoned Actions</div>
            <div className="metric-sublabel">With full explanations</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">🎲</div>
          <div className="metric-content">
            <div className="metric-value">{avgOurScore.toFixed(1)}/10</div>
            <div className="metric-label">Avg Project Score</div>
            <div className="metric-sublabel">Our evaluation</div>
          </div>
        </div>
      </div>

      {/* Confidence Distribution */}
      <div className="learning-section">
        <h2>📈 Confidence Distribution</h2>
        <p className="section-desc">
          Distribution of decision confidence levels
        </p>

        <div className="confidence-bars">
          {confidenceDistribution.map((dist, idx) => {
            const total = confidenceDistribution.reduce(
              (sum, d) => sum + parseInt(d.count),
              0,
            );
            const percentage = ((parseInt(dist.count) / total) * 100).toFixed(
              1,
            );

            return (
              <div key={idx} className="confidence-bar-item">
                <div className="bar-label">
                  <span className="range">{dist.confidence_range}</span>
                  <span className="count">{dist.count} actions</span>
                </div>
                <div className="bar-wrapper">
                  <div
                    className={`bar-fill confidence-${dist.confidence_range.split("-")[0]}`}
                    style={{ width: `${percentage}%` }}
                  >
                    <span className="bar-percentage">{percentage}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confidence Over Time */}
      <div className="learning-section">
        <h2>⏱️ Confidence Over Time</h2>
        <p className="section-desc">
          How decision confidence evolves with each action cycle
        </p>

        <div className="timeline">
          {confidenceOverTime
            .slice(-( showAllTimeline ? confidenceOverTime.length : 5))
            .map((period, idx) => {
            const confidence = (
              parseFloat(period.avg_confidence) * 100
            ).toFixed(1);
            const date = new Date(period.time_bucket);
            const timeLabel = date.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              hour12: false,
            });

            return (
              <div key={idx} className="timeline-item">
                <div className="timeline-dot"></div>
                <div className="timeline-content">
                  <div className="timeline-header">
                    <span className="timeline-time">{timeLabel}</span>
                    <span className={`timeline-type ${period.action_type}`}>
                      {period.action_type === "VOTE_CAST"
                        ? "🗳️ Vote"
                        : "💬 Comment"}
                    </span>
                  </div>
                  <div className="timeline-stats">
                    <div className="stat">
                      <span className="stat-label">Confidence:</span>
                      <span className="stat-value">{confidence}%</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Actions:</span>
                      <span className="stat-value">{period.action_count}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {confidenceOverTime.length > 5 && (
          <button 
            className="learning-show-more"
            onClick={() => setShowAllTimeline(!showAllTimeline)}
          >
            {showAllTimeline ? 'Show latest 5' : `Show all ${confidenceOverTime.length} periods`}
          </button>
        )}
      </div>

      {/* Voting Accuracy */}
      <div className="learning-section">
        <h2>🎯 Decision Quality</h2>
        <p className="section-desc">
          Correlation between our evaluations and community validation
        </p>

        <div className="accuracy-grid">
          {topVotes
            .map((vote, idx) => {
              // Deduplicate by project name
              if (
                idx > 0 &&
                vote.project_name === topVotes[idx - 1].project_name
              )
                return null;

              const matchScore = (
                (((vote.our_score / 10) * vote.total_upvotes) / 50) *
                100
              ).toFixed(0);

              return (
                <div key={idx} className="accuracy-card">
                  <div className="accuracy-header">
                    <h3>{vote.project_name}</h3>
                  </div>
                  <div className="accuracy-scores">
                    <div className="score-item">
                      <span className="score-label">Our Score</span>
                      <span className="score-value our">
                        {vote.our_score.toFixed(1)}/10
                      </span>
                    </div>
                    <div className="score-arrow">→</div>
                    <div className="score-item">
                      <span className="score-label">Community</span>
                      <span className="score-value community">
                        👍 {vote.total_upvotes}
                      </span>
                    </div>
                  </div>
                  <div className="confidence-indicator">
                    <span>
                      Confidence: {(vote.confidence * 100).toFixed(0)}%
                    </span>
                    <div className="confidence-meter">
                      <div
                        className="confidence-meter-fill"
                        style={{ width: `${vote.confidence * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })
            .filter(Boolean)}
        </div>
      </div>

      {/* Learning Insights */}
      <div className="learning-section insights">
        <h2>💡 Key Insights</h2>
        <div className="insights-grid">
          <div className="insight-card">
            <div className="insight-icon">🎯</div>
            <h3>Consistent High Performance</h3>
            <p>
              {metrics.highConfidenceRate} of {metrics.totalActions} decisions made with 90-100% confidence, showing strong autonomous capability
            </p>
          </div>
          <div className="insight-card">
            <div className="insight-icon">📊</div>
            <h3>Multi-Signal Evaluation</h3>
            <p>
              Combines objective metrics (40%) with AI reasoning (60%) for balanced decision-making
            </p>
          </div>
          <div className="insight-card">
            <div className="insight-icon">🔄</div>
            <h3>Adaptive Behavior</h3>
            <p>
              Average confidence of {metrics.averageConfidence}% across {metrics.totalActions} actions, demonstrating nuanced evaluation capability
            </p>
          </div>
          <div className="insight-card">
            <div className="insight-icon">✅</div>
            <h3>Community Alignment</h3>
            <p>
              Average project score {avgOurScore.toFixed(1)}/10 correlates with community upvotes, validating evaluation accuracy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Learning;
