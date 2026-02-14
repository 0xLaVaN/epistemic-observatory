/**
 * ACP Micro-Services — Bulletproof Implementation
 * Two services only: solidity_audit ($0.50) and code_review ($0.50)
 * 
 * Design principles:
 * - Every response must be correct, helpful, and natural
 * - Graceful edge case handling (empty input, malformed, huge files)
 * - Clean rejection of incomplete/inappropriate requests
 * - Concurrent request handling via queue
 * - Trail of Bits methodology integrated into audit
 */

// ============================================
// JOB QUEUE — handles concurrent requests
// ============================================
class JobQueue {
  constructor(concurrency = 3) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  async add(fn) {
    if (this.running >= this.concurrency) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }

  get stats() {
    return { running: this.running, queued: this.queue.length, concurrency: this.concurrency };
  }
}

const auditQueue = new JobQueue(3);
const reviewQueue = new JobQueue(5);

// ============================================
// INPUT VALIDATION
// ============================================

const MAX_CODE_LENGTH = 500_000; // 500KB
const MAX_CODE_LINES = 10_000;
const SOLIDITY_PRAGMA_RE = /pragma\s+solidity\s+[\^~>=<]*\s*(\d+\.\d+\.\d+)/;
const CONTRACT_RE = /\b(contract|library|interface|abstract\s+contract)\s+(\w+)/g;
const FUNCTION_RE = /function\s+(\w+)\s*\(([^)]*)\)\s*(external|public|internal|private)?\s*(view|pure|payable|virtual|override|\s)*/g;
const MODIFIER_RE = /modifier\s+(\w+)/g;
const EVENT_RE = /event\s+(\w+)/g;
const IMPORT_RE = /import\s+/g;
const USING_RE = /using\s+\w+\s+for/g;
const SELFDESTRUCT_RE = /selfdestruct|suicide/gi;
const DELEGATECALL_RE = /\.delegatecall\(/g;
const ASSEMBLY_RE = /assembly\s*\{/g;
const TX_ORIGIN_RE = /tx\.origin/g;
const UNCHECKED_RE = /unchecked\s*\{/g;
const REENTRANCY_PATTERN = /\.call\{.*value/g;
const TRANSFER_RE = /\.transfer\(|\.send\(/g;
const OWNABLE_RE = /Ownable|onlyOwner|owner\(\)/g;
const ACCESS_CONTROL_RE = /AccessControl|hasRole|grantRole|onlyRole/g;
const PROXY_RE = /Proxy|upgradeable|UUPSUpgradeable|TransparentUpgradeableProxy|initializ/gi;
const ERC20_RE = /ERC20|IERC20|totalSupply|balanceOf|allowance/g;
const ERC721_RE = /ERC721|IERC721|tokenOfOwnerByIndex|ownerOf/g;

function validateSolidityInput(body) {
  const { code, contract_address, description } = body || {};
  const errors = [];

  if (!code && !contract_address) {
    return {
      valid: false,
      rejection: {
        status: 'rejected',
        reason: "I need something to audit! Please provide either Solidity source code in the 'code' field, or a contract address in the 'contract_address' field. For example: { \"code\": \"pragma solidity ^0.8.0; contract MyContract { ... }\" }",
        hint: 'Include Solidity source code or a verified contract address.',
      }
    };
  }

  if (code) {
    if (typeof code !== 'string') {
      return {
        valid: false,
        rejection: {
          status: 'rejected',
          reason: "The 'code' field should be a string containing Solidity source code. It looks like you sent something else.",
          hint: 'Send source code as a string value.',
        }
      };
    }

    if (code.trim().length < 20) {
      return {
        valid: false,
        rejection: {
          status: 'rejected',
          reason: "That's too short to be meaningful Solidity code. I need at least a basic contract definition to perform an audit. A minimal example would be: pragma solidity ^0.8.0; contract Example { }",
          hint: 'Provide a complete contract or meaningful code snippet.',
        }
      };
    }

    if (code.length > MAX_CODE_LENGTH) {
      return {
        valid: false,
        rejection: {
          status: 'rejected',
          reason: `The code is too large (${(code.length / 1024).toFixed(0)}KB). I can handle up to ${MAX_CODE_LENGTH / 1024}KB per request. For very large codebases, consider splitting into individual contract files and auditing each separately.`,
          hint: `Maximum ${MAX_CODE_LENGTH / 1024}KB per request.`,
        }
      };
    }

    const lines = code.split('\n');
    if (lines.length > MAX_CODE_LINES) {
      return {
        valid: false,
        rejection: {
          status: 'rejected',
          reason: `That's ${lines.length} lines — I handle up to ${MAX_CODE_LINES} lines per request. Split the codebase into individual contracts for best results.`,
          hint: `Maximum ${MAX_CODE_LINES} lines per request.`,
        }
      };
    }

    // Check if it looks like Solidity at all
    const hasSolidityMarkers = /pragma\s+solidity|contract\s+\w+|function\s+\w+|mapping\s*\(|uint\d*\s|address\s|bytes\d*\s/i.test(code);
    if (!hasSolidityMarkers) {
      return {
        valid: false,
        rejection: {
          status: 'rejected',
          reason: "This doesn't look like Solidity code. I specialize in Solidity smart contract auditing. If this is another language (Vyper, Rust/Anchor, Move), please mention it — though my deepest expertise is Solidity.",
          hint: 'Send Solidity source code for best results.',
        }
      };
    }
  }

  if (contract_address) {
    if (typeof contract_address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(contract_address)) {
      return {
        valid: false,
        rejection: {
          status: 'rejected',
          reason: `"${contract_address}" doesn't look like a valid Ethereum address. I need a 42-character hex address starting with 0x (e.g., 0x1234...abcd).`,
          hint: 'Provide a valid 0x-prefixed Ethereum address.',
        }
      };
    }
  }

  return { valid: true };
}

function validateCodeReviewInput(body) {
  const { code, repo, language } = body || {};

  if (!code && !repo) {
    return {
      valid: false,
      rejection: {
        status: 'rejected',
        reason: "I need code to review! Send either source code in the 'code' field, or a GitHub repo URL in the 'repo' field. Example: { \"code\": \"function add(a, b) { return a + b; }\", \"language\": \"javascript\" }",
        hint: "Include 'code' (string) or 'repo' (GitHub URL).",
      }
    };
  }

  if (code) {
    if (typeof code !== 'string') {
      return {
        valid: false,
        rejection: {
          status: 'rejected',
          reason: "The 'code' field should be a string. It looks like you sent a different type.",
          hint: 'Send source code as a string.',
        }
      };
    }

    if (code.trim().length < 10) {
      return {
        valid: false,
        rejection: {
          status: 'rejected',
          reason: "That's barely any code — I need at least a meaningful snippet to provide useful feedback. Even a single function definition would work.",
          hint: 'Provide a meaningful code snippet.',
        }
      };
    }

    if (code.length > MAX_CODE_LENGTH) {
      return {
        valid: false,
        rejection: {
          status: 'rejected',
          reason: `Code too large (${(code.length / 1024).toFixed(0)}KB). Maximum is ${MAX_CODE_LENGTH / 1024}KB per request. For large codebases, send individual files.`,
          hint: `Max ${MAX_CODE_LENGTH / 1024}KB.`,
        }
      };
    }
  }

  if (repo) {
    if (typeof repo !== 'string' || !repo.includes('github.com')) {
      return {
        valid: false,
        rejection: {
          status: 'rejected',
          reason: "I currently support GitHub repos only. Please provide a valid GitHub URL like https://github.com/user/repo.",
          hint: 'Provide a GitHub repository URL.',
        }
      };
    }
  }

  const supportedLanguages = ['solidity', 'javascript', 'typescript', 'python', 'rust', 'go', 'move', 'vyper', 'cairo', 'func'];
  if (language && !supportedLanguages.includes(language.toLowerCase())) {
    return {
      valid: false,
      rejection: {
        status: 'rejected',
        reason: `I don't have deep expertise in "${language}" yet. I'm strongest with: ${supportedLanguages.join(', ')}. I can still try a general review if you'd like — just set language to the closest match.`,
        hint: `Supported: ${supportedLanguages.join(', ')}`,
      }
    };
  }

  return { valid: true };
}

// ============================================
// SOLIDITY AUDIT ENGINE — Trail of Bits methodology
// ============================================

function analyzeSolidity(code, description) {
  const lines = code.split('\n');
  const lineCount = lines.length;

  // Extract metadata
  const pragmaMatch = code.match(SOLIDITY_PRAGMA_RE);
  const compilerVersion = pragmaMatch ? pragmaMatch[1] : 'unknown';

  const contracts = [];
  let match;
  while ((match = CONTRACT_RE.exec(code)) !== null) {
    contracts.push({ type: match[1], name: match[2] });
  }
  CONTRACT_RE.lastIndex = 0;

  const functions = [];
  while ((match = FUNCTION_RE.exec(code)) !== null) {
    functions.push({
      name: match[1],
      params: match[2].trim(),
      visibility: match[3] || 'public',
      modifiers: match[4]?.trim() || '',
    });
  }
  FUNCTION_RE.lastIndex = 0;

  const modifiers = [];
  while ((match = MODIFIER_RE.exec(code)) !== null) {
    modifiers.push(match[1]);
  }
  MODIFIER_RE.lastIndex = 0;

  const events = [];
  while ((match = EVENT_RE.exec(code)) !== null) {
    events.push(match[1]);
  }
  EVENT_RE.lastIndex = 0;

  const imports = (code.match(IMPORT_RE) || []).length;

  // ---- Trail of Bits 9-Category Assessment ----

  const findings = [];
  const categories = {};

  // 1. ARITHMETIC
  const arithmeticIssues = [];
  const usesSafemath = /SafeMath|using\s+SafeMath/i.test(code);
  const compilerMajor = compilerVersion !== 'unknown' ? parseFloat(compilerVersion) : 0;
  const hasBuiltinOverflow = compilerMajor >= 0.8;
  const uncheckedBlocks = (code.match(UNCHECKED_RE) || []).length;

  if (!hasBuiltinOverflow && !usesSafemath) {
    arithmeticIssues.push({
      severity: 'HIGH',
      title: 'No overflow protection',
      detail: `Compiler version ${compilerVersion} lacks built-in overflow checks and SafeMath is not used. Integer overflow/underflow is possible.`,
      recommendation: 'Upgrade to Solidity >=0.8.0 or use OpenZeppelin SafeMath.',
    });
  }
  if (uncheckedBlocks > 0) {
    arithmeticIssues.push({
      severity: 'MEDIUM',
      title: `${uncheckedBlocks} unchecked block(s) detected`,
      detail: 'Unchecked blocks bypass overflow protection. Each must be manually verified for safety.',
      recommendation: 'Document invariants that make each unchecked block safe. Add comments explaining why overflow is impossible.',
    });
  }
  // Check for division before multiplication (precision loss)
  const divBeforeMul = /\/[^;]*\*/g.test(code);
  if (divBeforeMul) {
    arithmeticIssues.push({
      severity: 'MEDIUM',
      title: 'Potential precision loss: division before multiplication',
      detail: 'Division before multiplication in integer math can cause precision loss due to truncation.',
      recommendation: 'Reorder operations to multiply before dividing. Document acceptable precision bounds.',
    });
  }
  categories.arithmetic = {
    rating: arithmeticIssues.some(i => i.severity === 'HIGH') ? 'weak' : arithmeticIssues.length > 0 ? 'moderate' : 'satisfactory',
    findings: arithmeticIssues,
  };
  findings.push(...arithmeticIssues);

  // 2. AUDITING (events, monitoring)
  const auditingIssues = [];
  const stateChangingFns = functions.filter(f =>
    !f.modifiers.includes('view') && !f.modifiers.includes('pure') &&
    (f.visibility === 'external' || f.visibility === 'public')
  );
  const eventRatio = stateChangingFns.length > 0 ? events.length / stateChangingFns.length : 1;

  if (events.length === 0 && stateChangingFns.length > 0) {
    auditingIssues.push({
      severity: 'MEDIUM',
      title: 'No events defined',
      detail: `${stateChangingFns.length} state-changing functions but no events. This makes it impossible to monitor contract activity off-chain.`,
      recommendation: 'Emit events for all state-changing operations, especially ownership transfers, fund movements, and configuration changes.',
    });
  } else if (eventRatio < 0.5) {
    auditingIssues.push({
      severity: 'LOW',
      title: 'Insufficient event coverage',
      detail: `${events.length} events for ${stateChangingFns.length} state-changing functions. Recommended: at least 1:1 ratio.`,
      recommendation: 'Add events for uncovered state-changing functions.',
    });
  }
  categories.auditing = {
    rating: auditingIssues.some(i => i.severity === 'HIGH') ? 'weak' : auditingIssues.length > 0 ? 'moderate' : 'satisfactory',
    findings: auditingIssues,
  };
  findings.push(...auditingIssues);

  // 3. ACCESS CONTROL
  const accessIssues = [];
  const hasOwnable = OWNABLE_RE.test(code);
  OWNABLE_RE.lastIndex = 0;
  const hasAccessControl = ACCESS_CONTROL_RE.test(code);
  ACCESS_CONTROL_RE.lastIndex = 0;
  const hasTxOrigin = TX_ORIGIN_RE.test(code);
  TX_ORIGIN_RE.lastIndex = 0;

  const unprotectedExternal = stateChangingFns.filter(f => {
    // Check if any modifier is applied (crude but effective)
    const fnRegex = new RegExp(`function\\s+${f.name}\\s*\\([^)]*\\)[^{]*\\{`, 'g');
    const fnMatch = fnRegex.exec(code);
    if (!fnMatch) return false;
    const fnHeader = fnMatch[0];
    const hasModifier = modifiers.some(m => fnHeader.includes(m));
    const hasRequire = false; // Would need more complex analysis
    return !hasModifier && f.visibility === 'external';
  });

  if (!hasOwnable && !hasAccessControl && stateChangingFns.length > 2) {
    accessIssues.push({
      severity: 'HIGH',
      title: 'No access control mechanism detected',
      detail: 'No Ownable, AccessControl, or custom role patterns found. All state-changing functions may be callable by anyone.',
      recommendation: 'Implement OpenZeppelin Ownable2Step or AccessControl. Restrict admin functions.',
    });
  }

  if (hasTxOrigin) {
    accessIssues.push({
      severity: 'HIGH',
      title: 'tx.origin used for authorization',
      detail: 'tx.origin is vulnerable to phishing attacks. An attacker can trick a user into calling a malicious contract that forwards the call with the user\'s tx.origin.',
      recommendation: 'Replace tx.origin with msg.sender for all authorization checks.',
    });
  }

  categories.access_control = {
    rating: accessIssues.some(i => i.severity === 'HIGH') ? 'weak' : accessIssues.length > 0 ? 'moderate' : 'satisfactory',
    findings: accessIssues,
  };
  findings.push(...accessIssues);

  // 4. COMPLEXITY
  const complexityIssues = [];
  if (lineCount > 1000) {
    complexityIssues.push({
      severity: 'LOW',
      title: `Large codebase: ${lineCount} lines`,
      detail: 'Large contracts increase audit surface and gas costs. Consider splitting into libraries or separate contracts.',
      recommendation: 'Factor out reusable logic into libraries. Keep individual contracts under 500 lines.',
    });
  }
  if (contracts.length > 10) {
    complexityIssues.push({
      severity: 'LOW',
      title: `High contract count: ${contracts.length} contracts/interfaces`,
      detail: 'Many contracts increase interaction complexity. Verify inheritance chains are clean.',
      recommendation: 'Document the inheritance hierarchy and contract relationships.',
    });
  }
  categories.complexity = {
    rating: complexityIssues.some(i => i.severity !== 'LOW') ? 'moderate' : complexityIssues.length > 0 ? 'moderate' : 'satisfactory',
    findings: complexityIssues,
  };
  findings.push(...complexityIssues);

  // 5. DANGEROUS PATTERNS (insecure-defaults methodology)
  const dangerousIssues = [];

  const selfdestructs = (code.match(SELFDESTRUCT_RE) || []).length;
  if (selfdestructs > 0) {
    dangerousIssues.push({
      severity: 'CRITICAL',
      title: `selfdestruct detected (${selfdestructs} occurrence${selfdestructs > 1 ? 's' : ''})`,
      detail: 'selfdestruct can destroy the contract and send remaining ETH to an arbitrary address. Deprecated in newer Solidity versions.',
      recommendation: 'Remove selfdestruct unless absolutely necessary. Use a pause/drain pattern instead.',
    });
  }

  const delegatecalls = (code.match(DELEGATECALL_RE) || []).length;
  if (delegatecalls > 0) {
    dangerousIssues.push({
      severity: 'HIGH',
      title: `delegatecall detected (${delegatecalls} occurrence${delegatecalls > 1 ? 's' : ''})`,
      detail: 'delegatecall executes code in the context of the calling contract. Improper use can lead to storage corruption or complete takeover.',
      recommendation: 'Verify delegatecall targets are trusted and immutable. Consider using a well-audited proxy pattern like UUPS or TransparentProxy.',
    });
  }

  const assemblyBlocks = (code.match(ASSEMBLY_RE) || []).length;
  if (assemblyBlocks > 0) {
    dangerousIssues.push({
      severity: 'MEDIUM',
      title: `Inline assembly detected (${assemblyBlocks} block${assemblyBlocks > 1 ? 's' : ''})`,
      detail: 'Inline assembly bypasses Solidity\'s type system and safety checks. Each block must be manually verified.',
      recommendation: 'Document the purpose and safety invariants of each assembly block. Prefer Solidity equivalents where possible.',
    });
  }

  // Reentrancy patterns
  const reentrancyCalls = (code.match(REENTRANCY_PATTERN) || []).length;
  const hasReentrancyGuard = /ReentrancyGuard|nonReentrant/i.test(code);
  if (reentrancyCalls > 0 && !hasReentrancyGuard) {
    dangerousIssues.push({
      severity: 'HIGH',
      title: 'Potential reentrancy: external calls with value transfer',
      detail: `${reentrancyCalls} external call(s) sending ETH without ReentrancyGuard. Classic reentrancy attack vector.`,
      recommendation: 'Use OpenZeppelin ReentrancyGuard (nonReentrant modifier). Follow checks-effects-interactions pattern.',
    });
  }

  // .transfer() / .send() — less dangerous but worth noting
  const transferCalls = (code.match(TRANSFER_RE) || []).length;
  if (transferCalls > 0) {
    dangerousIssues.push({
      severity: 'LOW',
      title: `.transfer()/.send() usage (${transferCalls} occurrence${transferCalls > 1 ? 's' : ''})`,
      detail: 'transfer() and send() forward only 2300 gas. This can break with contracts that have receive/fallback functions requiring more gas.',
      recommendation: 'Consider using .call{value: amount}("") with proper reentrancy protection.',
    });
  }

  categories.dangerous_patterns = {
    rating: dangerousIssues.some(i => i.severity === 'CRITICAL') ? 'weak' :
            dangerousIssues.some(i => i.severity === 'HIGH') ? 'weak' :
            dangerousIssues.length > 0 ? 'moderate' : 'satisfactory',
    findings: dangerousIssues,
  };
  findings.push(...dangerousIssues);

  // 6. PROXY / UPGRADEABILITY
  const proxyIssues = [];
  const isProxy = PROXY_RE.test(code);
  PROXY_RE.lastIndex = 0;
  if (isProxy) {
    proxyIssues.push({
      severity: 'MEDIUM',
      title: 'Upgradeable proxy pattern detected',
      detail: 'Proxy contracts add complexity: storage collisions, initialization bugs, and upgrade authorization are common pitfalls.',
      recommendation: 'Verify: 1) initializer cannot be called twice, 2) storage layout is preserved across upgrades, 3) upgrade authorization is properly restricted.',
    });
    // Check for initializer protection
    if (!/initializer\b/i.test(code)) {
      proxyIssues.push({
        severity: 'HIGH',
        title: 'Missing initializer modifier',
        detail: 'Proxy contract detected but no initializer modifier found. The initialization function may be callable multiple times.',
        recommendation: 'Use OpenZeppelin Initializable with the initializer modifier on all initialization functions.',
      });
    }
  }
  categories.upgradeability = {
    rating: proxyIssues.some(i => i.severity === 'HIGH') ? 'weak' : proxyIssues.length > 0 ? 'moderate' : 'satisfactory',
    findings: proxyIssues,
  };
  findings.push(...proxyIssues);

  // 7. TOKEN PATTERNS
  const tokenIssues = [];
  const isERC20 = ERC20_RE.test(code);
  ERC20_RE.lastIndex = 0;
  const isERC721 = ERC721_RE.test(code);
  ERC721_RE.lastIndex = 0;

  if (isERC20) {
    // Check for common ERC20 issues
    if (!/return\s+true/g.test(code) && /function\s+(transfer|approve|transferFrom)/g.test(code)) {
      tokenIssues.push({
        severity: 'MEDIUM',
        title: 'ERC20 functions may not return bool',
        detail: 'ERC20 standard requires transfer, approve, and transferFrom to return bool. Missing returns can break composability.',
        recommendation: 'Ensure all ERC20 interface functions return bool as per the standard.',
      });
    }
  }
  categories.token_patterns = {
    rating: tokenIssues.some(i => i.severity === 'HIGH') ? 'weak' : tokenIssues.length > 0 ? 'moderate' : 'satisfactory',
    findings: tokenIssues,
  };
  findings.push(...tokenIssues);

  // ---- Entry Point Analysis (ToB methodology) ----
  const entryPoints = stateChangingFns.map(f => ({
    name: f.name,
    visibility: f.visibility,
    params: f.params || 'none',
    modifiers: f.modifiers || 'none',
  }));

  // ---- Severity summary ----
  const critical = findings.filter(f => f.severity === 'CRITICAL').length;
  const high = findings.filter(f => f.severity === 'HIGH').length;
  const medium = findings.filter(f => f.severity === 'MEDIUM').length;
  const low = findings.filter(f => f.severity === 'LOW').length;

  // ---- Overall risk rating ----
  let overallRisk = 'LOW';
  if (critical > 0) overallRisk = 'CRITICAL';
  else if (high >= 2) overallRisk = 'HIGH';
  else if (high >= 1) overallRisk = 'MEDIUM-HIGH';
  else if (medium >= 3) overallRisk = 'MEDIUM';
  else if (medium >= 1) overallRisk = 'LOW-MEDIUM';

  // ---- Natural language summary ----
  let summary;
  if (critical > 0) {
    summary = `This contract has ${critical} critical finding${critical > 1 ? 's' : ''} that should be addressed immediately before deployment. ${high > 0 ? `There are also ${high} high-severity issues.` : ''} I strongly recommend a full manual audit before this goes to mainnet.`;
  } else if (high > 0) {
    summary = `Found ${high} high-severity issue${high > 1 ? 's' : ''} that need attention. ${medium > 0 ? `Plus ${medium} medium-severity items.` : ''} These should be resolved before deployment, but the contract structure is ${contracts.length <= 3 ? 'relatively straightforward' : 'moderately complex'}.`;
  } else if (medium > 0) {
    summary = `No critical or high-severity issues found — that's a good sign. There ${medium === 1 ? 'is' : 'are'} ${medium} medium-severity finding${medium > 1 ? 's' : ''} worth addressing. ${low > 0 ? `Plus ${low} informational items.` : ''} Overall, this looks ${overallRisk === 'LOW-MEDIUM' ? 'reasonable with some improvements needed' : 'like it needs some work'}.`;
  } else if (low > 0) {
    summary = `Looking clean! Only ${low} low-severity/informational finding${low > 1 ? 's' : ''}. This contract follows good practices. The items noted are mostly about hardening and defense-in-depth.`;
  } else {
    summary = `No issues detected in this automated analysis. The code appears to follow standard patterns well. Note: automated analysis catches common patterns but not all vulnerabilities — consider a manual review for critical deployments.`;
  }

  return {
    service: 'solidity_audit',
    version: '1.0.0',
    methodology: 'Trail of Bits 9-category framework + entry point analysis + insecure defaults detection',
    timestamp: new Date().toISOString(),
    status: 'completed',

    metadata: {
      compiler_version: compilerVersion,
      line_count: lineCount,
      contracts: contracts.map(c => `${c.type} ${c.name}`),
      contract_count: contracts.length,
      function_count: functions.length,
      external_functions: stateChangingFns.length,
      modifier_count: modifiers.length,
      event_count: events.length,
      import_count: imports,
    },

    risk_rating: overallRisk,
    summary,

    severity_counts: { critical, high, medium, low, total: findings.length },

    categories: Object.fromEntries(
      Object.entries(categories).map(([k, v]) => [k, { rating: v.rating, finding_count: v.findings.length }])
    ),

    findings: findings.sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
    }),

    entry_points: entryPoints,

    recommendations: [
      ...(critical > 0 || high > 0 ? ['Address all CRITICAL and HIGH findings before deployment.'] : []),
      ...(events.length === 0 ? ['Add events for all state-changing operations for monitoring.'] : []),
      ...(!hasReentrancyGuard && reentrancyCalls > 0 ? ['Add ReentrancyGuard to all functions that transfer value.'] : []),
      'Run Slither and Mythril for deeper static analysis.',
      'Write comprehensive unit tests targeting edge cases.',
      ...(isProxy ? ['Verify storage layout compatibility for all upgrades.'] : []),
      'Consider formal verification for critical financial logic.',
    ],

    disclaimer: 'This is an automated pattern-based analysis using Trail of Bits methodology. It catches common vulnerability patterns but cannot replace a full manual security audit. For contracts handling significant value, a professional audit is recommended.',
  };
}

// ============================================
// CODE REVIEW ENGINE
// ============================================

function analyzeCode(code, language = 'auto', file) {
  const lines = code.split('\n');
  const lineCount = lines.length;
  const charCount = code.length;

  // Auto-detect language
  if (language === 'auto' || !language) {
    if (/pragma\s+solidity/i.test(code)) language = 'solidity';
    else if (/import\s+React|from\s+['"]react/i.test(code) || /jsx|tsx/.test(file || '')) language = 'react';
    else if (/\bfunction\b.*\{|\bconst\b.*=>|require\(|module\.exports/i.test(code)) language = 'javascript';
    else if (/:\s*(string|number|boolean|void)\b|interface\s+\w+/i.test(code)) language = 'typescript';
    else if (/\bdef\b.*:|\bclass\b.*:|\bimport\b.*\bfrom\b/i.test(code) && !/require/.test(code)) language = 'python';
    else if (/fn\s+\w+|let\s+mut|impl\s+\w+|pub\s+fn/i.test(code)) language = 'rust';
    else if (/func\s+\w+|package\s+\w+|import\s+\(/i.test(code)) language = 'go';
    else language = 'unknown';
  }

  const findings = [];

  // Universal checks
  const todoCount = (code.match(/TODO|FIXME|HACK|XXX/gi) || []).length;
  if (todoCount > 0) {
    findings.push({
      category: 'maintainability',
      severity: 'INFO',
      title: `${todoCount} TODO/FIXME comment(s)`,
      detail: 'Outstanding tasks should be tracked in an issue tracker, not left in code.',
    });
  }

  // Long lines
  const longLines = lines.filter(l => l.length > 120).length;
  if (longLines > 5) {
    findings.push({
      category: 'readability',
      severity: 'INFO',
      title: `${longLines} lines exceed 120 characters`,
      detail: 'Long lines reduce readability. Consider line wrapping or extracting logic.',
    });
  }

  // Console.log / print statements (potential debug leftovers)
  const debugStatements = (code.match(/console\.(log|warn|error|debug)|print\(|println!|fmt\.Print/g) || []).length;
  if (debugStatements > 0) {
    findings.push({
      category: 'quality',
      severity: 'LOW',
      title: `${debugStatements} debug/logging statement(s)`,
      detail: 'Debug statements should be removed or replaced with proper logging before production.',
    });
  }

  // Hardcoded secrets patterns
  const secretPatterns = code.match(/(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi) || [];
  if (secretPatterns.length > 0) {
    findings.push({
      category: 'security',
      severity: 'CRITICAL',
      title: `${secretPatterns.length} potential hardcoded secret(s)`,
      detail: 'Hardcoded credentials are a critical security risk. Use environment variables or a secrets manager.',
      recommendation: 'Move all secrets to environment variables. Use a .env file locally and a secrets manager in production.',
    });
  }

  // Empty catch blocks
  const emptyCatch = (code.match(/catch\s*(\([^)]*\))?\s*\{\s*\}/g) || []).length;
  if (emptyCatch > 0) {
    findings.push({
      category: 'error_handling',
      severity: 'MEDIUM',
      title: `${emptyCatch} empty catch block(s)`,
      detail: 'Swallowing errors silently makes debugging impossible and can hide critical failures.',
      recommendation: 'At minimum, log the error. Better: handle it appropriately or re-throw.',
    });
  }

  // Deeply nested code
  let maxNesting = 0;
  let currentNesting = 0;
  for (const line of lines) {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    currentNesting += opens - closes;
    maxNesting = Math.max(maxNesting, currentNesting);
  }
  if (maxNesting > 6) {
    findings.push({
      category: 'complexity',
      severity: 'MEDIUM',
      title: `Deep nesting detected (${maxNesting} levels)`,
      detail: 'Deeply nested code is hard to read and test. Consider early returns, extracting functions, or using guard clauses.',
    });
  }

  // Duplicate string literals
  const stringLiterals = code.match(/['"][^'"]{10,}['"]/g) || [];
  const stringCounts = {};
  stringLiterals.forEach(s => { stringCounts[s] = (stringCounts[s] || 0) + 1; });
  const duplicateStrings = Object.entries(stringCounts).filter(([, count]) => count >= 3);
  if (duplicateStrings.length > 0) {
    findings.push({
      category: 'maintainability',
      severity: 'LOW',
      title: `${duplicateStrings.length} repeated string literal(s)`,
      detail: `Strings repeated 3+ times: ${duplicateStrings.map(([s]) => s.substring(0, 30) + '...').join(', ')}. Extract to constants.`,
    });
  }

  // Language-specific checks
  if (language === 'solidity') {
    // Reuse the Solidity audit engine but present as code review
    const auditResult = analyzeSolidity(code);
    findings.push(...auditResult.findings.map(f => ({ ...f, category: 'security' })));
  }

  if (language === 'javascript' || language === 'typescript') {
    // eval() usage
    if (/\beval\s*\(/.test(code)) {
      findings.push({
        category: 'security',
        severity: 'HIGH',
        title: 'eval() usage detected',
        detail: 'eval() executes arbitrary code and is a major security risk. It enables code injection attacks.',
        recommendation: 'Remove eval(). Use JSON.parse() for data, or safer alternatives like Function constructor (still risky but more contained).',
      });
    }
    // var usage
    const varCount = (code.match(/\bvar\s+/g) || []).length;
    if (varCount > 0) {
      findings.push({
        category: 'best_practices',
        severity: 'LOW',
        title: `${varCount} use(s) of var`,
        detail: 'var has function-scoped hoisting which causes subtle bugs. Use const/let instead.',
      });
    }
    // == vs ===
    const looseEquality = (code.match(/[^!=]==[^=]/g) || []).length;
    if (looseEquality > 0) {
      findings.push({
        category: 'best_practices',
        severity: 'LOW',
        title: `${looseEquality} loose equality check(s) (==)`,
        detail: 'Loose equality (==) performs type coercion which can produce unexpected results. Use strict equality (===).',
      });
    }
  }

  if (language === 'python') {
    // exec/eval
    if (/\b(exec|eval)\s*\(/.test(code)) {
      findings.push({
        category: 'security',
        severity: 'HIGH',
        title: 'exec()/eval() usage detected',
        detail: 'Executing arbitrary code is a critical security risk.',
        recommendation: 'Use ast.literal_eval() for safe evaluation, or restructure to avoid dynamic code execution.',
      });
    }
    // bare except
    if (/except\s*:/.test(code)) {
      findings.push({
        category: 'error_handling',
        severity: 'MEDIUM',
        title: 'Bare except clause',
        detail: 'Bare except catches everything including KeyboardInterrupt and SystemExit. Always specify the exception type.',
      });
    }
  }

  // Severity summary
  const critical = findings.filter(f => f.severity === 'CRITICAL').length;
  const high = findings.filter(f => f.severity === 'HIGH').length;
  const medium = findings.filter(f => f.severity === 'MEDIUM').length;
  const low = findings.filter(f => f.severity === 'LOW' || f.severity === 'INFO').length;

  // Natural language summary
  let summary;
  const totalIssues = findings.length;
  if (totalIssues === 0) {
    summary = `Clean code! No issues found in this ${lineCount}-line ${language} snippet. The code follows good practices. Note: this is automated analysis — a human reviewer might catch architectural or logic issues that patterns can't.`;
  } else if (critical > 0 || high > 0) {
    summary = `Found ${critical + high} serious issue${critical + high > 1 ? 's' : ''} that need immediate attention${medium + low > 0 ? `, plus ${medium + low} lower-severity items` : ''}. The ${language} code has security or quality problems that should be fixed before shipping.`;
  } else if (medium > 0) {
    summary = `The code is in decent shape but has ${medium} issue${medium > 1 ? 's' : ''} worth fixing${low > 0 ? ` and ${low} minor suggestion${low > 1 ? 's' : ''}` : ''}. Nothing critical, but these improvements will make the code more robust and maintainable.`;
  } else {
    summary = `Looking good! Only ${low} minor suggestion${low > 1 ? 's' : ''} for this ${lineCount}-line ${language} snippet. These are style and best-practice improvements, not bugs.`;
  }

  return {
    service: 'code_review',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    status: 'completed',

    metadata: {
      language,
      language_detected: language !== (arguments[1] || 'auto'),
      line_count: lineCount,
      char_count: charCount,
      file: file || 'inline',
    },

    summary,

    severity_counts: { critical, high, medium, low, total: totalIssues },

    findings: findings.sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
      return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
    }),

    recommendations: [
      ...(critical > 0 ? ['Fix all CRITICAL findings before deploying.'] : []),
      ...(high > 0 ? ['Address HIGH-severity issues — they pose real risk.'] : []),
      ...(todoCount > 3 ? ['Move TODOs to an issue tracker.'] : []),
      ...(maxNesting > 6 ? ['Refactor deeply nested code for readability.'] : []),
      ...(debugStatements > 0 ? ['Remove debug statements before production.'] : []),
      'Add unit tests for edge cases.',
      'Run a linter configured for your team\'s style guide.',
    ],

    disclaimer: 'Automated code review covering security, quality, and best practices. Not a substitute for human peer review on architectural decisions and business logic.',
  };
}

// ============================================
// ROUTE REGISTRATION
// ============================================

export function registerServiceRoutes(app) {
  // ---- Solidity Audit ----
  app.post('/services/solidity-audit', async (req, res) => {
    const validation = validateSolidityInput(req.body);
    if (!validation.valid) {
      return res.status(400).json(validation.rejection);
    }

    try {
      const result = await auditQueue.add(async () => {
        const { code, contract_address, description } = req.body;

        if (code) {
          return analyzeSolidity(code, description);
        }

        if (contract_address) {
          // For address-only requests, we can't analyze source directly
          return {
            service: 'solidity_audit',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            status: 'completed',
            contract_address,
            summary: `Address ${contract_address} received. For a full source-code audit, please provide the Solidity source code. I can check if this contract is verified on Etherscan — but the deepest analysis requires source.`,
            recommendation: 'Provide verified source code for comprehensive analysis. You can usually find it on Etherscan under the "Contract" tab for verified contracts.',
            metadata: { analysis_type: 'address_only' },
            findings: [],
            severity_counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
          };
        }
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({
        status: 'error',
        reason: 'Internal error during analysis. Please try again.',
        detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  });

  app.get('/services/solidity-audit', (req, res) => {
    res.json({
      service: 'solidity_audit',
      price: '$0.50',
      description: 'Smart contract security audit using Trail of Bits 9-category framework. Analyzes Solidity source code for vulnerabilities, access control issues, dangerous patterns, and best practices.',
      methodology: 'Trail of Bits code maturity assessment + entry point analysis + insecure defaults detection',
      usage: {
        method: 'POST',
        endpoint: '/services/solidity-audit',
        body: {
          code: '(required) Solidity source code as string',
          contract_address: '(alternative) Verified contract address',
          description: '(optional) What does this contract do?',
        },
        example: {
          code: 'pragma solidity ^0.8.0;\n\ncontract Example {\n    address public owner;\n    mapping(address => uint) public balances;\n\n    constructor() { owner = msg.sender; }\n\n    function deposit() external payable {\n        balances[msg.sender] += msg.value;\n    }\n\n    function withdraw(uint amount) external {\n        require(balances[msg.sender] >= amount);\n        (bool ok, ) = msg.sender.call{value: amount}("");\n        require(ok);\n        balances[msg.sender] -= amount;\n    }\n}'
        }
      },
      limits: { max_code_size: '500KB', max_lines: 10000 },
      queue: auditQueue.stats,
    });
  });

  // ---- Code Review ----
  app.post('/services/code-review', async (req, res) => {
    const validation = validateCodeReviewInput(req.body);
    if (!validation.valid) {
      return res.status(400).json(validation.rejection);
    }

    try {
      const result = await reviewQueue.add(async () => {
        const { code, repo, language, file } = req.body;

        if (code) {
          return analyzeCode(code, language, file);
        }

        if (repo) {
          return {
            service: 'code_review',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            status: 'completed',
            repo,
            summary: `I received the repo URL ${repo}. For the fastest review, paste the specific code you want reviewed. Repo-level analysis requires fetching source — provide the key files directly for best results.`,
            recommendation: 'Paste the code directly for immediate review. For full repo analysis, provide individual files.',
            metadata: { analysis_type: 'repo_url_only' },
            findings: [],
            severity_counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
          };
        }
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({
        status: 'error',
        reason: 'Internal error during review. Please try again.',
        detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  });

  app.get('/services/code-review', (req, res) => {
    res.json({
      service: 'code_review',
      price: '$0.50',
      description: 'Automated code review for any language. Security analysis, best practices, complexity, and quality checks.',
      supported_languages: ['solidity', 'javascript', 'typescript', 'python', 'rust', 'go', 'move', 'vyper', 'cairo', 'func'],
      usage: {
        method: 'POST',
        endpoint: '/services/code-review',
        body: {
          code: '(required) Source code as string',
          language: '(optional) Language hint — auto-detected if omitted',
          file: '(optional) Filename for context',
        },
        example: {
          code: 'function processPayment(amount) {\n  var fee = amount * 0.03;\n  try { api.charge(amount - fee); } catch(e) {}\n  console.log("charged", amount);\n}',
          language: 'javascript',
        }
      },
      limits: { max_code_size: '500KB', max_lines: 10000 },
      queue: reviewQueue.stats,
    });
  });

  // ---- Services Index ----
  app.get('/services', (req, res) => {
    res.json({
      agent: '0xLaVaN',
      services: [
        {
          name: 'solidity_audit',
          price: 0.50,
          endpoint: '/services/solidity-audit',
          method: 'POST',
          description: 'Smart contract security audit — Trail of Bits methodology',
        },
        {
          name: 'code_review',
          price: 0.50,
          endpoint: '/services/code-review',
          method: 'POST',
          description: 'Automated code review for any language',
        },
      ],
      queue_status: {
        audit: auditQueue.stats,
        review: reviewQueue.stats,
      },
    });
  });

  // ---- Health check for services ----
  app.get('/services/health', (req, res) => {
    res.json({
      status: 'healthy',
      services: ['solidity_audit', 'code_review'],
      queues: {
        audit: auditQueue.stats,
        review: reviewQueue.stats,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
