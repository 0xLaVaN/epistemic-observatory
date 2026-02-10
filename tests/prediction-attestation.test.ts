/**
 * Tests for Prediction Attestation Program
 * Run with: npx ts-mocha -p tsconfig.json tests/*.test.ts
 */

import { expect } from "chai";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  PredictionAttestationClient,
  Domain,
  Outcome,
  hashPrediction,
  getProfilePDA,
  getAttestationPDA,
  PROGRAM_ID,
} from "../sdk/index";

describe("prediction-attestation", () => {
  const connection = new Connection("http://localhost:8899", "confirmed");
  const agent = Keypair.generate();
  let client: PredictionAttestationClient;

  before(async () => {
    client = new PredictionAttestationClient(connection);

    // Airdrop SOL to agent
    const sig = await connection.requestAirdrop(
      agent.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);
  });

  it("derives deterministic PDAs", () => {
    const [pda1] = getProfilePDA(agent.publicKey);
    const [pda2] = getProfilePDA(agent.publicKey);
    expect(pda1.toBase58()).to.equal(pda2.toBase58());

    const hash = hashPrediction("BTC > 100K by March 2026");
    const [att1] = getAttestationPDA(agent.publicKey, hash);
    const [att2] = getAttestationPDA(agent.publicKey, hash);
    expect(att1.toBase58()).to.equal(att2.toBase58());
  });

  it("hashes predictions consistently", () => {
    const h1 = hashPrediction("BTC > 100K by March 2026");
    const h2 = hashPrediction("BTC > 100K by March 2026");
    expect(h1.equals(h2)).to.be.true;
    expect(h1.length).to.equal(32);
  });

  it("initializes agent profile", async () => {
    const txSig = await client.initializeProfile(agent);
    expect(txSig).to.be.a("string");

    const profile = await client.getProfile(agent.publicKey);
    expect(profile).to.not.be.null;
    expect(profile!.totalPredictions).to.equal(0);
    expect(profile!.resolvedPredictions).to.equal(0);
    expect(profile!.agent.toBase58()).to.equal(agent.publicKey.toBase58());
  });

  it("submits a prediction attestation", async () => {
    const claim = "BTC > 100K by March 2026";
    const deadline = Math.floor(Date.now() / 1000) + 86400; // 24h from now

    const result = await client.attestPrediction(
      agent,
      claim,
      7500, // 75% confidence
      Domain.Crypto,
      deadline,
      "Bitcoin price prediction based on halving cycle analysis"
    );

    expect(result.txSig).to.be.a("string");
    expect(result.predictionHash.length).to.equal(32);

    // Verify on-chain
    const attestation = await client.getAttestation(result.attestationPDA);
    expect(attestation).to.not.be.null;
    expect(attestation!.probabilityBps).to.equal(7500);
    expect(attestation!.domain).to.equal(Domain.Crypto);
    expect(attestation!.outcome).to.equal(Outcome.Pending);
    expect(attestation!.deadline).to.equal(deadline);

    // Check profile updated
    const profile = await client.getProfile(agent.publicKey);
    expect(profile!.totalPredictions).to.equal(1);
    expect(profile!.pendingPredictions).to.equal(1);
  });

  it("resolves a prediction and computes Brier score", async () => {
    const claim = "ETH > 5K by Feb 2026";
    const deadline = Math.floor(Date.now() / 1000) + 1; // 1 second from now

    const result = await client.attestPrediction(
      agent,
      claim,
      8000, // 80% confidence
      Domain.Crypto,
      deadline
    );

    // Wait for deadline to pass
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Resolve as TRUE (it happened)
    const txSig = await client.resolvePrediction(
      agent,
      result.attestationPDA,
      agent.publicKey,
      true
    );
    expect(txSig).to.be.a("string");

    const attestation = await client.getAttestation(result.attestationPDA);
    expect(attestation!.outcome).to.equal(Outcome.True);
    // Brier for 80% confidence on true outcome: (0.8 - 1.0)^2 = 0.04 = 400 bps
    expect(attestation!.brierScoreBps).to.equal(400);

    const profile = await client.getProfile(agent.publicKey);
    expect(profile!.resolvedPredictions).to.equal(1);

    const avgBrier = PredictionAttestationClient.averageBrier(profile!);
    expect(avgBrier).to.be.closeTo(0.04, 0.001);
  });

  it("rejects duplicate prediction hash", async () => {
    const claim = "BTC > 100K by March 2026"; // same as earlier
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    try {
      await client.attestPrediction(agent, claim, 6000, Domain.Crypto, deadline);
      expect.fail("Should have thrown");
    } catch (e: any) {
      // Expected: account already exists
      expect(e.message).to.include("already in use");
    }
  });

  it("rejects resolution before deadline", async () => {
    const claim = "SOL > 500 by Dec 2026";
    const deadline = Math.floor(Date.now() / 1000) + 86400 * 365; // 1 year

    const result = await client.attestPrediction(
      agent,
      claim,
      2000,
      Domain.Crypto,
      deadline
    );

    try {
      await client.resolvePrediction(
        agent,
        result.attestationPDA,
        agent.publicKey,
        false
      );
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.message).to.include("DeadlineNotReached");
    }
  });

  it("rejects unauthorized resolver", async () => {
    const claim = "AI achieves AGI by 2027";
    const deadline = Math.floor(Date.now() / 1000) + 1;
    const otherAgent = Keypair.generate();

    // Fund other agent
    const sig = await connection.requestAirdrop(
      otherAgent.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    const result = await client.attestPrediction(
      agent,
      claim,
      1500,
      Domain.AI,
      deadline
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      await client.resolvePrediction(
        otherAgent, // wrong resolver
        result.attestationPDA,
        agent.publicKey,
        true
      );
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.message).to.include("Unauthorized");
    }
  });
});
