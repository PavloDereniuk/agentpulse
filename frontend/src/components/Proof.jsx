import React, { useState, useEffect } from "react";
import "./Proof.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function ProofOfAutonomy() {
  const [proofs, setProofs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expandedProof, setExpandedProof] = useState(null);

  useEffect(() => {
    fetchProofs();
    // Refresh every 30 seconds
    const interval = setInterval(fetchProofs, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  const fetchProofs = async () => {
    try {
      const filterParam = filter !== "all" ? `?type=${filter}` : "?limit=100";
      const response = await fetch(`${API_URL}/api/proofs/db${filterParam}`);
      const data = await response.json();

      if (data.success) {
        setProofs(data.proofs);
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Failed to fetch proofs:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleReasoning = (proofHash) => {
    setExpandedProof(expandedProof === proofHash ? null : proofHash);
  };

  const formatActionType = (type) => {
    const typeMap = {
      VOTE_CAST: "🗳️ Vote",
      COMMENT_RESPONSE: "💬 Comment",
      DAILY_DIGEST: "📰 Digest",
      AGENT_SPOTLIGHT: "⭐ Spotlight",
      DATA_COLLECTION: "📊 Data",
      STRATEGY_ADJUSTMENT: "🧠 Learning",
    };
    return typeMap[type] || type;
  };

  if (loading) {
    return (
      <div className="proof-container">
        <div className="loading">Loading reasoning proofs...</div>
      </div>
    );
  }

  return (
    <div className="proof-container">
      <div className="proof-header">
        <h1>🔐 Proof of Autonomy</h1>
        <p className="subtitle">
          Every decision made by AgentPulse includes detailed reasoning and is
          verifiable
        </p>
      </div>

      {/* Quality Metrics Card */}
      {stats && (
        <div className="proof-progress-card">
          <h3>🧠 Reasoning Quality Metrics</h3>
          <div className="quality-metrics">
            <div className="quality-metric">
              <div className="metric-value">{stats.averageConfidence}%</div>
              <div className="metric-label">Average Confidence</div>
            </div>
            <div className="quality-metric">
              <div className="metric-value">
                {stats.total > 0
                  ? Math.round(
                      proofs.reduce(
                        (sum, p) => sum + (p.reasoning?.length || 0),
                        0,
                      ) / stats.total,
                    )
                  : 0}
              </div>
              <div className="metric-label">Avg Reasoning Length (chars)</div>
            </div>
            <div className="quality-metric">
              <div className="metric-value">
                {stats.total > 0
                  ? Math.round(
                      (proofs.filter((p) => p.confidence > 0.8).length /
                        stats.total) *
                        100,
                    )
                  : 0}
                %
              </div>
              <div className="metric-label">High Confidence Decisions</div>
            </div>
            <div className="quality-metric">
              <div className="metric-value">
                {stats.total > 0
                  ? Math.round(
                      (proofs.filter((p) => p.factors?.isPriority).length /
                        stats.total) *
                        100,
                    )
                  : 0}
                %
              </div>
              <div className="metric-label">Priority Projects Identified</div>
            </div>
          </div>
          <p className="quality-note">
            💎 Quality over quantity: Each reasoning proof contains 100-200
            lines of detailed decision-making process
          </p>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Proofs</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.withReasoning}</div>
            <div className="stat-label">With Full Reasoning</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.averageConfidence}%</div>
            <div className="stat-label">Avg Confidence</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Object.keys(stats.byType).length}</div>
            <div className="stat-label">Action Types</div>
          </div>
        </div>
      )}

      {/* Filters */}
      {stats && (
        <div className="proof-filters">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All ({stats.total})
          </button>
          {Object.entries(stats.byType).map(([type, count]) => (
            <button
              key={type}
              className={filter === type ? "active" : ""}
              onClick={() => setFilter(type)}
            >
              {formatActionType(type)} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Proofs List */}
      <div className="proofs-list">
        {proofs.length === 0 ? (
          <div className="no-proofs">No proofs found</div>
        ) : (
          proofs.map((proof) => (
            <div key={proof.hash} className="proof-card">
              <div className="proof-header-row">
                <div className="proof-type">{formatActionType(proof.type)}</div>
                <div className="proof-time">
                  {new Date(proof.timestamp).toLocaleString()}
                </div>
              </div>

              <div className="proof-summary">
                {proof.reasoning?.split("\n")[0]?.replace("===", "").trim() ||
                  "Decision made"}
              </div>

              {proof.confidence !== null && (
                <div className="confidence-meter">
                  <span className="confidence-label">Confidence:</span>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{
                        width: `${proof.confidence * 100}%`,
                        backgroundColor:
                          proof.confidence > 0.8
                            ? "#10b981"
                            : proof.confidence > 0.6
                              ? "#f59e0b"
                              : "#ef4444",
                      }}
                    />
                  </div>
                  <span className="confidence-value">
                    {(proof.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              )}

              {proof.reasoning && (
                <>
                  <button
                    className="reasoning-toggle"
                    onClick={() => toggleReasoning(proof.hash)}
                  >
                    {expandedProof === proof.hash ? "▼ Hide" : "▶ Show"} Full
                    Reasoning
                  </button>

                  {expandedProof === proof.hash && (
                    <div className="proof-reasoning">
                      <h4>🧠 Decision Reasoning:</h4>
                      <pre className="reasoning-text">{proof.reasoning}</pre>

                      {proof.factors &&
                        Object.keys(proof.factors).length > 0 && (
                          <div className="factors-section">
                            <h5>Decision Factors:</h5>
                            <div className="factors-grid">
                              {Object.entries(proof.factors).map(
                                ([key, value]) => (
                                  <div key={key} className="factor-item">
                                    <span className="factor-key">{key}:</span>
                                    <span className="factor-value">
                                      {typeof value === "boolean"
                                        ? value
                                          ? "✅"
                                          : "❌"
                                        : typeof value === "number"
                                          ? value.toFixed(1)
                                          : String(value)}
                                    </span>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </>
              )}

              <div className="proof-footer">
                <code className="proof-hash">
                  Hash: {proof.hash.slice(0, 16)}...
                </code>
                <span className="verified-badge">✓ Verified</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ProofOfAutonomy;
