use anchor_lang::prelude::*;

declare_id!("61YS7i32Y1oTRiMVsPay2Bgbx3ihsBoTKtWk38hRp8GW");

#[program]
pub mod agentpulse_program {
    use super::*;

    pub fn record_evaluation(
        ctx: Context<RecordEvaluation>,
        project_id: u32,
        project_name: String,
        score: u16,
        confidence: u16,
        reasoning_hash: [u8; 32],
    ) -> Result<()> {
        let eval = &mut ctx.accounts.evaluation;
        eval.authority = ctx.accounts.authority.key();
        eval.project_id = project_id;
        eval.project_name = project_name[..project_name.len().min(64)].to_string();
        eval.score = score;
        eval.confidence = confidence;
        eval.reasoning_hash = reasoning_hash;
        eval.timestamp = Clock::get()?.unix_timestamp;
        eval.bump = ctx.bumps.evaluation;
        
        msg!("AgentPulse: Evaluated project {} - score {}/100, confidence {}%", 
            eval.project_name, score, confidence);
        Ok(())
    }

    pub fn record_vote(
        ctx: Context<RecordVote>,
        project_id: u32,
        vote_type: u8,
        reasoning_hash: [u8; 32],
    ) -> Result<()> {
        let vote = &mut ctx.accounts.vote_record;
        vote.authority = ctx.accounts.authority.key();
        vote.project_id = project_id;
        vote.vote_type = vote_type;
        vote.reasoning_hash = reasoning_hash;
        vote.timestamp = Clock::get()?.unix_timestamp;
        vote.bump = ctx.bumps.vote_record;
        
        msg!("AgentPulse: Voted on project {} - type {}", project_id, vote_type);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(project_id: u32)]
pub struct RecordEvaluation<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + EvaluationRecord::INIT_SPACE,
        seeds = [b"eval", authority.key().as_ref(), &project_id.to_le_bytes()],
        bump
    )]
    pub evaluation: Account<'info, EvaluationRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(project_id: u32)]
pub struct RecordVote<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [b"vote", authority.key().as_ref(), &project_id.to_le_bytes()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct EvaluationRecord {
    pub authority: Pubkey,
    pub project_id: u32,
    #[max_len(64)]
    pub project_name: String,
    pub score: u16,
    pub confidence: u16,
    pub reasoning_hash: [u8; 32],
    pub timestamp: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub authority: Pubkey,
    pub project_id: u32,
    pub vote_type: u8,
    pub reasoning_hash: [u8; 32],
    pub timestamp: i64,
    pub bump: u8,
}
