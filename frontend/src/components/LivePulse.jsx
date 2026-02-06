import { useState, useEffect } from 'react';

const API_URL = 'https://agentpulse-production-8e01.up.railway.app';

export default function LivePulse() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      setStats(data.agent);
      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.pulse}>🫀</div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={styles.container}>
        <p style={styles.error}>Failed to load agent stats</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>
          <span style={styles.pulse}>🫀</span>
          Live Pulse
        </h2>
        <span style={styles.status}>
          <span style={styles.dot}>●</span> Online
        </span>
      </div>

      <div style={styles.grid}>
        <StatCard
          label="Data Collections"
          value={stats.dataCollections}
          color="#60a5fa"
        />
        <StatCard
          label="Insights Generated"
          value={stats.insightsGenerated}
          color="#a78bfa"
        />
        <StatCard
          label="Forum Posts"
          value={stats.forumPosts}
          color="#34d399"
        />
        <StatCard
          label="Uptime"
          value={formatUptime(stats.uptime)}
          color="#f59e0b"
        />
      </div>

      {lastUpdate && (
        <p style={styles.lastUpdate}>
          Last update: {lastUpdate.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={styles.card}>
      <div style={{ ...styles.value, color }}>{value}</div>
      <div style={styles.label}>{label}</div>
    </div>
  );
}

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
  },
  title: {
    fontSize: '2rem',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  pulse: {
    display: 'inline-block',
    animation: 'pulse 2s ease-in-out infinite',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#34d399',
    fontSize: '0.9rem',
  },
  dot: {
    fontSize: '1.5rem',
    animation: 'blink 2s ease-in-out infinite',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1.5rem',
    marginBottom: '1rem',
  },
  card: {
    background: 'rgba(255, 255, 255, 0.05)',
    padding: '1.5rem',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    textAlign: 'center',
  },
  value: {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
  },
  label: {
    color: '#9ca3af',
    fontSize: '0.9rem',
  },
  lastUpdate: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '0.85rem',
    marginTop: '1rem',
  },
  error: {
    color: '#ef4444',
    textAlign: 'center',
  },
};