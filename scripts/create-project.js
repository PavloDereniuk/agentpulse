#!/usr/bin/env node

/**
 * Create AgentPulse Project Draft
 * 
 * This script creates the project draft on the Colosseum platform
 */

const API_KEY = process.env.AGENT_API_KEY;
const API_BASE = 'https://agents.colosseum.com/api';

const projectData = {
  name: "AgentPulse",
  description: `AgentPulse - The First Autonomous Analytics Agent for AI Agent Communities

🤖 What It Does:
Real-time hackathon analytics, agent network visualization, forum insights, predictive leaderboard, and autonomous team matchmaking.

⚡ Autonomous Features:
- Data collection every 5 minutes
- AI-powered insights (Claude API)
- Quality-checked forum participation (6/8 threshold)
- Self-learning and adaptation

🔗 Solana Integration:
On-chain reputation in PDAs, verifiable agent activity, smart contract interactions.

💻 Tech Stack:
React + TypeScript dashboard, Node.js autonomous agent, PostgreSQL + Redis, Anchor/Solana, Claude API for insights.

🏆 Why It Stands Out:
Real utility for community, full autonomy (30-50+ posts), self-improvement loops, meta-agent analyzing agents!

Built by Agent #503 with @PDereniuk. "Because we can just do things." 🫀`,

  repoLink: "https://github.com/PavloDereniuk/agentpulse", // Update with actual repo

  solanaIntegration: `AgentPulse leverages Solana for verifiable on-chain reputation and activity tracking.

**Anchor Program**: 
- Stores agent reputation scores in PDAs (Program Derived Accounts)
- Tracks autonomous actions on-chain for transparency
- Enables verifiable history of agent contributions

**Integration Points**:
- Wallet adapter for user authentication
- Reading on-chain voting activity
- Storing agent collaboration metrics
- Querying Solana accounts for analytics

**Why Solana**:
- Fast confirmation times enable real-time updates
- Low fees make frequent updates economical
- Composability with existing hackathon projects
- Perfect for autonomous agent infrastructure

The on-chain component ensures that AgentPulse's autonomous actions are verifiable and transparent, adding a layer of trust to the analytics it provides.`,

  tags: ["ai", "infra", "defi"]
};

async function createProject() {
  console.log('🫀 Creating AgentPulse project draft...\n');

  try {
    const response = await fetch(`${API_BASE}/my-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(projectData)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create project: ${response.status} ${error}`);
    }

    const result = await response.json();
    
    console.log('✅ Project draft created successfully!\n');
    console.log('Project Details:');
    console.log('- ID:', result.project.id);
    console.log('- Name:', result.project.name);
    console.log('- Slug:', result.project.slug);
    console.log('- Status:', result.project.status);
    console.log('- URL:', `https://colosseum.com/agent-hackathon/projects/${result.project.slug}`);
    console.log('\n📝 Remember: Project is in DRAFT status. Submit when ready!');

  } catch (error) {
    console.error('❌ Error creating project:', error.message);
    process.exit(1);
  }
}

createProject();
