import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SIGNALS_DIR = '/data/workspace-shared/signals';

const AGENTS = [
  { id: 'quaczar', name: 'Quaczar', emoji: '🌋', role: 'Orchestrator — routes tasks, manages collective rhythm' },
  { id: 'tars', name: 'TARS', emoji: '🛰️', role: 'Research & Intelligence — web scanning, data synthesis' },
  { id: 'case', name: 'CASE', emoji: '🌊', role: 'Market Analysis — crypto signals, risk assessment' },
  { id: 'gargantua', name: 'Gargantua', emoji: '🕳️', role: 'Deep Reasoning — complex analysis, calibration scoring' },
  { id: 'endurance', name: 'Endurance', emoji: '🚀', role: 'Builder — code, deploy, infrastructure' },
];

function readSignalFiles() {
  const agentStatuses = {};

  for (const agent of AGENTS) {
    agentStatuses[agent.id] = {
      ...agent,
      status: 'idle',
      lastActivity: null,
      recentActions: [],
    };
  }

  try {
    if (!fs.existsSync(SIGNALS_DIR)) {
      return agentStatuses;
    }

    const files = fs.readdirSync(SIGNALS_DIR).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(SIGNALS_DIR, file), 'utf8'));
        const agentId = content.agent?.toLowerCase() || file.replace('.json', '').toLowerCase();
        
        if (agentStatuses[agentId]) {
          agentStatuses[agentId].status = content.status || 'active';
          agentStatuses[agentId].lastActivity = content.timestamp || content.lastActivity || new Date().toISOString();
          if (content.actions) {
            agentStatuses[agentId].recentActions = content.actions.slice(-3);
          }
          if (content.message) {
            agentStatuses[agentId].recentActions.push({
              action: content.message,
              timestamp: content.timestamp || new Date().toISOString(),
            });
          }
        }
      } catch (e) { /* skip bad files */ }
    }
  } catch (e) { /* signals dir not available */ }

  return agentStatuses;
}

export async function GET() {
  const statuses = readSignalFiles();
  return NextResponse.json({
    agents: Object.values(statuses),
    timestamp: new Date().toISOString(),
    collective: '0xLaVaN',
  });
}
