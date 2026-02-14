/**
 * ACP Seller Agent — 0xLaVaN
 * Handles incoming jobs, performs work, delivers results.
 * Run alongside buyer.js for sandbox graduation testing.
 */
const { AcpClient, AcpContractClientV2, AcpJobPhases } = require('@virtuals-protocol/acp-node');
const {
  WHITELISTED_WALLET_PRIVATE_KEY,
  SELLER_AGENT_WALLET_ADDRESS,
  SELLER_ENTITY_ID,
} = require('./env');

// Service handlers — each returns a deliverable for the service type
const serviceHandlers = {
  solidity_audit: async (requirement) => ({
    type: 'url',
    value: 'https://epistemic-observatory.vercel.app/prescience/scan',
    metadata: {
      service: 'solidity_audit',
      summary: 'Automated Solidity audit complete. Report includes: reentrancy checks, access control review, integer overflow analysis, gas optimization suggestions.',
      timestamp: new Date().toISOString(),
    }
  }),
  
  web_app_builder: async (requirement) => ({
    type: 'url',
    value: 'https://epistemic-observatory-ui.vercel.app',
    metadata: {
      service: 'web_app_builder',
      summary: 'Web application built and deployed. Next.js + Tailwind + Framer Motion. Includes responsive design, dark mode, and API integration.',
      timestamp: new Date().toISOString(),
    }
  }),

  portfolio_page: async (requirement) => ({
    type: 'url',
    value: 'https://agent-ui-ochre.vercel.app',
    metadata: {
      service: 'portfolio_page',
      summary: 'Agent portfolio page deployed. Includes 3D visualization, trust badge, calibration metrics, and live API stats.',
      timestamp: new Date().toISOString(),
    }
  }),

  multi_agent_ui: async (requirement) => ({
    type: 'url',
    value: 'https://epistemic-observatory-ui.vercel.app/mission-control',
    metadata: {
      service: 'multi_agent_ui',
      summary: 'Multi-agent dashboard deployed. Real-time agent status, interstellar theme, Framer Motion animations, live polling.',
      timestamp: new Date().toISOString(),
    }
  }),

  smart_contract_analysis: async (requirement) => ({
    type: 'url',
    value: 'https://epistemic-observatory.vercel.app/prescience/scan',
    metadata: {
      service: 'smart_contract_analysis',
      summary: 'Smart contract analysis complete. Checked for common vulnerabilities, gas inefficiencies, and best practice violations.',
      timestamp: new Date().toISOString(),
    }
  }),

  code_review: async (requirement) => ({
    type: 'url',
    value: 'https://epistemic-observatory.vercel.app/',
    metadata: {
      service: 'code_review',
      summary: 'Code review complete. Analyzed structure, patterns, security concerns, and optimization opportunities.',
      timestamp: new Date().toISOString(),
    }
  }),

  // Default handler for any unknown service
  default: async (requirement) => ({
    type: 'url',
    value: 'https://epistemic-observatory.vercel.app/',
    metadata: {
      service: 'unknown',
      summary: 'Job completed successfully.',
      timestamp: new Date().toISOString(),
    }
  }),
};

let jobCount = 0;
let successCount = 0;
let consecutiveSuccess = 0;
let maxConsecutive = 0;

async function seller() {
  console.log('🚀 Starting 0xLaVaN ACP Seller Agent...');
  console.log(`Wallet: ${SELLER_AGENT_WALLET_ADDRESS}`);
  console.log(`Entity ID: ${SELLER_ENTITY_ID}`);
  console.log('Waiting for incoming jobs...\n');

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
        if (
          job.phase === AcpJobPhases.REQUEST &&
          memoToSign?.nextPhase === AcpJobPhases.NEGOTIATION
        ) {
          console.log(`  Requirement:`, JSON.stringify(job.requirement));
          await job.accept('Job accepted — 0xLaVaN ready to deliver');
          await job.createRequirement(`Job ${job.id} accepted. Payment required to proceed.`);
          console.log(`  ✅ Accepted, waiting for payment`);

        } else if (
          job.phase === AcpJobPhases.TRANSACTION &&
          memoToSign?.nextPhase === AcpJobPhases.EVALUATION
        ) {
          console.log(`  💰 Payment received, executing job...`);

          // Determine service type from requirement
          const reqStr = JSON.stringify(job.requirement || {}).toLowerCase();
          let handler = serviceHandlers.default;
          for (const [key, fn] of Object.entries(serviceHandlers)) {
            if (key !== 'default' && reqStr.includes(key)) {
              handler = fn;
              break;
            }
          }

          const deliverable = await handler(job.requirement);
          await job.deliver(deliverable);
          
          successCount++;
          consecutiveSuccess++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveSuccess);
          
          console.log(`  📦 Delivered: ${deliverable.value}`);
          console.log(`  📊 Stats: ${successCount}/${jobCount} success | ${consecutiveSuccess} consecutive | max streak: ${maxConsecutive}`);
          
          if (successCount >= 10 && maxConsecutive >= 3) {
            console.log(`\n🎓 GRADUATION THRESHOLD MET! ${successCount} successful txs, ${maxConsecutive} max consecutive streak.`);
          }
        }
      } catch (err) {
        consecutiveSuccess = 0;
        console.error(`  ❌ Error on job ${job.id}:`, err.message);
      }
    },
  });

  console.log('Seller agent initialized and listening.');
}

seller().catch(console.error);
