/**
 * SolanaActivity Component
 * 
 * Displays on-chain activity and proof of autonomous operations
 * 
 * @author AgentPulse (Agent #503)
 */

import React, { useState, useEffect } from 'react';
import './SolanaActivity.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://agentpulse-production-8e01.up.railway.app';

function SolanaActivity() {
  const [solanaStatus, setSolanaStatus] = useState(null);
  const [agentWallet, setAgentWallet] = useState(null);
  const [onChainData, setOnChainData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Fetch Solana data
  const fetchSolanaData = async () => {
    try {
      const [statusRes, walletRes, logsRes] = await Promise.all([
        fetch(`${API_BASE}/api/solana/status`),
        fetch(`${API_BASE}/api/solana/agent-wallet`),
        fetch(`${API_BASE}/api/solana/on-chain-logs`)
      ]);

      if (!statusRes.ok || !walletRes.ok) {
        throw new Error('Failed to fetch Solana data');
      }

      const statusData = await statusRes.json();
      const walletData = await walletRes.json();
      const logsData = logsRes.ok ? await logsRes.json() : null;

      setSolanaStatus(statusData);
      setAgentWallet(walletData);
      setOnChainData(logsData);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('Solana fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchSolanaData();
    const interval = setInterval(fetchSolanaData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Format SOL amount
  const formatSol = (sol) => {
    if (sol === undefined || sol === null) return '—';
    return `${parseFloat(sol).toFixed(4)} SOL`;
  };

  // Shorten address/signature for display
  const shortenHash = (hash, chars = 8) => {
    if (!hash) return '—';
    return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  if (loading) {
    return (
      <div className="solana-activity">
        <div className="solana-header">
          <span className="solana-icon">🔗</span>
          <h3>Solana On-Chain Proof</h3>
        </div>
        <div className="solana-loading">
          <div className="loading-spinner"></div>
          <p>Connecting to Solana...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="solana-activity solana-error-state">
        <div className="solana-header">
          <span className="solana-icon">🔗</span>
          <h3>Solana On-Chain Proof</h3>
        </div>
        <div className="solana-error">
          <span className="error-icon">⚠️</span>
          <p>Failed to connect: {error}</p>
          <button onClick={fetchSolanaData} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const networkStatus = solanaStatus?.network;
  const stats = solanaStatus?.stats;
  const wallet = agentWallet;

  return (
    <div className="solana-activity">
      {/* Header */}
      <div className="solana-header">
        <div className="header-left">
          <span className="solana-icon pulse">🔗</span>
          <h3>Solana On-Chain Proof</h3>
        </div>
        <div className="header-right">
          <span className={`network-badge ${networkStatus?.health === 'ok' ? 'healthy' : 'warning'}`}>
            {networkStatus?.network || 'devnet'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="solana-stats-grid">
        {/* Wallet Balance */}
        <div className="stat-card wallet-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <span className="stat-value">{formatSol(wallet?.balance?.sol)}</span>
            <span className="stat-label">Agent Wallet</span>
          </div>
        </div>

        {/* Verified Transactions - from DB */}
        <div className="stat-card logs-card">
          <div className="stat-icon">🔗</div>
          <div className="stat-content">
            <span className="stat-value">{onChainData?.totalOnChain || stats?.totalMemoLogs || 0}</span>
            <span className="stat-label">Verified Txs</span>
          </div>
        </div>

        {/* Votes with on-chain proof */}
        <div className="stat-card slot-card">
          <div className="stat-icon">🗳️</div>
          <div className="stat-content">
            <span className="stat-value">{onChainData?.votesOnChain || 0}</span>
            <span className="stat-label">Votes On-Chain</span>
          </div>
        </div>

        {/* Action Types logged */}
        <div className="stat-card reads-card">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <span className="stat-value">{onChainData?.actionTypeCount || 0}</span>
            <span className="stat-label">Action Types</span>
          </div>
        </div>
      </div>

      {/* Agent Wallet Info */}
      {wallet?.configured && (
        <div className="wallet-section">
          <div className="wallet-address">
            <span className="address-label">Agent Wallet:</span>
            <a 
              href={wallet.explorerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="address-link"
            >
              {shortenHash(wallet.address, 10)}
              <span className="external-icon">↗</span>
            </a>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      {wallet?.recentTransactions?.length > 0 && (
        <div className="transactions-section">
          <h4 className="section-title">Recent On-Chain Actions</h4>
          <div className="transactions-list">
            {wallet.recentTransactions.slice(0, 5).map((tx, index) => (
              <div key={tx.signature} className="transaction-item">
                <div className="tx-status">
                  <span className={`status-dot ${tx.error ? 'failed' : 'success'}`}></span>
                </div>
                <div className="tx-details">
                  <a 
                    href={`https://solscan.io/tx/${tx.signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tx-signature"
                  >
                    {shortenHash(tx.signature, 12)}
                  </a>
                  <span className="tx-time">{formatTime(tx.timestamp)}</span>
                </div>
                <div className="tx-slot">
                  Slot {tx.slot?.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification Badge */}
      <div className="verification-section">
        <div className="verification-badge">
          <span className="verify-icon">✓</span>
          <span className="verify-text">
            All autonomous actions are verifiable on-chain
          </span>
        </div>
        {lastUpdate && (
          <span className="last-update">
            Updated {formatTime(lastUpdate)}
          </span>
        )}
      </div>

      {/* View All Link */}
      {wallet?.explorerUrl && (
        <a 
          href={wallet.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="view-all-link"
        >
          View all transactions on Solscan →
        </a>
      )}
    </div>
  );
}

export default SolanaActivity;
