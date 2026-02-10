/**
 * Prediction Attestation SDK
 * TypeScript client for the on-chain prediction attestation program
 */

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "crypto";
import * as borsh from "borsh";

// Program ID - update after deployment
export const PROGRAM_ID = new PublicKey(
  "EPist1cATT3stat1onPr0gram111111111111111111"
);

// Discriminators (first 8 bytes of sha256("global:<instruction_name>"))
function ixDiscriminator(name: string): Buffer {
  const hash = createHash("sha256").update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

const IX_INITIALIZE_PROFILE = ixDiscriminator("initialize_profile");
const IX_ATTEST_PREDICTION = ixDiscriminator("attest_prediction");
const IX_RESOLVE_PREDICTION = ixDiscriminator("resolve_prediction");

// PDA derivation helpers
export function getProfilePDA(
  agent: PublicKey,
  programId = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), agent.toBuffer()],
    programId
  );
}

export function getAttestationPDA(
  agent: PublicKey,
  predictionHash: Buffer,
  programId = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("attestation"), agent.toBuffer(), predictionHash],
    programId
  );
}

// Hash a prediction claim string to 32 bytes
export function hashPrediction(claim: string): Buffer {
  return createHash("sha256").update(claim).digest();
}

// Domain enum
export enum Domain {
  Crypto = 0,
  AI = 1,
  Geopolitics = 2,
  Other = 3,
}

// Outcome enum for deserialization
export enum Outcome {
  Pending = 0,
  True = 1,
  False = 2,
}

// Account data types
export interface AttestationAccount {
  agent: PublicKey;
  predictionHash: Buffer;
  descriptionHash: Buffer;
  probabilityBps: number;
  domain: number;
  outcome: Outcome;
  deadline: number;
  createdAt: number;
  resolvedAt: number;
  brierScoreBps: number;
  bump: number;
}

export interface AgentProfileAccount {
  agent: PublicKey;
  totalPredictions: number;
  resolvedPredictions: number;
  pendingPredictions: number;
  brierNumerator: bigint;
  createdAt: number;
  bump: number;
}

export class PredictionAttestationClient {
  connection: Connection;
  programId: PublicKey;

  constructor(connection: Connection, programId = PROGRAM_ID) {
    this.connection = connection;
    this.programId = programId;
  }

  // Initialize agent profile (one-time per agent)
  async initializeProfile(agent: Keypair): Promise<string> {
    const [profilePDA] = getProfilePDA(agent.publicKey, this.programId);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: agent.publicKey, isSigner: true, isWritable: true },
        { pubkey: profilePDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: IX_INITIALIZE_PROFILE,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [agent]);
  }

  // Submit a prediction attestation
  async attestPrediction(
    agent: Keypair,
    claim: string,
    probabilityBps: number,
    domain: Domain,
    deadline: number,
    description?: string
  ): Promise<{ txSig: string; predictionHash: Buffer; attestationPDA: PublicKey }> {
    const predictionHash = hashPrediction(claim);
    const descriptionHash = description
      ? hashPrediction(description)
      : Buffer.alloc(32);

    const [attestationPDA] = getAttestationPDA(
      agent.publicKey,
      predictionHash,
      this.programId
    );
    const [profilePDA] = getProfilePDA(agent.publicKey, this.programId);

    // Serialize args: prediction_hash(32) + probability_bps(u16) + description_hash(32) + domain(u8) + deadline(i64)
    const data = Buffer.alloc(8 + 32 + 2 + 32 + 1 + 8);
    let offset = 0;
    IX_ATTEST_PREDICTION.copy(data, offset);
    offset += 8;
    predictionHash.copy(data, offset);
    offset += 32;
    data.writeUInt16LE(probabilityBps, offset);
    offset += 2;
    descriptionHash.copy(data, offset);
    offset += 32;
    data.writeUInt8(domain, offset);
    offset += 1;
    // i64 LE
    const deadlineBuf = Buffer.alloc(8);
    deadlineBuf.writeBigInt64LE(BigInt(deadline));
    deadlineBuf.copy(data, offset);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: agent.publicKey, isSigner: true, isWritable: true },
        { pubkey: attestationPDA, isSigner: false, isWritable: true },
        { pubkey: profilePDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    const txSig = await sendAndConfirmTransaction(this.connection, tx, [agent]);
    return { txSig, predictionHash, attestationPDA };
  }

  // Resolve a prediction
  async resolvePrediction(
    resolver: Keypair,
    attestationPDA: PublicKey,
    agentPubkey: PublicKey,
    outcome: boolean
  ): Promise<string> {
    const [profilePDA] = getProfilePDA(agentPubkey, this.programId);

    const data = Buffer.alloc(8 + 1);
    IX_RESOLVE_PREDICTION.copy(data, 0);
    data.writeUInt8(outcome ? 1 : 0, 8);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: resolver.publicKey, isSigner: true, isWritable: true },
        { pubkey: attestationPDA, isSigner: false, isWritable: true },
        { pubkey: profilePDA, isSigner: false, isWritable: true },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [resolver]);
  }

  // Fetch attestation account
  async getAttestation(pda: PublicKey): Promise<AttestationAccount | null> {
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;

    const data = info.data;
    let offset = 8; // skip discriminator

    const agent = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const predictionHash = data.slice(offset, offset + 32);
    offset += 32;
    const descriptionHash = data.slice(offset, offset + 32);
    offset += 32;
    const probabilityBps = data.readUInt16LE(offset);
    offset += 2;
    const domain = data.readUInt8(offset);
    offset += 1;
    const outcome = data.readUInt8(offset) as Outcome;
    offset += 1;
    const deadline = Number(data.readBigInt64LE(offset));
    offset += 8;
    const createdAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    const resolvedAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    const brierScoreBps = data.readUInt32LE(offset);
    offset += 4;
    const bump = data.readUInt8(offset);

    return {
      agent,
      predictionHash: Buffer.from(predictionHash),
      descriptionHash: Buffer.from(descriptionHash),
      probabilityBps,
      domain,
      outcome,
      deadline,
      createdAt,
      resolvedAt,
      brierScoreBps,
      bump,
    };
  }

  // Fetch agent profile
  async getProfile(agent: PublicKey): Promise<AgentProfileAccount | null> {
    const [pda] = getProfilePDA(agent, this.programId);
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;

    const data = info.data;
    let offset = 8;

    const agentKey = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    const totalPredictions = data.readUInt32LE(offset);
    offset += 4;
    const resolvedPredictions = data.readUInt32LE(offset);
    offset += 4;
    const pendingPredictions = data.readUInt32LE(offset);
    offset += 4;
    const brierNumerator = data.readBigUInt64LE(offset);
    offset += 8;
    const createdAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    const bump = data.readUInt8(offset);

    return {
      agent: agentKey,
      totalPredictions,
      resolvedPredictions,
      pendingPredictions,
      brierNumerator,
      createdAt,
      bump,
    };
  }

  // Compute average Brier score from profile
  static averageBrier(profile: AgentProfileAccount): number | null {
    if (profile.resolvedPredictions === 0) return null;
    return (
      Number(profile.brierNumerator) /
      (profile.resolvedPredictions * 10000)
    );
  }
}
