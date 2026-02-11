/**
 * Evolution Component
 * 
 * Shows the agent's self-improvement journey —
 * current strategy, adaptation history, and performance metrics.
 * 
 * "Not just autonomous — self-evolving."
 * 
 * @author AgentPulse (Agent #503)
 */

import React, { useState, useEffect } from 'react';
import './Evolution.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://agentpulse-production-8e01.up.railway.app';

function Evolution() {
  const [evolution, setEvolution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const fetchEvolution = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/evolution`);
      if (!res.ok) throw new Error('Failed to fetch evolution data');
      const data = await res.json();
      setEvolution(data);
      setError(null);
    } catch (err) {
      console.error('Evolution error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvolution();
    const interval = setInterval(fetchEvolution, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, []);

  const strategy = evolution?.strategy;
  const history = evolution?.history || [];

  const formatTime = (dateStr) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });
  };

  const getToneEmoji = (tone) => {
    switch (tone) {
      case 'enthusiastic': return '🔥';
      case 'analytical': return '📊';
      case 'balanced': return '⚖️';
      default: return '🤖';
    }
  };

  const getFocusEmoji = (focus) => {
    switch (focus) {
      case 'trends': return '📈';
      case 'predictions': return '🔮';
      case 'community': return '👥';
      case 'technical': return '⚙️';
      default: return '🎯';
    }
  };

  return (
    <div className="evolution-component">
      <h2 className="section-title">
        <span className="title-icon">🧬</span>
        Self-Evolution
        {strategy && (
          <span className="evo-version-badge">v{strategy.version}</span>
        )}
      </h2>

      {loading ? (
        <div className="evo-loading">
          <div className="spinner"></div>
          <p>Loading evolution data...</p>
        </div>
      ) : error ? (
        <div className="evo-error">
          <p>⚠️ {error}</p>
          <button onClick={fetchEvolution} className="retry-button">Retry</button>
        </div>
      ) : (
        <>
          {/* Current Strategy */}
          <div className="evo-strategy">
            <h3 className="evo-subtitle">Current Strategy</h3>
            <div className="evo-params">
              <div className="evo-param">
                <span className="evo-param-icon">{getToneEmoji(strategy?.postingTone)}</span>
                <div className="evo-param-info">
                  <span className="evo-param-label">Tone</span>
                  <span className="evo-param-value">{strategy?.postingTone || 'N/A'}</span>
                </div>
              </div>
              <div className="evo-param">
                <span className="evo-param-icon">{getFocusEmoji(strategy?.insightFocus)}</span>
                <div className="evo-param-info">
                  <span className="evo-param-label">Focus</span>
                  <span className="evo-param-value">{strategy?.insightFocus || 'N/A'}</span>
                </div>
              </div>
              <div className="evo-param">
                <span className="evo-param-icon">⚡</span>
                <div className="evo-param-info">
                  <span className="evo-param-label">Quality Min</span>
                  <span className="evo-param-value">{strategy?.minQualityScore || 0}/8</span>
                </div>
              </div>
              <div className="evo-param">
                <span className="evo-param-icon">📝</span>
                <div className="evo-param-info">
                  <span className="evo-param-label">Max Posts/Day</span>
                  <span className="evo-param-value">{strategy?.maxDailyPosts || 0}</span>
                </div>
              </div>
              <div className="evo-param">
                <span className="evo-param-icon">🕐</span>
                <div className="evo-param-info">
                  <span className="evo-param-label">Optimal Hour</span>
                  <span className="evo-param-value">{strategy?.optimalPostHour || 0}:00 UTC</span>
                </div>
              </div>
              <div className="evo-param">
                <span className="evo-param-icon">🔄</span>
                <div className="evo-param-info">
                  <span className="evo-param-label">Last Adapted</span>
                  <span className="evo-param-value">{formatTime(strategy?.lastAdapted)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Adaptation History */}
          <div className="evo-history">
            <h3 className="evo-subtitle">
              Adaptation History
              {history.length > 0 && (
                <span className="evo-history-count">{history.length} total</span>
              )}
            </h3>
            {history.length === 0 ? (
              <p className="evo-no-history">No adaptations recorded yet. The agent will self-improve every 6 hours.</p>
            ) : (
              <>
                <div className="evo-timeline">
                  {history.slice(0, showAllHistory ? 10 : 3).map((record, i) => (
                    <div key={record.id || i} className="evo-record">
                      <div className="evo-record-header">
                        <span className="evo-record-version">v{record.strategy_version}</span>
                        <span className="evo-record-score">
                          Score: {record.performance_score}/10
                        </span>
                        {record.analysis?.trendDirection && (
                          <span className={`evo-trend evo-trend-${record.analysis.trendDirection}`}>
                            {record.analysis.trendDirection === 'improving' ? '📈' : 
                             record.analysis.trendDirection === 'declining' ? '📉' : '➡️'}
                            {record.analysis.trendDirection}
                          </span>
                        )}
                        <span className="evo-record-time">
                          {formatTime(record.created_at)}
                        </span>
                      </div>
                      {record.analysis?.summary && (
                        <p className="evo-record-summary">{record.analysis.summary}</p>
                      )}
                      {record.adaptations?.length > 0 && (
                        <div className="evo-record-changes">
                          {record.adaptations.map((a, j) => (
                            <span key={j} className="evo-change">
                              {a.parameter}: <span className="evo-old">{String(a.oldValue)}</span> → <span className="evo-new">{String(a.newValue)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {history.length > 3 && (
                  <button 
                    className="evo-show-more"
                    onClick={() => setShowAllHistory(!showAllHistory)}
                  >
                    {showAllHistory ? 'Show less' : `Show all ${history.length} adaptations`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* DNA Quote */}
          <div className="evo-quote">
            <p>"Not just autonomous — self-evolving."</p>
          </div>
        </>
      )}
    </div>
  );
}

export default Evolution;
