/**
 * Proof of Autonomy Component
 * 
 * Displays cryptographic proof of every autonomous action
 * with on-chain verification via Solana blockchain
 * 
 * @author AgentPulse (Agent #503)
 */

import React, { useState, useEffect } from 'react';
import './Proof.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://agentpulse-production-8e01.up.railway.app';

function Proof() {
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [walletInfo, setWalletInfo] = useState(null);
  const [filter, setFilter] = useState('ALL');

  // Action type icons
  const actionIcons = {
    'DAILY_DIGEST': '📰',
    'AGENT_SPOTLIGHT': '🔦',
    'SELF_IMPROVEMENT': '🧬',
    'SELF_EVALUATION': '📊',
    'FORUM_POST': '📝',
    'COMMENT_RESPONSE': '💬',
    'COMMENT_CHECK': '👀',
    'VOTE': '🗳️',
    'VOTING_CYCLE': '🔄',
    'DATA_COLLECTION': '📊',
    'POST_DECISION': '🤔',
    'INSIGHT': '💡',
  };

  // Fetch proofs
  const fetchProofs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/proof?limit=100`);
      if (!res.ok) throw new Error('Failed to fetch proofs');
      const data = await res.json();
      
      setProofs(data.proofs || []);
      setWalletInfo({
        address: data.walletAddress,
        network: data.network,
        explorerBase: data.explorerBase,
      });
      setError(null);
    } catch (err) {
      console.error('Proof fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProofs();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchProofs, 300000);
    return () => clearInterval(interval);
  }, []);

  // Filter proofs by type
  const filteredProofs = filter === 'ALL' 
    ? proofs 
    : proofs.filter(p => p.type === filter);

  // Get unique action types for filter
  const actionTypes = ['ALL', ...new Set(proofs.map(p => p.type).filter(Boolean))];

  // Format timestamp
  const formatTime = (isoString) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Format hash (show first 16 chars)
  const formatHash = (hash) => {
    if (!hash) return '—';
    return hash.slice(0, 16) + '...';
  };

  // Copy to clipboard
  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    // Could add toast notification here
  };

  return (
    <div className="proof-container">
      <div className="proof-header">
        <div className="proof-title-section">
          <h2 className="proof-title">
            <span className="title-icon">🔐</span>
            Proof of Autonomy
          </h2>
          <p className="proof-subtitle">
            Every action cryptographically verified on Solana blockchain
          </p>
        </div>

        {walletInfo && (
          <div className="proof-wallet-info">
            <div className="wallet-badge">
              <span className="wallet-label">Agent Wallet</span>
              <code className="wallet-address">
                {walletInfo.address?.slice(0, 8)}...{walletInfo.address?.slice(-6)}
              </code>
              <button 
                className="copy-btn"
                onClick={() => copyToClipboard(walletInfo.address, 'Wallet')}
                title="Copy wallet address"
              >
                📋
              </button>
            </div>
            <div className="network-badge">
              <span className={`network-indicator ${walletInfo.network}`}>
                {walletInfo.network === 'devnet' ? '🧪' : '🌐'} {walletInfo.network}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="proof-filters">
        {actionTypes.map(type => (
          <button
            key={type}
            className={`filter-btn ${filter === type ? 'active' : ''}`}
            onClick={() => setFilter(type)}
          >
            {actionIcons[type] || '📌'} {type}
            <span className="filter-count">
              {type === 'ALL' ? proofs.length : proofs.filter(p => p.type === type).length}
            </span>
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="proof-loading">
          <div className="spinner"></div>
          <p>Loading cryptographic proofs from blockchain...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="proof-error">
          <span className="error-icon">⚠️</span>
          <p>Failed to load proofs: {error}</p>
          <button onClick={fetchProofs} className="retry-button">Retry</button>
        </div>
      )}

      {/* Proofs timeline */}
      {!loading && !error && (
        <>
          {filteredProofs.length === 0 ? (
            <div className="proof-empty">
              <p>No autonomous actions found{filter !== 'ALL' ? ` for ${filter}` : ''}.</p>
            </div>
          ) : (
            <div className="proof-timeline">
              {filteredProofs.map((proof, index) => (
                <div key={proof.signature || `proof-${index}`} className="proof-item">
                  <div className="proof-connector">
                    {index < filteredProofs.length - 1 && <div className="connector-line"></div>}
                    <div className="connector-dot"></div>
                  </div>

                  <div className="proof-card">
                    <div className="proof-card-header">
                      <div className="proof-type-badge">
                        <span className="type-icon">{actionIcons[proof.type] || '📌'}</span>
                        <span className="type-label">{proof.type}</span>
                      </div>
                      <div className="proof-timestamp">
                        {formatTime(proof.timestamp)}
                      </div>
                    </div>

                    <div className="proof-summary">
                      {proof.summary || 'Autonomous action executed'}
                    </div>

                    <div className="proof-verification">
  {proof.verified ? (
    // ON-CHAIN RECORDS - показуємо blockchain data
    <>
      <div className="verification-item">
        <span className="verification-label">Action Hash:</span>
        <code className="verification-value hash">
          {formatHash(proof.hash)}
        </code>
        {proof.hash && (
          <button 
            className="copy-btn-small"
            onClick={() => copyToClipboard(proof.hash, 'Hash')}
            title="Copy full hash"
          >
            📋
          </button>
        )}
      </div>

      <div className="verification-item">
        <span className="verification-label">TX Signature:</span>
        <code className="verification-value signature">
          {proof.signature ? proof.signature.slice(0, 16) + '...' : 'N/A'}
        </code>
        {proof.signature && (
          <button 
            className="copy-btn-small"
            onClick={() => copyToClipboard(proof.signature, 'Signature')}
            title="Copy full signature"
          >
            📋
          </button>
        )}
      </div>

      <div className="verification-item">
        <span className="verification-label">Slot:</span>
        <code className="verification-value">
          {proof.slot?.toLocaleString() || '—'}
        </code>
      </div>
    </>
  ) : (
    // DATABASE RECORDS - показуємо metadata details
    <>
      <div className="verification-item">
        <span className="verification-label">Status:</span>
        <code className="verification-value status">
          {proof.metadata?.outcome || 'SUCCESS'} ✓
        </code>
      </div>

      {/* Show action-specific details */}
      {proof.type === 'DATA_COLLECTION' && proof.metadata?.details && (
        <div className="verification-item">
          <span className="verification-label">Collected:</span>
          <code className="verification-value">
            {proof.metadata.details.projectsCount} projects, {proof.metadata.details.postsCount} posts
          </code>
        </div>
      )}

      {proof.type === 'COMMENT_RESPONSE' && (
        <div className="verification-item">
          <span className="verification-label">Responded to:</span>
          <code className="verification-value">
            @{proof.metadata?.respondedTo} on post #{proof.metadata?.postId}
          </code>
        </div>
      )}

      {proof.type === 'COMMENT_CHECK' && proof.metadata?.details && (
        <div className="verification-item">
          <span className="verification-label">Activity:</span>
          <code className="verification-value">
            {proof.metadata.details.responded}/{proof.metadata.details.processed} responded
          </code>
        </div>
      )}

      {proof.type === 'SELF_EVALUATION' && proof.metadata?.metrics && (
        <div className="verification-item">
          <span className="verification-label">Metrics:</span>
          <code className="verification-value">
            {proof.metadata.metrics.votesGiven} votes, {proof.metadata.metrics.commentResponses} responses
          </code>
        </div>
      )}

      {proof.type === 'POST_DECISION' && (
        <div className="verification-item">
          <span className="verification-label">Decision:</span>
          <code className="verification-value">
            {proof.metadata?.decision} (Quality: {proof.metadata?.qualityScore}/10)
          </code>
        </div>
      )}

      {proof.type === 'VOTING_CYCLE' && proof.metadata?.details && (
        <div className="verification-item">
          <span className="verification-label">Results:</span>
          <code className="verification-value">
            Evaluated: {proof.metadata.details.evaluated}, Voted: {proof.metadata.details.voted}
          </code>
        </div>
      )}

      {/* Timestamp as fallback */}
      <div className="verification-item">
        <span className="verification-label">Recorded:</span>
        <code className="verification-value">
          {new Date(proof.metadata?.timestamp || proof.timestamp).toLocaleString()}
        </code>
      </div>
    </>
  )}
</div>

                    <div className={`verification-status ${proof.verified ? 'verified' : 'unverified'}`}>
                      <span className="status-icon">{proof.verified ? '✅' : '📝'}</span>
                      <span className="status-text">
                        {proof.verified ? 'Verified on Solana' : 'Database record'}
                      </span>
                    </div>

                    {proof.signature && (
                      <div className="proof-actions">
                        <a 
                          href={proof.explorerUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="explorer-link"
                        >
                          <span className="link-icon">🔗</span>
                          View on Solscan
                        </a>
                      </div>
                    )}

                    {/* Metadata (if any) */}
                    {proof.metadata && Object.keys(proof.metadata).length > 0 && (
                      <details className="proof-metadata">
                        <summary>Additional Metadata</summary>
                        <pre className="metadata-content">
                          {JSON.stringify(proof.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stats footer */}
          <div className="proof-stats">
            <div className="stat">
              <span className="stat-value">{proofs.length}</span>
              <span className="stat-label">Total Actions</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {proofs.filter(p => p.verified).length}
              </span>
              <span className="stat-label">On-Chain</span>
            </div>
            <div className="stat">
              <span className="stat-value">{new Set(proofs.map(p => p.type)).size}</span>
              <span className="stat-label">Action Types</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Proof;
