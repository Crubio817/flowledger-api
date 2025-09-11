import { getPool, sql } from '../db/pool';

/**
 * Utility for capturing memory atoms across FlowLedger entities
 * Provides consistent memory capture patterns for all entity types
 */

interface MemoryAtomData {
  entity_type: string;
  entity_id: number;
  atom_type: 'decision' | 'risk' | 'preference' | 'status' | 'note';
  content: string;
  source: {
    system: string;
    origin_id: string;
    url: string;
  };
  occurred_at?: string;
  tags?: string[];
}

export async function captureMemoryAtom(orgId: number, atomData: MemoryAtomData): Promise<void> {
  const pool = await getPool();
  
  await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('itemType', sql.VarChar, 'memory')
    .input('itemId', sql.BigInt, atomData.entity_id)
    .input('eventName', sql.VarChar, 'memory.atom.created')
    .input('payloadJson', sql.NVarChar, JSON.stringify({
      ...atomData,
      occurred_at: atomData.occurred_at || new Date().toISOString(),
      tags: atomData.tags || []
    }))
    .query(`
      INSERT INTO app.work_event (org_id, item_type, item_id, event_name, payload_json)
      VALUES (@orgId, @itemType, @itemId, @eventName, @payloadJson)
    `);
}

// Pursuit Memory Capture Helpers
export const pursuitMemory = {
  created: (orgId: number, pursuitId: number, candidateId: number, stage: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'pursuit',
      entity_id: pursuitId,
      atom_type: 'status',
      content: `Pursuit created for candidate ${candidateId} in ${stage} stage`,
      source: {
        system: 'app',
        origin_id: `pursuit:${pursuitId}:created`,
        url: `/pursuits/${pursuitId}`
      }
    }),

  stageChanged: (orgId: number, pursuitId: number, fromStage: string, toStage: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'pursuit',
      entity_id: pursuitId,
      atom_type: 'status',
      content: `Pursuit stage changed from ${fromStage} to ${toStage}`,
      source: {
        system: 'app',
        origin_id: `pursuit:${pursuitId}:stage_change`,
        url: `/pursuits/${pursuitId}`
      },
      tags: ['stage_change', fromStage, toStage]
    }),

  proposalSubmitted: (orgId: number, pursuitId: number, proposalVersion: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'pursuit',
      entity_id: pursuitId,
      atom_type: 'status',
      content: `Proposal ${proposalVersion} submitted to client`,
      source: {
        system: 'app',
        origin_id: `pursuit:${pursuitId}:proposal_submitted`,
        url: `/pursuits/${pursuitId}`
      },
      tags: ['proposal', 'submission']
    }),

  won: (orgId: number, pursuitId: number, details?: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'pursuit',
      entity_id: pursuitId,
      atom_type: 'decision',
      content: `Pursuit won${details ? ` - ${details}` : ''}`,
      source: {
        system: 'app',
        origin_id: `pursuit:${pursuitId}:won`,
        url: `/pursuits/${pursuitId}`
      },
      tags: ['outcome', 'won']
    }),

  lost: (orgId: number, pursuitId: number, reason?: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'pursuit',
      entity_id: pursuitId,
      atom_type: 'decision',
      content: `Pursuit lost${reason ? ` - ${reason}` : ''}`,
      source: {
        system: 'app',
        origin_id: `pursuit:${pursuitId}:lost`,
        url: `/pursuits/${pursuitId}`
      },
      tags: ['outcome', 'lost']
    })
};

// Candidate Memory Capture Helpers
export const candidateMemory = {
  created: (orgId: number, candidateId: number, name: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'candidate',
      entity_id: candidateId,
      atom_type: 'status',
      content: `Candidate profile created for ${name}`,
      source: {
        system: 'app',
        origin_id: `candidate:${candidateId}:created`,
        url: `/candidates/${candidateId}`
      }
    }),

  statusChanged: (orgId: number, candidateId: number, fromStatus: string, toStatus: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'candidate',
      entity_id: candidateId,
      atom_type: 'status',
      content: `Candidate status changed from ${fromStatus} to ${toStatus}`,
      source: {
        system: 'app',
        origin_id: `candidate:${candidateId}:status_change`,
        url: `/candidates/${candidateId}`
      },
      tags: ['status_change', fromStatus, toStatus]
    }),

  noteAdded: (orgId: number, candidateId: number, noteContent: string, noteId?: number) =>
    captureMemoryAtom(orgId, {
      entity_type: 'candidate',
      entity_id: candidateId,
      atom_type: 'note',
      content: noteContent,
      source: {
        system: 'app',
        origin_id: `candidate:${candidateId}:note${noteId ? `:${noteId}` : ''}`,
        url: `/candidates/${candidateId}`
      },
      tags: ['note']
    })
};

