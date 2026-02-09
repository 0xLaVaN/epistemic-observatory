use anchor_lang::prelude::*;

declare_id!("EPist1cATT3stat1onPr0gram111111111111111111");

#[program]
pub mod prediction_attestation {
    use super::*;

    /// Register a new prediction with a probability claim
    pub fn attest_prediction(
        ctx: Context<AttestPrediction>,
        prediction_hash: [u8; 32],
        probability_bps: u16, // basis points 0-10000
        description_hash: [u8; 32],
        domain: u8, // 0=crypto, 1=ai, 2=geopolitics, 3=other
        deadline: i64,
    ) -> Result<()> {
        require!(probability_bps <= 10000, ErrorCode::InvalidProbability);
        require!(deadline > Clock::get()?.unix_timestamp, ErrorCode::DeadlinePassed);

        let attestation = &mut ctx.accounts.attestation;
        attestation.agent = ctx.accounts.agent.key();
        attestation.prediction_hash = prediction_hash;
        attestation.probability_bps = probability_bps;
        attestation.description_hash = description_hash;
        attestation.domain = domain;
        attestation.deadline = deadline;
        attestation.outcome = Outcome::Pending;
        attestation.created_at = Clock::get()?.unix_timestamp;
        attestation.resolved_at = 0;
        attestation.bump = ctx.bumps.attestation;

        // Update agent profile stats
        let profile = &mut ctx.accounts.agent_profile;
        profile.total_predictions += 1;
        profile.pending_predictions += 1;

        emit!(PredictionAttested {
            agent: ctx.accounts.agent.key(),
            prediction_hash,
            probability_bps,
            domain,
            deadline,
        });

        Ok(())
    }

    /// Resolve a prediction outcome (oracle or self-report with dispute window)
    pub fn resolve_prediction(
        ctx: Context<ResolvePrediction>,
        outcome: bool,
    ) -> Result<()> {
        let attestation = &mut ctx.accounts.attestation;
        require!(attestation.outcome == Outcome::Pending, ErrorCode::AlreadyResolved);
        require!(
            Clock::get()?.unix_timestamp >= attestation.deadline,
            ErrorCode::DeadlineNotReached
        );

        let predicted_prob = attestation.probability_bps as f64 / 10000.0;
        let actual = if outcome { 1.0 } else { 0.0 };
        let brier_contribution = (predicted_prob - actual).powi(2);

        // Store as basis points (0-10000) for on-chain precision
        let brier_bps = (brier_contribution * 10000.0) as u32;

        attestation.outcome = if outcome { Outcome::True } else { Outcome::False };
        attestation.resolved_at = Clock::get()?.unix_timestamp;
        attestation.brier_score_bps = brier_bps;

        // Update agent profile
        let profile = &mut ctx.accounts.agent_profile;
        profile.pending_predictions -= 1;
        profile.resolved_predictions += 1;
        profile.brier_numerator += brier_bps as u64;
        // Average Brier = brier_numerator / (resolved_predictions * 10000)
        // Lower is better. 0 = perfect. 2500 = random. 10000 = always wrong.

        emit!(PredictionResolved {
            agent: attestation.agent,
            prediction_hash: attestation.prediction_hash,
            outcome,
            brier_score_bps: brier_bps,
            avg_brier_bps: if profile.resolved_predictions > 0 {
                (profile.brier_numerator / profile.resolved_predictions as u64) as u32
            } else {
                0
            },
        });

        Ok(())
    }

    /// Initialize agent profile (one-time)
    pub fn initialize_profile(ctx: Context<InitializeProfile>) -> Result<()> {
        let profile = &mut ctx.accounts.agent_profile;
        profile.agent = ctx.accounts.agent.key();
        profile.total_predictions = 0;
        profile.resolved_predictions = 0;
        profile.pending_predictions = 0;
        profile.brier_numerator = 0;
        profile.created_at = Clock::get()?.unix_timestamp;
        profile.bump = ctx.bumps.agent_profile;
        Ok(())
    }
}

// === Accounts ===

#[derive(Accounts)]
#[instruction(prediction_hash: [u8; 32])]
pub struct AttestPrediction<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        init,
        payer = agent,
        space = 8 + Attestation::INIT_SPACE,
        seeds = [b"attestation", agent.key().as_ref(), &prediction_hash],
        bump
    )]
    pub attestation: Account<'info, Attestation>,

    #[account(
        mut,
        seeds = [b"profile", agent.key().as_ref()],
        bump = agent_profile.bump,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolvePrediction<'info> {
    #[account(mut)]
    pub resolver: Signer<'info>,

    #[account(
        mut,
        constraint = attestation.agent == resolver.key() @ ErrorCode::Unauthorized,
    )]
    pub attestation: Account<'info, Attestation>,

    #[account(
        mut,
        seeds = [b"profile", attestation.agent.as_ref()],
        bump = agent_profile.bump,
    )]
    pub agent_profile: Account<'info, AgentProfile>,
}

#[derive(Accounts)]
pub struct InitializeProfile<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        init,
        payer = agent,
        space = 8 + AgentProfile::INIT_SPACE,
        seeds = [b"profile", agent.key().as_ref()],
        bump
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    pub system_program: Program<'info, System>,
}

// === State ===

#[account]
#[derive(InitSpace)]
pub struct Attestation {
    pub agent: Pubkey,           // 32
    pub prediction_hash: [u8; 32], // 32
    pub description_hash: [u8; 32], // 32
    pub probability_bps: u16,    // 2
    pub domain: u8,              // 1
    pub outcome: Outcome,        // 1
    pub deadline: i64,           // 8
    pub created_at: i64,         // 8
    pub resolved_at: i64,        // 8
    pub brier_score_bps: u32,    // 4
    pub bump: u8,                // 1
}

#[account]
#[derive(InitSpace)]
pub struct AgentProfile {
    pub agent: Pubkey,              // 32
    pub total_predictions: u32,     // 4
    pub resolved_predictions: u32,  // 4
    pub pending_predictions: u32,   // 4
    pub brier_numerator: u64,       // 8 (sum of all brier_score_bps)
    pub created_at: i64,            // 8
    pub bump: u8,                   // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Outcome {
    Pending,
    True,
    False,
}

// === Events ===

#[event]
pub struct PredictionAttested {
    pub agent: Pubkey,
    pub prediction_hash: [u8; 32],
    pub probability_bps: u16,
    pub domain: u8,
    pub deadline: i64,
}

#[event]
pub struct PredictionResolved {
    pub agent: Pubkey,
    pub prediction_hash: [u8; 32],
    pub outcome: bool,
    pub brier_score_bps: u32,
    pub avg_brier_bps: u32,
}

// === Errors ===

#[error_code]
pub enum ErrorCode {
    #[msg("Probability must be 0-10000 basis points")]
    InvalidProbability,
    #[msg("Deadline must be in the future")]
    DeadlinePassed,
    #[msg("Prediction already resolved")]
    AlreadyResolved,
    #[msg("Deadline not yet reached")]
    DeadlineNotReached,
    #[msg("Only the attesting agent can resolve")]
    Unauthorized,
}
