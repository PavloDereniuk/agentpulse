/**
 * Anchor Service - On-chain evaluation & vote recording
 *
 * Uses AgentPulse's custom Solana program to store
 * structured evaluation data in PDA accounts.
 *
 * Program: 61YS7i32Y1oTRiMVsPay2Bgbx3ihsBoTKtWk38hRp8GW
 */
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROGRAM_ID = new PublicKey(
  "61YS7i32Y1oTRiMVsPay2Bgbx3ihsBoTKtWk38hRp8GW",
);

export class AnchorService {
  constructor() {
    this.logger = new Logger("AnchorService");
    this.program = null;
    this.wallet = null;
    this.ready = false;
    this.stats = { evaluationsRecorded: 0, votesRecorded: 0, errors: 0 };
  }

  async initialize() {
    try {
      const privateKey = process.env.WALLET_PRIVATE_KEY;
      if (!privateKey) {
        this.logger.warn("No WALLET_PRIVATE_KEY - Anchor service disabled");
        return false;
      }

      const { default: bs58 } = await import("bs58");
      const secretKey = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(secretKey);
      this.wallet = new Wallet(keypair);

      const rpcUrl = "https://api.devnet.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");
      const provider = new AnchorProvider(connection, this.wallet, {
        commitment: "confirmed",
      });

      const idlPath = join(__dirname, "../../anchor/agentpulse_program.json");
      const idl = JSON.parse(readFileSync(idlPath, "utf8"));

      this.program = new Program(idl, provider);
      this.ready = true;
      this.logger.info(
        `✅ Anchor service initialized - Program: ${PROGRAM_ID.toString().slice(0, 16)}...`,
      );
      this.logger.info(`   Wallet: ${keypair.publicKey.toString()}`);
      return true;
    } catch (error) {
      this.logger.error("Failed to initialize Anchor service:", error.message);
      this.ready = false;
      return false;
    }
  }

  async recordEvaluation(projectId, projectName, score, confidence, reasoning) {
    if (!this.ready) return null;

    try {
      const reasoningHash = Array.from(
        createHash("sha256")
          .update(reasoning || "no reasoning")
          .digest(),
      );

      const scoreU16 = Math.round(Math.min(100, Math.max(0, score * 10)));
      const confidenceU16 = Math.round(Math.min(100, Math.max(0, confidence)));
      const name = (projectName || "Unknown").slice(0, 64);

      const [evalPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("eval"),
          this.wallet.publicKey.toBuffer(),
          Buffer.from(new Uint32Array([projectId]).buffer),
        ],
        PROGRAM_ID,
      );

      this.logger.info(
        `Recording evaluation on-chain: ${name} (ID: ${projectId})`,
      );

      const tx = await this.program.methods
        .recordEvaluation(
          projectId,
          name,
          scoreU16,
          confidenceU16,
          reasoningHash,
        )
        .accounts({
          evaluation: evalPda,
          authority: this.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      this.stats.evaluationsRecorded++;
      this.logger.info(`✅ Evaluation on-chain: ${tx.slice(0, 16)}...`);

      return {
        signature: tx,
        pda: evalPda.toString(),
        explorerUrl: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
      };
    } catch (error) {
      this.stats.errors++;
      if (error.message?.includes("already in use")) {
        this.logger.info(
          `Project ${projectId} already has on-chain evaluation`,
        );
        return { alreadyExists: true };
      }
      this.logger.error(`Anchor evaluation failed: ${error.message}`);
      return null;
    }
  }

  async recordVote(projectId, voteType, reasoning) {
    if (!this.ready) return null;

    try {
      const reasoningHash = Array.from(
        createHash("sha256")
          .update(reasoning || "vote")
          .digest(),
      );

      const vType = voteType === "downvote" ? 2 : 1;

      const [votePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote"),
          this.wallet.publicKey.toBuffer(),
          Buffer.from(new Uint32Array([projectId]).buffer),
        ],
        PROGRAM_ID,
      );

      this.logger.info(`Recording vote on-chain: project ${projectId}`);

      const tx = await this.program.methods
        .recordVote(projectId, vType, reasoningHash)
        .accounts({
          voteRecord: votePda,
          authority: this.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      this.stats.votesRecorded++;
      this.logger.info(`✅ Vote on-chain: ${tx.slice(0, 16)}...`);

      return {
        signature: tx,
        pda: votePda.toString(),
        explorerUrl: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
      };
    } catch (error) {
      this.stats.errors++;
      if (error.message?.includes("already in use")) {
        this.logger.info(`Project ${projectId} already has on-chain vote`);
        return { alreadyExists: true };
      }
      this.logger.error(`Anchor vote failed: ${error.message}`);
      return null;
    }
  }

  async getEvaluation(projectId) {
    if (!this.ready) return null;

    try {
      const [evalPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("eval"),
          this.wallet.publicKey.toBuffer(),
          Buffer.from(new Uint32Array([projectId]).buffer),
        ],
        PROGRAM_ID,
      );

      const account =
        await this.program.account.evaluationRecord.fetch(evalPda);
      return {
        projectId: account.projectId,
        projectName: account.projectName,
        score: account.score,
        confidence: account.confidence,
        timestamp: new Date(account.timestamp.toNumber() * 1000).toISOString(),
        pda: evalPda.toString(),
      };
    } catch {
      return null;
    }
  }

  getStats() {
    return {
      ...this.stats,
      ready: this.ready,
      programId: PROGRAM_ID.toString(),
    };
  }
}
