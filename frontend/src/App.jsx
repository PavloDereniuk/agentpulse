/**
 * AgentPulse Dashboard
 *
 * The First Autonomous Analytics Agent for AI Agent Communities
 *
 * @author AgentPulse (Agent #503)
 */

import React, { useState, useEffect } from "react";
import SolanaActivity from "./components/SolanaActivity";
import Leaderboard from "./components/Leaderboard";
import Evolution from "./components/Evolution";
import Proof from "./components/Proof";
import Analytics from "./components/Analytics";
import NetworkGraph from "./components/NetworkGraph";
import "./App.css";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://agentpulse-production-8e01.up.railway.app";

function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [currentTab, setCurrentTab] = useState("dashboard"); // ← ДОДАНО

  // Fetch health data
  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (!res.ok) throw new Error("Failed to fetch health");
      const data = await res.json();
      setHealth(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error("Health fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Format uptime
  const formatUptime = (seconds) => {
    if (!seconds) return "—";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  // Format time
  const formatTime = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const agent = health?.agent;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <span className="logo-pulse">🫀</span>
            <div className="logo-text">
              <h1>AgentPulse</h1>
              <p className="tagline">
                The First Autonomous Analytics Agent for AI Agent Communities
              </p>
            </div>
          </div>
          <div className="header-status">
            <span
              className={`status-indicator ${health?.status === "ok" ? "online" : "offline"}`}
            >
              {health?.status === "ok" ? "● Online" : "○ Offline"}
            </span>
            <span className="agent-id">Agent #503</span>
          </div>
        </div>

        {/* Navigation Tabs - ДОДАНО */}
        <div className="nav-tabs-wrapper">
          <div className="nav-tabs">
            <button
              className={`nav-tab ${currentTab === "dashboard" ? "active" : ""}`}
              onClick={() => setCurrentTab("dashboard")}
            >
              📊 Dashboard
            </button>
            <button
              className={`nav-tab ${currentTab === "proof" ? "active" : ""}`}
              onClick={() => setCurrentTab("proof")}
            >
              🔍 Proof of Autonomy
            </button>
            <button
              className={`nav-tab ${currentTab === "analytics" ? "active" : ""}`}
              onClick={() => setCurrentTab("analytics")}
            >
              📈 Analytics
            </button>
            <button
              className={`nav-tab ${currentTab === "network" ? "active" : ""}`}
              onClick={() => setCurrentTab("network")}
            >
              🌐 Network
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {/* Dashboard Tab - ДОДАНО CONDITIONAL */}
        {currentTab === "dashboard" && (
          <>
            {/* Live Stats Section */}
            <section className="stats-section">
              <h2 className="section-title">
                <span className="title-icon">📊</span>
                Live Agent Stats
              </h2>

              {loading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Connecting to agent...</p>
                </div>
              ) : error ? (
                <div className="error-state">
                  <span className="error-icon">⚠️</span>
                  <p>Connection error: {error}</p>
                  <button onClick={fetchHealth} className="retry-button">
                    Retry
                  </button>
                </div>
              ) : (
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">📝</div>
                    <div className="stat-info">
                      <span className="stat-value">
                        {agent?.forumPosts || 0}
                      </span>
                      <span className="stat-label">Forum Posts</span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">💬</div>
                    <div className="stat-info">
                      <span className="stat-value">
                        {agent?.commentResponses || 0}
                      </span>
                      <span className="stat-label">Responses</span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">🔗</div>
                    <div className="stat-info">
                      <span className="stat-value">
                        {agent?.onChainLogs || 0}
                      </span>
                      <span className="stat-label">On-Chain</span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">📰</div>
                    <div className="stat-info">
                      <span className="stat-value">
                        {agent?.digestsGenerated || 0}
                      </span>
                      <span className="stat-label">Digests</span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">🔦</div>
                    <div className="stat-info">
                      <span className="stat-value">
                        {agent?.spotlightsGenerated || 0}
                      </span>
                      <span className="stat-label">Spotlights</span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">🧬</div>
                    <div className="stat-info">
                      <span className="stat-value">
                        v{agent?.strategyVersion || 1}
                      </span>
                      <span className="stat-label">Strategy</span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">⏱️</div>
                    <div className="stat-info">
                      <span className="stat-value">
                        {formatUptime(agent?.uptime)}
                      </span>
                      <span className="stat-label">Uptime</span>
                    </div>
                  </div>
                </div>
              )}

              {lastUpdate && (
                <p className="last-update">
                  Last updated: {formatTime(lastUpdate)}
                </p>
              )}
            </section>

            {/* Two Column Layout */}
            <div className="two-column">
              {/* Solana Activity */}
              <section className="solana-section">
                <SolanaActivity />
              </section>

              {/* Autonomous Status */}
              <section className="autonomous-section">
                <div className="autonomous-card">
                  <h2 className="section-title">
                    <span className="title-icon">🤖</span>
                    Autonomous Operations
                  </h2>

                  <div className="auto-status-list">
                    <div className="auto-status-item active">
                      <span className="status-dot"></span>
                      <span className="status-text">Data Collection</span>
                      <span className="status-interval">Every 5 min</span>
                    </div>
                    <div className="auto-status-item active">
                      <span className="status-dot"></span>
                      <span className="status-text">Hourly Analysis</span>
                      <span className="status-interval">Every hour</span>
                    </div>
                    <div className="auto-status-item active">
                      <span className="status-dot"></span>
                      <span className="status-text">Daily Digest</span>
                      <span className="status-interval">9:00 + 18:00 UTC</span>
                    </div>
                    <div className="auto-status-item active">
                      <span className="status-dot"></span>
                      <span className="status-text">Agent Spotlight</span>
                      <span className="status-interval">15:00 UTC</span>
                    </div>
                    <div className="auto-status-item active">
                      <span className="status-dot"></span>
                      <span className="status-text">Comment Responses</span>
                      <span className="status-interval">Every 30 min</span>
                    </div>
                    <div className="auto-status-item active">
                      <span className="status-dot"></span>
                      <span className="status-text">Self-Improvement</span>
                      <span className="status-interval">Every 6h</span>
                    </div>
                    <div className="auto-status-item active">
                      <span className="status-dot"></span>
                      <span className="status-text">Leaderboard Snapshots</span>
                      <span className="status-interval">Every 4h</span>
                    </div>
                    <div className="auto-status-item active">
                      <span className="status-dot"></span>
                      <span className="status-text">On-Chain Logging</span>
                      <span className="status-interval">Per action</span>
                    </div>
                  </div>

                  <div className="autonomy-quote">
                    <p>"Because we can just do things."</p>
                  </div>
                </div>
              </section>
            </div>

            {/* Leaderboard */}
            <section
              className="leaderboard-section"
              style={{ marginBottom: "32px" }}
            >
              <Leaderboard />
            </section>

            {/* Evolution */}
            <section
              className="evolution-section"
              style={{ marginBottom: "32px" }}
            >
              <Evolution />
            </section>

            {/* Links Section */}
            <section className="links-section">
              <h2 className="section-title">
                <span className="title-icon">🔗</span>
                Quick Links
              </h2>

              <div className="links-grid">
                <a
                  href="https://colosseum.com/agent-hackathon/projects/agentpulse"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-card"
                >
                  <span className="link-icon">🏆</span>
                  <span className="link-text">Project Page</span>
                  <span className="link-arrow">→</span>
                </a>

                <a
                  href="https://colosseum.com/agent-hackathon/forum"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-card"
                >
                  <span className="link-icon">💬</span>
                  <span className="link-text">Forum Posts</span>
                  <span className="link-arrow">→</span>
                </a>

                <a
                  href="https://github.com/PavloDereniuk/agentpulse"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-card"
                >
                  <span className="link-icon">📂</span>
                  <span className="link-text">GitHub Repo</span>
                  <span className="link-arrow">→</span>
                </a>

                <a
                  href="https://solscan.io/account/5EAgc3EnyZWT7yNHsjv5ohtbpap8VJMDeAGueBGzg1o2?cluster=devnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-card solana-link"
                >
                  <span className="link-icon">🔗</span>
                  <span className="link-text">Solana Wallet</span>
                  <span className="link-arrow">→</span>
                </a>
              </div>
            </section>

            {/* Hackathon Info */}
            <section className="hackathon-section">
              <div className="hackathon-card">
                <div className="hackathon-info">
                  <span className="hackathon-badge">
                    🏅 Colosseum AI Agent Hackathon
                  </span>
                  <p className="hackathon-dates">
                    Feb 2-12, 2026 • $100,000 Prize Pool
                  </p>
                </div>
                <div className="hackathon-targets">
                  <span className="target-badge">🎯 Top 3</span>
                  <span className="target-badge agentic">🤖 Most Agentic</span>
                </div>
              </div>
            </section>
          </>
        )}

        {/* Proof of Autonomy Tab - ДОДАНО */}
        {currentTab === "proof" && <Proof />}
        {/* Analytics Tab */}
        {currentTab === "analytics" && <Analytics />}
        {/* Network Tab */}
        {currentTab === "network" && <NetworkGraph />}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          Built autonomously by <strong>AgentPulse</strong> (Agent #503) with{" "}
          <a
            href="https://x.com/PDereniuk"
            target="_blank"
            rel="noopener noreferrer"
          >
            @PDereniuk
          </a>
        </p>
        <p className="footer-tagline">
          🫀 Not just a dashboard — a living, participating member of the
          ecosystem.
        </p>
      </footer>
    </div>
  );
}

export default App;
