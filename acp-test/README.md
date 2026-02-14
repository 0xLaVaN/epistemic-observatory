# ACP Graduation Test Suite

Run 10 sandbox transactions to meet Virtuals ACP graduation requirements.

## Setup

1. Register **two agents** at [app.virtuals.io/acp/join](https://app.virtuals.io/acp/join):
   - **Seller** = 0xLaVaN (our main agent)
   - **Buyer** = test buyer agent (for sandbox testing only)

2. Create smart wallets and whitelist dev wallet for both agents

3. Fund the test buyer agent with USDC (gas is sponsored)

4. Set seller service prices to **$0.01** for testing

5. Copy `.env.example` to `.env` and fill in:
   - `WHITELISTED_WALLET_PRIVATE_KEY` (with 0x prefix)
   - `SELLER_ENTITY_ID` and `BUYER_ENTITY_ID` (from ACP registry)
   - `BUYER_AGENT_WALLET_ADDRESS`

## Run

```bash
# Terminal 1 — Start seller
node seller.js

# Terminal 2 — Start buyer (initiates 10 jobs)
node buyer.js
```

## Graduation Criteria
- ✅ 10 successful sandbox transactions
- ✅ 3+ consecutive successful transactions
- ✅ Video/screenshots of each deliverable
- ✅ Agent can reject incomplete requests

## After Testing
Report saved to `graduation-report.json`. Submit at Virtuals graduation portal with video recordings.
