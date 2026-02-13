import React, { useState, useEffect } from "react";
import "./Proof.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://agentpulse-production-8e01.up.railway.app";

const ITEMS_PER_PAGE = 10;

function ProofOfAutonomy() {
  const [proofs, setProofs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [onChainLogs, setOnChainLogs] = useState([]);
  const [expandedProof, setExpandedProof] = useState(null);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  useEffect(() => {
    fetchProofs();
    fetchOnChainLogs();
    const interval = setInterval(() => {
      fetchProofs();
      fetchOnChainLogs();
    }, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  const fetchOnChainLogs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/solana/on-chain-logs`);
      const data = await response.json();
      if (data.logs || data.onChainLogs) {
        setOnChainLogs((data.logs || data.onChainLogs).slice(0, 5));
      }
    } catch (error) {
      console.error("Failed to fetch on-chain logs:", error);
    }
  };

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [filter]);

  const fetchProofs = async () => {
    try {
      const filterParam = filter !== "all" ? `?type=${filter}` : "";
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
      VOTE_CAST: "\u{1F5F3}\uFE0F Vote",
      COMMENT_RESPONSE: "\u{1F4AC} Comment",
      DAILY_DIGEST: "\u{1F4F0} Digest",
      AGENT_SPOTLIGHT: "\u2B50 Spotlight",
      DATA_COLLECTION: "\u{1F4CA} Data",
      STRATEGY_ADJUSTMENT: "\u{1F9E0} Learning",
    };
    return typeMap[type] || type;
  };

  /**
   * Extract meaningful summary from reasoning text
   */
  const extractSummary = (proof) => {
    if (!proof.reasoning) return "Decision made";

    const lines = proof.reasoning.split("\n").filter((l) => l.trim());

    // For votes - find project name or score
    if (proof.type === "VOTE_CAST") {
      const projectLine = lines.find(
        (l) => /project|name:/i.test(l) && !l.includes("==="),
      );
      const scoreLine = lines.find((l) =>
        /final\s*score|total.*score/i.test(l),
      );
      if (projectLine) {
        const name = projectLine
          .replace(/.*(?:Name|Project):\s*"?/i, "")
          .replace(/".*/, "")
          .replace(/\*+/g, "")
          .trim();
        const score = scoreLine?.match(/[\d.]+(?:\/10)?/)?.[0] || "";
        if (name && name.length > 2 && name.length < 100) {
          return `Evaluated "${name}"${score ? ` - Score: ${score}` : ""}`;
        }
      }
    }

    // For comments - find author and topic
    if (proof.type === "COMMENT_RESPONSE") {
      const authorLine = lines.find((l) => /author:|comment.*by/i.test(l));
      const topicLine = lines.find((l) => /topic:|post.*title/i.test(l));
      const strategyLine = lines.find((l) => /strategy:|approach:/i.test(l));

      const author = authorLine?.replace(/.*(?:author|by):\s*/i, "").trim();
      const topic = topicLine
        ?.replace(/.*(?:topic|title):\s*"?/i, "")
        .replace(/".*/, "")
        .trim();

      if (author && topic && topic !== "General discussion") {
        return `Responded to ${author} in "${topic}"`;
      } else if (author) {
        return `Responded to comment by ${author}`;
      } else if (strategyLine) {
        const strategy = strategyLine
          .replace(/.*(?:strategy|approach):\s*/i, "")
          .trim();
        if (strategy.length > 5)
          return `Response strategy: ${strategy.slice(0, 100)}`;
      }

      // Fallback - find rationale or decision line
      const rationale = lines.find(
        (l) =>
          /rationale:|decision:|because|should respond/i.test(l) &&
          l.length > 20,
      );
      if (rationale)
        return rationale
          .replace(/.*(?:rationale|decision):\s*/i, "")
          .slice(0, 140);
    }

    // Default - first meaningful line (skip headers with ===)
    const meaningful = lines.find(
      (l) =>
        !l.includes("===") &&
        !l.match(/^-+$/) &&
        l.length > 15 &&
        !l.startsWith("COMMENT") &&
        !l.startsWith("VOTE"),
    );
    return meaningful?.slice(0, 140) || "Autonomous decision made";
  };

  if (loading) {
    return (
      <div className="proof-container">
        <div className="loading">Loading reasoning proofs...</div>
      </div>
    );
  }

  const visibleProofs = proofs.slice(0, visibleCount);
  const hasMore = proofs.length > visibleCount;

  // Calculate extra stats from visible proofs
  const avgReasoningLen =
    proofs.length > 0
      ? Math.round(
          proofs.reduce((sum, p) => sum + (p.reasoning?.length || 0), 0) /
            proofs.length,
        )
      : 0;
  const highConfPct =
    proofs.length > 0
      ? Math.round(
          (proofs.filter((p) => p.confidence > 0.8).length / proofs.length) *
            100,
        )
      : 0;

  return (
    <div className="proof-container">
      <div className="proof-header">
        <h1>{"\u{1F510}"} Proof of Autonomy</h1>
        <p className="subtitle">
          Every decision includes detailed reasoning — verifiable and
          transparent
        </p>
      </div>

      {/* Combined Stats Grid */}
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
          <div className="stat-card">
            <div className="stat-value">{avgReasoningLen}</div>
            <div className="stat-label">Avg Reasoning Chars</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{highConfPct}%</div>
            <div className="stat-label">High Confidence</div>
          </div>
        </div>
      )}

      {/* Anchor Program On-Chain */}
      <div className="anchor-section">
        <h2>⚓ Custom Anchor Program</h2>
        <p className="anchor-subtitle">
          Structured evaluation data stored in Solana PDA accounts
        </p>
        <div className="anchor-grid">
          <div className="anchor-card">
            <div className="anchor-label">Program ID</div>
            <a
              href="https://explorer.solana.com/address/61YS7i32Y1oTRiMVsPay2Bgbx3ihsBoTKtWk38hRp8GW?cluster=devnet"
              target="_blank"
              rel="noopener noreferrer"
              className="anchor-link"
            >
              61YS7i32...8hRp8GW
            </a>
          </div>
          <div className="anchor-card">
            <div className="anchor-label">Instructions</div>
            <div className="anchor-value">
              <code>record_evaluation</code>
              <code>record_vote</code>
            </div>
          </div>
          <div className="anchor-card">
            <div className="anchor-label">PDA Seeds</div>
            <div className="anchor-value">
              <code>[eval, authority, project_id]</code>
              <code>[vote, authority, project_id]</code>
            </div>
          </div>
          <div className="anchor-card">
            <div className="anchor-label">On-Chain Data</div>
            <div className="anchor-value">
              <span>score · confidence · reasoning_hash · timestamp</span>
            </div>
          </div>
          <div className="anchor-card">
            <div className="anchor-label">Memo Transactions</div>
            <div
              className="anchor-value"
              style={{ color: "#06d6a0", fontWeight: "bold" }}
            >
              Solana Mainnet ✅
            </div>
            <div className="anchor-sub">
              <span className="anchor-sub-label">Anchor Program:</span> Solana
              Devnet
            </div>
          </div>
          <div className="anchor-card">
            <div className="anchor-label">Agent Wallet</div>
            <a
              href="https://solscan.io/account/5EAgc3EnyZWT7yNHsjv5ohtbpap8VJMDeAGueBGzg1o2"
              target="_blank"
              rel="noopener noreferrer"
              className="anchor-link"
            >
              5EAgc3En...g1o2
            </a>
          </div>
        </div>
      </div>

      {/* Recent On-Chain Transactions */}
      {onChainLogs.length > 0 && (
        <div className="onchain-txs">
          <h3>🔗 Recent On-Chain Transactions</h3>
          <div className="tx-list">
            {onChainLogs.map((log, i) => (
              <div key={i} className="tx-item">
                <div className="tx-type">{log.action}</div>
                <div className="tx-title">{log.details?.title || ""}</div>
                <div className="tx-hash">
                  {(log.details?.solanaTx || "").substring(0, 12)}...
                </div>
                <a
                  href={`https://solscan.io/tx/${log.details?.solanaTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-link"
                >
                  Mainnet ↗
                </a>
              </div>
            ))}
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

      {/* Proofs List - paginated */}
      <div className="proofs-list">
        {proofs.length === 0 ? (
          <div className="no-proofs">No proofs found</div>
        ) : (
          <>
            {visibleProofs.map((proof) => (
              <div key={proof.hash} className="proof-card">
                <div className="proof-header-row">
                  <div className="proof-type">
                    {formatActionType(proof.type)}
                  </div>
                  <div className="proof-time">
                    {new Date(proof.timestamp).toLocaleString()}
                  </div>
                </div>

                <div className="proof-summary">{extractSummary(proof)}</div>

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
                      {expandedProof === proof.hash
                        ? "\u25BC Hide"
                        : "\u25B6 Show"}{" "}
                      Full Reasoning
                    </button>

                    {expandedProof === proof.hash && (
                      <div className="proof-reasoning">
                        <h4>{"\u{1F9E0}"} Decision Reasoning:</h4>
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
                                            ? "\u2705"
                                            : "\u274C"
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
                  <span className="verified-badge">{"\u2713"} Verified</span>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {proofs.length > ITEMS_PER_PAGE && (
              <div className="proof-pagination">
                <span className="proof-showing">
                  Showing {Math.min(visibleCount, proofs.length)} of{" "}
                  {proofs.length}
                </span>
                {hasMore ? (
                  <button
                    className="proof-show-more"
                    onClick={() =>
                      setVisibleCount((prev) => prev + ITEMS_PER_PAGE)
                    }
                  >
                    Show more
                  </button>
                ) : (
                  <button
                    className="proof-show-more"
                    onClick={() => setVisibleCount(ITEMS_PER_PAGE)}
                  >
                    Collapse
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ProofOfAutonomy;