// Engagement Memory Capture Helpers
export const engagementMemory = {
  created: (orgId: number, engagementId: number, clientId: number, type: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'engagement',
      entity_id: engagementId,
      atom_type: 'status',
      content: `${type} engagement created for client ${clientId}`,
      source: {
        system: 'app',
        origin_id: `engagement:${engagementId}:created`,
        url: `/engagements/${engagementId}`
      },
      tags: ['creation', type]
    }),

  statusChanged: (orgId: number, engagementId: number, fromStatus: string, toStatus: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'engagement',
      entity_id: engagementId,
      atom_type: 'status',
      content: `Engagement status changed from ${fromStatus} to ${toStatus}`,
      source: {
        system: 'app',
        origin_id: `engagement:${engagementId}:status_change`,
        url: `/engagements/${engagementId}`
      },
      tags: ['status_change', fromStatus, toStatus]
    }),

  milestoneAchieved: (orgId: number, engagementId: number, milestone: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'engagement',
      entity_id: engagementId,
      atom_type: 'status',
      content: `Milestone achieved: ${milestone}`,
      source: {
        system: 'app',
        origin_id: `engagement:${engagementId}:milestone`,
        url: `/engagements/${engagementId}`
      },
      tags: ['milestone']
    })
};

// Communications Memory Capture Helpers
export const commsMemory = {
  threadCreated: (orgId: number, threadId: number, subject: string, participants: number) =>
    captureMemoryAtom(orgId, {
      entity_type: 'comms_thread',
      entity_id: threadId,
      atom_type: 'status',
      content: `Communication thread started: "${subject}" with ${participants} participants`,
      source: {
        system: 'app',
        origin_id: `comms_thread:${threadId}:created`,
        url: `/comms/threads/${threadId}`
      },
      tags: ['thread_start']
    }),

  messageSent: (orgId: number, threadId: number, messageType: string, snippet: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'comms_thread',
      entity_id: threadId,
      atom_type: 'note',
      content: `${messageType} sent: ${snippet.substring(0, 200)}`,
      source: {
        system: 'app',
        origin_id: `comms_thread:${threadId}:message`,
        url: `/comms/threads/${threadId}`
      },
      tags: ['message', messageType]
    }),

  importantDecision: (orgId: number, threadId: number, decision: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'comms_thread',
      entity_id: threadId,
      atom_type: 'decision',
      content: decision,
      source: {
        system: 'app',
        origin_id: `comms_thread:${threadId}:decision`,
        url: `/comms/threads/${threadId}`
      },
      tags: ['decision', 'communication']
    }),

  clientPreference: (orgId: number, threadId: number, preference: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'comms_thread',
      entity_id: threadId,
      atom_type: 'preference',
      content: preference,
      source: {
        system: 'app',
        origin_id: `comms_thread:${threadId}:preference`,
        url: `/comms/threads/${threadId}`
      },
      tags: ['client_preference', 'communication']
    })
};

// Client Memory Capture Helpers
export const clientMemory = {
  created: (orgId: number, clientId: number, name: string) =>
    captureMemoryAtom(orgId, {
      entity_type: 'client',
      entity_id: clientId,
      atom_type: 'status',
      content: `Client profile created: ${name}`,
      source: {
        system: 'app',
        origin_id: `client:${clientId}:created`,
        url: `/clients/${clientId}`
      }
    }),

  statusChanged: (orgId: number, clientId: number, fromActive: boolean, toActive: boolean) =>
    captureMemoryAtom(orgId, {
      entity_type: 'client',
      entity_id: clientId,
      atom_type: 'status',
      content: `Client status changed from ${fromActive ? 'active' : 'prospect'} to ${toActive ? 'active' : 'prospect'}`,
      source: {
        system: 'app',
        origin_id: `client:${clientId}:status_change`,
        url: `/clients/${clientId}`
      },
      tags: ['status_change']
    }),

  noteAdded: (orgId: number, clientId: number, noteContent: string, noteId?: number) =>
    captureMemoryAtom(orgId, {
      entity_type: 'client',
      entity_id: clientId,
      atom_type: 'note',
      content: noteContent,
      source: {
        system: 'app',
        origin_id: `client:${clientId}:note${noteId ? `:${noteId}` : ''}`,
        url: `/clients/${clientId}`
      },
      tags: ['note']
    })
};
