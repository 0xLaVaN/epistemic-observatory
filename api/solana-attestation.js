/**
 * Solana On-Chain Attestation Routes
 * Bridges the Calibration API to the on-chain prediction attestation program
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { createHash } from "crypto";

// Program ID — update after devnet deployment
let PROGRAM_ID;
try {
  PROGRAM_ID = new PublicKey(
    process.env.ATTESTATION_PROGRAM_ID ||
      "11111111111111111111111111111111"
  );
} catch {
  PROGRAM_ID = null;
}

const DEVNET_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// PDA derivation
function getProfilePDA(agent) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), agent.toBuffer()],
    PROGRAM_ID
  );
}

function getAttestationPDA(agent, predictionHash) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("attestation"), agent.toBuffer(), predictionHash],
    PROGRAM_ID
  );
}

function hashPrediction(claim) {
  return createHash("sha256").update(claim).digest();
}

// Deserialize attestation account data
function deserializeAttestation(data) {
  if (!data || data.length < 8 + 32 + 32 + 32 + 2 + 1 + 1 + 8 + 8 + 8 + 4 + 1) return null;
  let offset = 8; // skip discriminator
  const agent = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const predictionHash = data.slice(offset, offset + 32).toString("hex"); offset += 32;
  const descriptionHash = data.slice(offset, offset + 32).toString("hex"); offset += 32;
  const probabilityBps = data.readUInt16LE(offset); offset += 2;
  const domain = data.readUInt8(offset); offset += 1;
  const outcome = data.readUInt8(offset); offset += 1;
  const deadline = Number(data.readBigInt64LE(offset)); offset += 8;
  const createdAt = Number(data.readBigInt64LE(offset)); offset += 8;
  const resolvedAt = Number(data.readBigInt64LE(offset)); offset += 8;
  const brierScoreBps = data.readUInt32LE(offset); offset += 4;
  const bump = data.readUInt8(offset);

  const domainNames = ["crypto", "ai", "geopolitics", "other"];
  const outcomeNames = ["pending", "true", "false"];

  return {
    agent: agent.toBase58(),
    predictionHash,
    descriptionHash,
    probability: probabilityBps / 10000,
    probabilityBps,
    domain: domainNames[domain] || "unknown",
    outcome: outcomeNames[outcome] || "unknown",
    deadline: new Date(deadline * 1000).toISOString(),
    createdAt: new Date(createdAt * 1000).toISOString(),
    resolvedAt: resolvedAt > 0 ? new Date(resolvedAt * 1000).toISOString() : null,
    brierScore: brierScoreBps / 10000,
    brierScoreBps,
    bump,
  };
}

// Deserialize profile account
function deserializeProfile(data) {
  if (!data || data.length < 8 + 32 + 4 + 4 + 4 + 8 + 8 + 1) return null;
  let offset = 8;
  const agent = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const totalPredictions = data.readUInt32LE(offset); offset += 4;
  const resolvedPredictions = data.readUInt32LE(offset); offset += 4;
  const pendingPredictions = data.readUInt32LE(offset); offset += 4;
  const brierNumerator = Number(data.readBigUInt64LE(offset)); offset += 8;
  const createdAt = Number(data.readBigInt64LE(offset)); offset += 8;
  const bump = data.readUInt8(offset);

  const avgBrier = resolvedPredictions > 0
    ? brierNumerator / (resolvedPredictions * 10000)
    : null;

  return {
    agent: agent.toBase58(),
    totalPredictions,
    resolvedPredictions,
    pendingPredictions,
    brierNumerator,
    averageBrierScore: avgBrier,
    createdAt: new Date(createdAt * 1000).toISOString(),
    calibrationGrade: avgBrier === null ? "unrated"
      : avgBrier < 0.1 ? "A (excellent)"
      : avgBrier < 0.2 ? "B (good)"
      : avgBrier < 0.25 ? "C (average)"
      : avgBrier < 0.33 ? "D (below average)"
      : "F (poor)",
  };
}

export function registerSolanaRoutes(app) {
  const connection = new Connection(DEVNET_URL, "confirmed");

  // Get on-chain attestation for a prediction
  app.get("/onchain/attestation/:agentPubkey/:claim", async (req, res) => {
    try {
      const agent = new PublicKey(req.params.agentPubkey);
      const predictionHash = hashPrediction(req.params.claim);
      const [pda] = getAttestationPDA(agent, predictionHash);

      const info = await connection.getAccountInfo(pda);
      if (!info) {
        return res.status(404).json({
          error: "No on-chain attestation found",
          pda: pda.toBase58(),
          hint: "This prediction has not been attested on-chain yet",
        });
      }

      const attestation = deserializeAttestation(info.data);
      res.json({
        pda: pda.toBase58(),
        attestation,
        solana_explorer: `https://explorer.solana.com/address/${pda.toBase58()}?cluster=devnet`,
        verification: "This prediction was cryptographically attested on Solana before its outcome.",
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Get agent's on-chain profile
  app.get("/onchain/profile/:agentPubkey", async (req, res) => {
    try {
      const agent = new PublicKey(req.params.agentPubkey);
      const [pda] = getProfilePDA(agent);

      const info = await connection.getAccountInfo(pda);
      if (!info) {
        return res.status(404).json({
          error: "No on-chain profile found",
          pda: pda.toBase58(),
          hint: "Agent has not initialized their on-chain profile",
        });
      }

      const profile = deserializeProfile(info.data);
      res.json({
        pda: pda.toBase58(),
        profile,
        solana_explorer: `https://explorer.solana.com/address/${pda.toBase58()}?cluster=devnet`,
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Derive PDA for a claim (useful for verification)
  app.get("/onchain/pda/:agentPubkey/:claim", (req, res) => {
    try {
      const agent = new PublicKey(req.params.agentPubkey);
      const predictionHash = hashPrediction(req.params.claim);
      const [attestationPDA, attestationBump] = getAttestationPDA(agent, predictionHash);
      const [profilePDA, profileBump] = getProfilePDA(agent);

      res.json({
        agent: agent.toBase58(),
        claim: req.params.claim,
        predictionHash: predictionHash.toString("hex"),
        attestationPDA: attestationPDA.toBase58(),
        attestationBump,
        profilePDA: profilePDA.toBase58(),
        profileBump,
        programId: PROGRAM_ID.toBase58(),
        solana_explorer: `https://explorer.solana.com/address/${attestationPDA.toBase58()}?cluster=devnet`,
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Program info
  app.get("/onchain", async (req, res) => {
    let programExists = false;
    try {
      const info = await connection.getAccountInfo(PROGRAM_ID);
      programExists = info !== null;
    } catch (_) {}

    res.json({
      program: "Prediction Attestation Protocol",
      programId: PROGRAM_ID.toBase58(),
      cluster: "devnet",
      deployed: programExists,
      rpcUrl: DEVNET_URL,
      endpoints: [
        "GET /onchain — Program info",
        "GET /onchain/profile/:pubkey — Agent on-chain profile + Brier score",
        "GET /onchain/attestation/:pubkey/:claim — Specific prediction attestation",
        "GET /onchain/pda/:pubkey/:claim — Derive PDA addresses for verification",
      ],
      how_it_works: {
        step1: "Agent initializes on-chain profile (one-time)",
        step2: "Agent attests predictions with confidence levels (stored as PDAs)",
        step3: "After deadline, agent resolves prediction with outcome",
        step4: "Brier score computed on-chain — immutable, verifiable calibration",
      },
      game_theory: "On-chain attestation eliminates hindsight bias. Your prediction, timestamp, and confidence are permanently recorded before the outcome is known.",
      solana_explorer: `https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`,
    });
  });
}
