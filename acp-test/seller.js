/**
 * ACP Seller Agent — 0xLaVaN
 * Handles incoming jobs for solidity_audit and code_review.
 * Calls our own API endpoints for actual analysis, returns real deliverables.
 */
const { AcpClient, AcpContractClientV2, AcpJobPhases } = require('@virtuals-protocol/acp-node');
const https = require('https');
const {
  WHITELISTED_WALLET_PRIVATE_KEY,
  SELLER_AGENT_WALLET_ADDRESS,
  SELLER_ENTITY_ID,
} = require('./env');

const API_BASE = 'https://epistemic-observatory.vercel.app';

// Call our own API to perform real work
async function callService(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(endpoint, API_BASE);
    
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch (e) {
          resolve({ status: res.statusCode, body: { error: 'Failed to parse response' } });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(data);
    req.end();
  });
}

let jobCount = 0;
let successCount = 0;
let consecutiveSuccess = 0;
let maxConsecutive = 0;

async function seller() {
  console.log('🚀 Starting 0xLaVaN ACP Seller Agent');
  console.log(`   Wallet: ${SELLER_AGENT_WALLET_ADDRESS}`);
  console.log(`   Entity: ${SELLER_ENTITY_ID}`);
  console.log(`   Services: solidity_audit, code_review`);
  console.log('   Waiting for jobs...\n');

  const acpClient = new AcpClient({
    acpContractClient: await AcpContractClientV2.build(
      WHITELISTED_WALLET_PRIVATE_KEY,
      SELLER_ENTITY_ID,
      SELLER_AGENT_WALLET_ADDRESS,
    ),
    onNewTask: async (job, memoToSign) => {
      jobCount++;
      console.log(`\n📋 [Job #${jobCount}] ID: ${job.id} | Phase: ${job.phase}`);

      try {
        // PHASE 1: REQUEST → Accept or reject
        if (
          job.phase === AcpJobPhases.REQUEST &&
          memoToSign?.nextPhase === AcpJobPhases.NEGOTIATION
        ) {
          const req = job.requirement || {};
          console.log(`   Requirement:`, JSON.stringify(req));

          // Validate the request — reject incomplete/inappropriate ones
          const service = detectService(req);
          if (!service) {
            console.log(`   ❌ Rejecting: can't determine service type`);
            await job.reject(
              "I couldn't determine which service you need. Please specify 'solidity_audit' or 'code_review' in your request, and include the relevant code or contract address."
            );
            return;
          }

          const validation = validateRequest(service, req);
          if (!validation.valid) {
            console.log(`   ❌ Rejecting: ${validation.reason}`);
            await job.reject(validation.reason);
            return;
          }

          await job.accept(`Got it — I'll run a ${service} for you. Payment required to proceed.`);
          await job.createRequirement(`Job ${job.id} accepted for ${service}. Please confirm payment to start the analysis.`);
          console.log(`   ✅ Accepted (${service}), awaiting payment`);

        // PHASE 2: TRANSACTION → Payment received, do the work
        } else if (
          job.phase === AcpJobPhases.TRANSACTION &&
          memoToSign?.nextPhase === AcpJobPhases.EVALUATION
        ) {
          console.log(`   💰 Payment received, executing...`);
          const req = job.requirement || {};
          const service = detectService(req);

          let result;
          if (service === 'solidity_audit') {
            const apiRes = await callService('/services/solidity-audit', {
              code: req.code || req.source || req.solidity_code,
              contract_address: req.contract_address || req.address,
              description: req.description,
            });
            result = apiRes.body;
          } else if (service === 'code_review') {
            const apiRes = await callService('/services/code-review', {
              code: req.code || req.source,
              language: req.language,
              file: req.file || req.filename,
            });
            result = apiRes.body;
          }

          // Deliver
          const deliverable = {
            type: 'url',
            value: `${API_BASE}/services/${service === 'solidity_audit' ? 'solidity-audit' : 'code-review'}`,
            metadata: {
              service,
              status: result?.status || 'completed',
              risk_rating: result?.risk_rating,
              finding_count: result?.severity_counts?.total || 0,
              summary: result?.summary || 'Analysis complete.',
              full_report: result,
              timestamp: new Date().toISOString(),
            }
          };

          await job.deliver(deliverable);

          successCount++;
          consecutiveSuccess++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveSuccess);

          console.log(`   📦 Delivered: ${result?.severity_counts?.total || 0} findings`);
          console.log(`   📊 ${successCount}/${jobCount} success | streak: ${consecutiveSuccess} | best: ${maxConsecutive}`);

          if (successCount >= 10 && maxConsecutive >= 3) {
            console.log(`\n   🎓 GRADUATION THRESHOLD MET!`);
          }
        }
      } catch (err) {
        consecutiveSuccess = 0;
        console.error(`   ❌ Error: ${err.message}`);
        // Try to reject gracefully
        try {
          await job.reject(`Sorry, I hit an error processing this job: ${err.message}. Please try again.`);
        } catch (_) {}
      }
    },
  });

  console.log('Seller initialized and listening.\n');
}

function detectService(req) {
  const str = JSON.stringify(req).toLowerCase();
  if (str.includes('solidity_audit') || str.includes('solidity audit') || str.includes('audit')) return 'solidity_audit';
  if (str.includes('code_review') || str.includes('code review') || str.includes('review')) return 'code_review';
  if (req.code && /pragma\s+solidity/i.test(req.code)) return 'solidity_audit';
  if (req.code) return 'code_review';
  if (req.contract_address || req.address) return 'solidity_audit';
  return null;
}

function validateRequest(service, req) {
  if (service === 'solidity_audit') {
    const code = req.code || req.source || req.solidity_code;
    const addr = req.contract_address || req.address;
    if (!code && !addr) {
      return { valid: false, reason: "I need Solidity source code or a contract address to audit. Please include 'code' (Solidity source) or 'contract_address' (0x...) in your request." };
    }
    if (code && code.length > 500000) {
      return { valid: false, reason: "That code is too large for a single audit (>500KB). Please split into individual contracts." };
    }
  }
  if (service === 'code_review') {
    const code = req.code || req.source;
    if (!code && !req.repo) {
      return { valid: false, reason: "I need code to review. Please include 'code' (source code string) or 'repo' (GitHub URL) in your request." };
    }
  }
  return { valid: true };
}

seller().catch(console.error);
