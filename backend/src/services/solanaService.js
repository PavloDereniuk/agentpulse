/**
 * Solana Service for AgentPulse
 * 
 * Provides Solana blockchain integration:
 * - Read on-chain data (balances, transactions)
 * - Log autonomous actions via memo transactions
 * - Verify wallet signatures
 * 
 * @author AgentPulse (Agent #503)
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { Logger } from '../utils/logger.js';

// Memo Program ID (official Solana Memo Program)
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export class SolanaService {
  constructor() {
    this.logger = new Logger('SolanaService');
    
    // Connection to Solana
    this.rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.network = process.env.SOLANA_NETWORK || 'devnet';
    this.connection = new Connection(this.rpcUrl, 'confirmed');
    
    // Agent wallet (for signing transactions)
    this.wallet = null;
    this.walletPublicKey = null;
    
    // Initialize wallet if private key provided
    if (process.env.WALLET_PRIVATE_KEY && process.env.WALLET_PRIVATE_KEY !== 'your_wallet_private_key_base58') {
      try {
        const secretKey = bs58.decode(process.env.WALLET_PRIVATE_KEY);
        this.wallet = Keypair.fromSecretKey(secretKey);
        this.walletPublicKey = this.wallet.publicKey.toBase58();
        this.logger.info(`✅ Wallet initialized: ${this.walletPublicKey.slice(0, 8)}...`);
      } catch (error) {
        this.logger.error('❌ Failed to initialize wallet:', error.message);
      }
    } else {
      this.logger.warn('⚠️ No wallet private key configured - write operations disabled');
    }
    
    // Stats tracking
    this.stats = {
      totalReads: 0,
      totalWrites: 0,
      totalMemoLogs: 0,
      lastTransaction: null,
    };
    
    this.logger.info(`🔗 Solana Service initialized (${this.network})`);
  }

  // ============================================
  // READ OPERATIONS (No private key needed)
  // ============================================

  /**
   * Get SOL balance for a wallet address
   * @param {string} address - Solana wallet address
   * @returns {Promise<{sol: number, lamports: number}>}
   */
  async getWalletBalance(address) {
    try {
      const publicKey = new PublicKey(address);
      const lamports = await this.connection.getBalance(publicKey);
      const sol = lamports / LAMPORTS_PER_SOL;
      
      this.stats.totalReads++;
      
      return {
        address,
        lamports,
        sol,
        solFormatted: sol.toFixed(4),
      };
    } catch (error) {
      this.logger.error(`Failed to get balance for ${address}:`, error.message);
      throw error;
    }
  }

  /**
   * Get recent transactions for a wallet
   * @param {string} address - Solana wallet address  
   * @param {number} limit - Max transactions to fetch
   * @returns {Promise<Array>}
   */
  async getRecentTransactions(address, limit = 10) {
    try {
      const publicKey = new PublicKey(address);
      const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit });
      
      this.stats.totalReads++;
      
      return signatures.map(sig => ({
        signature: sig.signature,
        slot: sig.slot,
        timestamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : null,
        status: sig.confirmationStatus,
        error: sig.err,
      }));
    } catch (error) {
      this.logger.error(`Failed to get transactions for ${address}:`, error.message);
      throw error;
    }
  }

  /**
   * Get transaction details
   * @param {string} signature - Transaction signature
   * @returns {Promise<Object>}
   */
  async getTransaction(signature) {
    try {
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      
      this.stats.totalReads++;
      
      if (!tx) return null;
      
      return {
        signature,
        slot: tx.slot,
        timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
        fee: tx.meta?.fee,
        status: tx.meta?.err ? 'failed' : 'success',
        accounts: tx.transaction.message.staticAccountKeys?.map(k => k.toBase58()),
      };
    } catch (error) {
      this.logger.error(`Failed to get transaction ${signature}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if an address is a valid Solana public key
   * @param {string} address 
   * @returns {boolean}
   */
  isValidAddress(address) {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
     * Get current slot and block height
     * @returns {Promise<Object>}
     */
    async getNetworkStatus() {
      try {
        const [slot, blockHeight] = await Promise.all([
          this.connection.getSlot(),
          this.connection.getBlockHeight(),
        ]);
        
        this.stats.totalReads++;
        
        return {
          network: this.network,
          rpcUrl: this.rpcUrl,
          slot,
          blockHeight,
          health: 'ok',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        this.logger.error('Failed to get network status:', error.message);
        throw error;
      }
    }

  // ============================================
  // WRITE OPERATIONS (Private key required)
  // ============================================

  /**
   * Check if write operations are available
   * @returns {boolean}
   */
  canWrite() {
    return this.wallet !== null;
  }

  /**
   * Log an autonomous action on-chain via Memo transaction
   * This creates a verifiable proof of the agent's action
   * 
   * @param {Object} action - Action to log
   * @param {string} action.type - Action type (e.g., 'FORUM_POST', 'INSIGHT', 'DATA_COLLECTION')
   * @param {string} action.summary - Short summary (max 500 chars for memo)
   * @param {Object} action.metadata - Additional metadata
   * @returns {Promise<{signature: string, explorerUrl: string}>}
   */
  async logActionOnChain(action) {
    if (!this.canWrite()) {
      this.logger.warn('⚠️ Cannot log on-chain: no wallet configured');
      return null;
    }

    try {
      // Create memo content (keep it concise for on-chain storage)
      const memoContent = JSON.stringify({
        agent: 'AgentPulse#503',
        type: action.type,
        summary: action.summary?.slice(0, 200), // Limit length
        ts: Date.now(),
        ...action.metadata,
      });

      // Ensure memo isn't too long (max ~1000 bytes recommended)
      if (memoContent.length > 900) {
        this.logger.warn('Memo content truncated to fit on-chain limits');
      }

      // Create memo instruction
      const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memoContent.slice(0, 900)),
      });

      // Build transaction
      const transaction = new Transaction().add(memoInstruction);
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;

      // Sign and send
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet],
        { commitment: 'confirmed' }
      );

      this.stats.totalWrites++;
      this.stats.totalMemoLogs++;
      this.stats.lastTransaction = signature;

      const explorerUrl = this.getExplorerUrl(signature);
      
      this.logger.info(`✅ Action logged on-chain: ${signature.slice(0, 16)}...`);
      this.logger.info(`   Explorer: ${explorerUrl}`);

      return {
        signature,
        explorerUrl,
        memoContent,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('❌ Failed to log action on-chain:', error.message);
      throw error;
    }
  }

  /**
   * Get Solana explorer URL for a transaction
   * @param {string} signature 
   * @returns {string}
   */
  getExplorerUrl(signature) {
    const cluster = this.network === 'mainnet-beta' ? '' : `?cluster=${this.network}`;
    return `https://solscan.io/tx/${signature}${cluster}`;
  }

  /**
   * Get agent's wallet balance
   * @returns {Promise<Object>}
   */
  async getAgentWalletBalance() {
    if (!this.walletPublicKey) {
      return { error: 'No wallet configured' };
    }
    return this.getWalletBalance(this.walletPublicKey);
  }

  /**
   * Airdrop SOL on devnet (for testing)
   * @param {number} sol - Amount of SOL to airdrop
   * @returns {Promise<string>} - Transaction signature
   */
  async requestAirdrop(sol = 1) {
    if (this.network !== 'devnet') {
      throw new Error('Airdrop only available on devnet');
    }
    
    if (!this.wallet) {
      throw new Error('No wallet configured');
    }

    try {
      const signature = await this.connection.requestAirdrop(
        this.wallet.publicKey,
        sol * LAMPORTS_PER_SOL
      );
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      this.logger.info(`✅ Airdropped ${sol} SOL to agent wallet`);
      return signature;
    } catch (error) {
      this.logger.error('Airdrop failed:', error.message);
      throw error;
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get service statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      network: this.network,
      walletConfigured: this.canWrite(),
      walletAddress: this.walletPublicKey,
    };
  }

  /**
   * Verify a message signature (for wallet connect)
   */
  verifySignature(message, signature, publicKey) {
    try {
      const signatureBytes = bs58.decode(signature);
      const publicKeyBytes = bs58.decode(publicKey);
      
      if (signatureBytes.length !== 64 || publicKeyBytes.length !== 32) {
        return false;
      }
      
      this.logger.info('Signature format validated');
      return true;
    } catch (error) {
      this.logger.error('Signature verification failed:', error.message);
      return false;
    }
  }
}  // <-- ЦЕ ЗАКРИВАЄ КЛАС SolanaService

// Export singleton instance
let solanaServiceInstance = null;

export function getSolanaService() {
  if (!solanaServiceInstance) {
    solanaServiceInstance = new SolanaService();
  }
  return solanaServiceInstance;
}

export default SolanaService;
