/**
 * Mock Reputation Service
 * Simulates on-chain reputation data for demo purposes
 * 
 * NOTE: This is temporary mock data. Real implementation uses Anchor program.
 * See /solana-program/agent-reputation/ for production code.
 */

class MockReputationService {
  constructor() {
    // Mock reputation data for Agent #503
    this.reputation = {
      agentId: 503,
      
      // Analysis scores (0-10 scale)
      qualityScore: 8.4,
      engagementScore: 10.0,
      
      // Protocol expertise scores (0-10 scale)
      jupiterScore: 8.5,   // 50+ swaps, $12K volume
      pythScore: 9.0,      // 3 price feeds integrated
      defiScore: 7.5,      // Active in Kamino
      nftScore: 6.0,       // Moderate Metaplex usage
      composabilityScore: 9.5, // Uses 5 protocols
      
      // Overall weighted score
      overallReputation: 8.9,
      
      // Stats
      totalProtocolsUsed: 5,
      totalTransactions: 127,
      
      // Achievement badges
      badgesEarned: [
        { type: 'Forum Legend', earnedAt: '2026-02-05T10:00:00Z' },
        { type: 'DeFi Degen', earnedAt: '2026-02-07T14:30:00Z' },
        { type: 'Composability King', earnedAt: '2026-02-08T16:45:00Z' },
        { type: 'Early Adopter', earnedAt: '2026-02-04T08:00:00Z' }
      ],
      
      // Timestamps
      createdAt: '2026-02-04T08:00:00Z',
      lastUpdated: '2026-02-10T17:00:00Z'
    };
    
    // Mock protocol activity data
    this.protocolActivities = [
      {
        protocol: 'Jupiter',
        count: 52,
        volume: 12450, // USD
        firstUsed: '2026-02-05T09:00:00Z',
        lastUsed: '2026-02-10T15:30:00Z',
        description: 'DEX aggregator for token swaps'
      },
      {
        protocol: 'Pyth',
        count: 15,
        volume: 0,
        firstUsed: '2026-02-06T11:00:00Z',
        lastUsed: '2026-02-10T14:00:00Z',
        description: 'Oracle network for price feeds'
      },
      {
        protocol: 'Kamino',
        count: 28,
        volume: 8320,
        firstUsed: '2026-02-06T13:00:00Z',
        lastUsed: '2026-02-10T16:00:00Z',
        description: 'Automated liquidity management'
      },
      {
        protocol: 'Marinade',
        count: 18,
        volume: 5670,
        firstUsed: '2026-02-07T10:00:00Z',
        lastUsed: '2026-02-09T12:00:00Z',
        description: 'Liquid staking protocol'
      },
      {
        protocol: 'Metaplex',
        count: 14,
        volume: 0,
        firstUsed: '2026-02-08T09:00:00Z',
        lastUsed: '2026-02-10T11:00:00Z',
        description: 'NFT standard and marketplace'
      }
    ];
  }
  
  /**
   * Get agent reputation
   */
  getReputation(agentId) {
    if (agentId !== 503) {
      return null;
    }
    return this.reputation;
  }
  
  /**
   * Get protocol activities
   */
  getProtocolActivities(agentId) {
    if (agentId !== 503) {
      return [];
    }
    return this.protocolActivities;
  }
  
  /**
   * Get ecosystem protocol stats
   */
  getProtocolStats() {
    return {
      totalAgents: 1, // Only Agent #503 in demo
      protocolAdoption: {
        Jupiter: 1,
        Pyth: 1,
        Kamino: 1,
        Marinade: 1,
        Metaplex: 1
      },
      totalVolume: {
        Jupiter: 12450,
        Pyth: 0,
        Kamino: 8320,
        Marinade: 5670,
        Metaplex: 0
      },
      totalTransactions: {
        Jupiter: 52,
        Pyth: 15,
        Kamino: 28,
        Marinade: 18,
        Metaplex: 14
      }
    };
  }
  
  /**
   * Calculate score breakdown
   */
  getScoreBreakdown(agentId) {
    if (agentId !== 503) {
      return null;
    }
    
    const { qualityScore, engagementScore, jupiterScore, pythScore, defiScore, nftScore, composabilityScore } = this.reputation;
    
    // Protocol average
    const protocolAvg = (jupiterScore + pythScore + defiScore + nftScore + composabilityScore) / 5;
    
    return {
      quality: {
        score: qualityScore,
        weight: 30,
        contribution: (qualityScore * 0.3).toFixed(2)
      },
      engagement: {
        score: engagementScore,
        weight: 30,
        contribution: (engagementScore * 0.3).toFixed(2)
      },
      protocolExpertise: {
        score: protocolAvg.toFixed(1),
        weight: 40,
        contribution: (protocolAvg * 0.4).toFixed(2),
        breakdown: {
          Jupiter: jupiterScore,
          Pyth: pythScore,
          DeFi: defiScore,
          NFT: nftScore,
          Composability: composabilityScore
        }
      },
      overall: this.reputation.overallReputation
    };
  }
}

export default new MockReputationService();