/**
 * ACP Test Buyer Agent — Graduation Sprint
 * Runs 10 sequential sandbox transactions against our seller agent.
 * Logs each transaction for graduation evidence.
 */
const { AcpClient, AcpContractClientV2, AcpJobPhases, AcpAgentSort, AcpGraduationStatus, AcpOnlineStatus } = require('@virtuals-protocol/acp-node');
const {
  WHITELISTED_WALLET_PRIVATE_KEY,
  BUYER_AGENT_WALLET_ADDRESS,
  BUYER_ENTITY_ID,
  TEST_SERVICE_KEYWORD,
} = require('./env');
const fs = require('fs');
const path = require('path');

const TOTAL_JOBS = 10;
const SERVICES_TO_TEST = [
  'solidity_audit',
  'smart_contract_analysis',
  'code_review',
  'portfolio_page',
  'web_app_builder',
  'solidity_audit',
  'smart_contract_analysis',
  'code_review',
  'solidity_audit',
  'portfolio_page',
];

const results = [];
let completedJobs = 0;
let resolveCompletion;
const allDone = new Promise(r => resolveCompletion = r);

async function buyer() {
  console.log('🛒 Starting ACP Test Buyer Agent...');
  console.log(`Wallet: ${BUYER_AGENT_WALLET_ADDRESS}`);
  console.log(`Entity ID: ${BUYER_ENTITY_ID}`);
  console.log(`Target: ${TOTAL_JOBS} sandbox transactions\n`);

  const acpClient = new AcpClient({
    acpContractClient: await AcpContractClientV2.build(
      WHITELISTED_WALLET_PRIVATE_KEY,
      BUYER_ENTITY_ID,
      BUYER_AGENT_WALLET_ADDRESS,
    ),
    onNewTask: async (job, memoToSign) => {
      if (
        job.phase === AcpJobPhases.NEGOTIATION &&
        memoToSign?.nextPhase === AcpJobPhases.TRANSACTION
      ) {
        console.log(`  💳 Paying for job ${job.id}...`);
        await job.payAndAcceptRequirement();
        console.log(`  ✅ Payment sent`);
      } else if (
        job.phase === AcpJobPhases.TRANSACTION &&
        memoToSign?.nextPhase === AcpJobPhases.REJECTED
      ) {
        console.log(`  ❌ Job ${job.id} rejected: ${memoToSign?.content}`);
        await memoToSign?.sign(true, 'Accepts rejection');
        results.push({ jobId: job.id, status: 'rejected', timestamp: new Date().toISOString() });
        completedJobs++;
        checkDone();
      } else if (job.phase === AcpJobPhases.COMPLETED) {
        console.log(`  🎉 Job ${job.id} COMPLETED!`);
        console.log(`  📦 Deliverable:`, JSON.stringify(job.deliverable));
        results.push({
          jobId: job.id,
          status: 'completed',
          deliverable: job.deliverable,
          timestamp: new Date().toISOString(),
        });
        completedJobs++;
        console.log(`  📊 Progress: ${completedJobs}/${TOTAL_JOBS}\n`);
        checkDone();
      } else if (job.phase === AcpJobPhases.REJECTED) {
        console.log(`  ❌ Job ${job.id} rejected`);
        results.push({ jobId: job.id, status: 'rejected', timestamp: new Date().toISOString() });
        completedJobs++;
        checkDone();
      }
    }
  });

  // Find our seller agent
  console.log(`🔍 Searching for seller agent with keyword: "${TEST_SERVICE_KEYWORD}"...`);
  const agents = await acpClient.browseAgents(TEST_SERVICE_KEYWORD, {
    sortBy: [AcpAgentSort.SUCCESSFUL_JOB_COUNT],
    topK: 10,
    graduationStatus: AcpGraduationStatus.ALL,
    onlineStatus: AcpOnlineStatus.ALL,
    showHiddenOfferings: true,
  });

  if (!agents || agents.length === 0) {
    console.error('❌ No agents found! Make sure seller agent is registered and online.');
    process.exit(1);
  }

  // Find 0xLaVaN specifically
  const ourAgent = agents.find(a => 
    a.name?.toLowerCase().includes('lavan') || 
    a.name?.toLowerCase().includes('0xlavan')
  ) || agents[0];

  console.log(`✅ Found agent: ${ourAgent.name || 'unknown'}`);
  console.log(`   Offerings: ${ourAgent.jobOfferings?.map(o => o.name).join(', ')}\n`);

  // Run 10 sequential jobs
  for (let i = 0; i < TOTAL_JOBS; i++) {
    const serviceName = SERVICES_TO_TEST[i];
    console.log(`\n🔄 [${i + 1}/${TOTAL_JOBS}] Initiating job: ${serviceName}`);

    // Find the matching offering
    const offering = ourAgent.jobOfferings?.find(o => 
      o.name?.toLowerCase().includes(serviceName)
    ) || ourAgent.jobOfferings?.[0];

    if (!offering) {
      console.error(`  ⚠️ No offering found for ${serviceName}, skipping`);
      continue;
    }

    try {
      const jobId = await offering.initiateJob(
        { service: serviceName, request: `Test job #${i + 1} for ACP graduation` },
        undefined, // no evaluator (skip-evaluation)
        new Date(Date.now() + 1000 * 60 * 10) // 10 min expiry
      );
      console.log(`  📝 Job initiated: ${jobId}`);
      
      // Wait a bit between jobs to avoid rate limits
      if (i < TOTAL_JOBS - 1) {
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (err) {
      console.error(`  ❌ Failed to initiate: ${err.message}`);
      results.push({ jobId: null, status: 'failed', error: err.message, timestamp: new Date().toISOString() });
      completedJobs++;
    }
  }

  console.log('\n⏳ Waiting for all jobs to complete...');
  await allDone;
}

function checkDone() {
  if (completedJobs >= TOTAL_JOBS) {
    // Save results
    const report = {
      timestamp: new Date().toISOString(),
      totalJobs: TOTAL_JOBS,
      completed: results.filter(r => r.status === 'completed').length,
      rejected: results.filter(r => r.status === 'rejected').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
    };
    
    const reportPath = path.join(__dirname, 'graduation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('🎓 GRADUATION TEST COMPLETE');
    console.log('='.repeat(60));
    console.log(`✅ Completed: ${report.completed}/${TOTAL_JOBS}`);
    console.log(`❌ Rejected: ${report.rejected}`);
    console.log(`💥 Failed: ${report.failed}`);
    console.log(`📄 Report saved: ${reportPath}`);
    
    // Check consecutive success
    let maxConsec = 0, curConsec = 0;
    for (const r of results) {
      if (r.status === 'completed') { curConsec++; maxConsec = Math.max(maxConsec, curConsec); }
      else curConsec = 0;
    }
    console.log(`🔥 Max consecutive success: ${maxConsec}`);
    
    if (report.completed >= 10 && maxConsec >= 3) {
      console.log('\n🎓✅ GRADUATION CRITERIA MET — Ready to submit!');
    } else {
      console.log(`\n⚠️ Need ${Math.max(0, 10 - report.completed)} more successful + ${Math.max(0, 3 - maxConsec)} more consecutive`);
    }
    
    resolveCompletion();
    setTimeout(() => process.exit(0), 2000);
  }
}

buyer().catch(console.error);
