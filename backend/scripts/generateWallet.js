/**
 * Generate a new Solana wallet for AgentPulse
 * 
 * Run: node scripts/generateWallet.js
 * 
 * ⚠️ SAVE THE OUTPUT SECURELY - Private key is shown once!
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

console.log('🔑 Generating new Solana wallet for AgentPulse...\n');

// Generate new keypair
const keypair = Keypair.generate();

// Get addresses and keys
const publicKey = keypair.publicKey.toBase58();
const privateKey = bs58.encode(keypair.secretKey);

console.log('═'.repeat(60));
console.log('✅ NEW WALLET GENERATED');
console.log('═'.repeat(60));
console.log('');
console.log('📍 Public Address (safe to share):');
console.log(`   ${publicKey}`);
console.log('');
console.log('🔐 Private Key (KEEP SECRET - add to .env):');
console.log(`   ${privateKey}`);
console.log('');
console.log('═'.repeat(60));
console.log('');
console.log('📋 Add this to your .env file:');
console.log('');
console.log(`WALLET_PRIVATE_KEY=${privateKey}`);
console.log('');
console.log('═'.repeat(60));
console.log('');
console.log('🔗 View on Solscan (devnet):');
console.log(`   https://solscan.io/account/${publicKey}?cluster=devnet`);
console.log('');
console.log('💰 Get devnet SOL:');
console.log(`   solana airdrop 2 ${publicKey} --url devnet`);
console.log('   OR use: POST /api/solana/airdrop');
console.log('');
console.log('⚠️  IMPORTANT: Never commit .env to git!');
console.log('═'.repeat(60));
