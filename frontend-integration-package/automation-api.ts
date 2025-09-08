// Automation API Client
export interface AutomationRule {
  rule_id?: number;
  name: string;
  is_enabled: boolean;
  trigger: {
    event_types: string[];
    schedule?: {
      cron?: string;
      rrule?: string;
      timezone?: string;
    };
  };
  conditions?: any; // JSON-logic
  throttle?: {
    per: 'minute' | 'hour' | 'day';
    limit: number;
  };
  actions: AutomationAction[];
  created_by?: number;
  updated_at?: string;
  created_at?: string;
}

export interface AutomationAction {
  type: string;
  params: Record<string, any>;
}

export interface AutomationEvent {
  event_id?: string;
  type: string;
  occurred_at?: string;
  tenant_id: number;
  aggregate_type?: string;
  aggregate_id?: number;
  payload?: any;
  source: string;
  correlation_id?: string;
  dedupe_key?: string;
}

export interface AutomationLog {
  log_id?: number;
  event_id?: string;
  rule_id?: number;
  outcome: string;
  started_at?: string;
  finished_at?: string;
  metrics_json?: string;
  error_message?: string;
  created_at?: string;
  rule_name?: string;
}

export interface AutomationTestResult {
  matches: boolean;
  reason?: string;
  actions?: AutomationAction[];
  evaluation?: {
    trigger_matched: boolean;
    conditions_passed: boolean;
    throttle_ok: boolean;
  };
}

// API Functions
export async function getAutomationRules(orgId: number): Promise<AutomationRule[]> {
  const response = await fetch(`/api/automation/rules?org_id=${orgId}`);
  if (!response.ok) throw new Error('Failed to fetch automation rules');
  return response.json();
}

export async function createAutomationRule(orgId: number, rule: Omit<AutomationRule, 'rule_id' | 'created_at' | 'updated_at'>): Promise<AutomationRule> {
  const response = await fetch('/api/automation/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_id: orgId, ...rule })
  });
  if (!response.ok) throw new Error('Failed to create automation rule');
  return response.json();
}

export async function updateAutomationRule(orgId: number, ruleId: number, updates: Partial<AutomationRule>): Promise<AutomationRule> {
  const response = await fetch(`/api/automation/rules/${ruleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_id: orgId, ...updates })
  });
  if (!response.ok) throw new Error('Failed to update automation rule');
  return response.json();
}

export async function deleteAutomationRule(orgId: number, ruleId: number): Promise<void> {
  const response = await fetch(`/api/automation/rules/${ruleId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_id: orgId })
  });
  if (!response.ok) throw new Error('Failed to delete automation rule');
}

export async function testAutomationRule(orgId: number, rule: any, sampleEvent: AutomationEvent): Promise<AutomationTestResult> {
  const response = await fetch('/api/automation/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_id: orgId, rule, sample_event: sampleEvent })
  });
  if (!response.ok) throw new Error('Failed to test automation rule');
  return response.json();
}

export async function getAutomationLogs(
  orgId: number,
  filters?: {
    rule_id?: number;
    event_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<AutomationLog[]> {
  const params = new URLSearchParams({ org_id: orgId.toString() });
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, value.toString());
    });
  }

  const response = await fetch(`/api/automation/logs?${params}`);
  if (!response.ok) throw new Error('Failed to fetch automation logs');
  return response.json();
}

export async function ingestAutomationEvent(event: AutomationEvent): Promise<{ event_id: string; ingested: boolean }> {
  const response = await fetch('/api/automation/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  if (!response.ok) throw new Error('Failed to ingest automation event');
  return response.json();
}

// Predefined templates
export const AUTOMATION_TEMPLATES = {
  wonPursuitToEngagement: {
    name: 'Won Pursuit → Create Engagement + Tasks',
    trigger: { event_types: ['Pursuit.Won'] },
    conditions: {
      and: [
        { '==': [{ var: 'payload.deal_value' }, { var: 'payload.contract_value' }] }
      ]
    },
    actions: [
      {
        type: 'engagements.create_task',
        params: {
          engagement_id: '{{payload.engagement_id}}',
          title: 'Kickoff Meeting',
          assignee_id: '{{payload.account_manager_id}}'
        }
      },
      {
        type: 'comms.draft_reply',
        params: {
          template: 'engagement_won',
          thread_from: 'pursuit',
          pursuit_id: '{{payload.pursuit_id}}'
        }
      }
    ],
    throttle: { per: 'hour', limit: 5 }
  },

  featureDoneToInvoice: {
    name: 'Feature Done → Draft Invoice + Update',
    trigger: { event_types: ['Engagement.FeatureDone'] },
    conditions: {
      or: [
        { regex: { var: 'payload.title' }, pattern: '.*Delivery|Milestone.*' }
      ]
    },
    actions: [
      {
        type: 'billing.add_milestone_line',
        params: {
          engagement_id: '{{payload.engagement_id}}',
          feature_id: '{{payload.feature_id}}',
          amount: '{{payload.estimated_value}}'
        }
      },
      {
        type: 'comms.draft_reply',
        params: {
          template: 'milestone_complete',
          thread_from: 'engagement',
          engagement_id: '{{payload.engagement_id}}'
        }
      }
    ],
    throttle: { per: 'hour', limit: 3 }
  },

  threadIdleToTask: {
    name: 'Thread Idle 48h → Create Task + Notify',
    trigger: { event_types: ['Comms.ThreadIdle'] },
    conditions: {
      and: [
        { '>': [{ var: 'payload.idle_hours' }, 48] },
        { '==': [{ var: 'payload.status' }, 'waiting_on_us'] }
      ]
    },
    actions: [
      {
        type: 'engagements.create_task',
        params: {
          title: 'Follow up on idle thread: {{payload.subject}}',
          assignee_id: '{{payload.assigned_to}}',
          priority: 'medium'
        }
      },
      {
        type: 'comms.set_status',
        params: {
          thread_id: '{{payload.thread_id}}',
          status: 'follow_up_needed'
        }
      }
    ],
    throttle: { per: 'day', limit: 10 }
  },

  overdueInvoiceToDunning: {
    name: 'Invoice Overdue → Send Dunning Notice',
    trigger: { event_types: ['Billing.InvoiceOverdue'] },
    conditions: {
      and: [
        { '>': [{ var: 'payload.days_overdue' }, 30] },
        { '==': [{ var: 'payload.dunning_level' }, 0] }
      ]
    },
    actions: [
      {
        type: 'billing.send_dunning',
        params: {
          invoice_id: '{{payload.invoice_id}}',
          level: 'final_warning',
          include_payment_link: true
        }
      }
    ],
    throttle: { per: 'day', limit: 20 }
  }
};

// Action catalog for UI
export const ACTION_CATALOG = {
  'comms.draft_reply': {
    name: 'Draft Reply',
    description: 'Create a draft reply in a communication thread',
    category: 'Communication',
    config_schema: {
      template: { type: 'string', title: 'Template' },
      thread_from: { type: 'string', title: 'Thread Source' },
      engagement_id: { type: 'number', title: 'Engagement ID' }
    }
  },
  'comms.send_email': {
    name: 'Send Email',
    description: 'Send an email message',
    category: 'Communication',
    config_schema: {
      to: { type: 'string', title: 'To' },
      subject: { type: 'string', title: 'Subject' },
      body: { type: 'string', title: 'Body' },
      template: { type: 'string', title: 'Template' }
    }
  },
  'workstream.create_candidate': {
    name: 'Create Candidate',
    description: 'Create a new candidate from signal',
    category: 'Workstream',
    config_schema: {
      signal_id: { type: 'number', title: 'Signal ID' },
      name: { type: 'string', title: 'Name' },
      email: { type: 'string', title: 'Email' }
    }
  },
  'engagements.create_task': {
    name: 'Create Task',
    description: 'Create a new task in engagement',
    category: 'Engagements',
    config_schema: {
      engagement_id: { type: 'number', title: 'Engagement ID' },
      title: { type: 'string', title: 'Title' },
      assignee_id: { type: 'number', title: 'Assignee ID' }
    }
  },
  'billing.create_invoice': {
    name: 'Create Invoice',
    description: 'Create a new invoice',
    category: 'Billing',
    config_schema: {
      contract_id: { type: 'number', title: 'Contract ID' },
      line_items: { type: 'array', title: 'Line Items' },
      due_date: { type: 'string', title: 'Due Date' }
    }
  }
};

// Event types for triggers
export const EVENT_TYPES = [
  // Comms
  'Comms.MessageReceived',
  'Comms.ThreadCreated',
  'Comms.ThreadIdle',
  'Comms.StatusChanged',

  // Workstream
  'Workstream.SignalCreated',
  'Workstream.CandidateCreated',
  'Workstream.CandidatePromoted',
  'Workstream.PursuitCreated',
  'Workstream.PursuitSubmitted',
  'Workstream.PursuitWon',
  'Workstream.PursuitLost',

  // Engagements
  'Engagements.TaskCreated',
  'Engagements.TaskDone',
  'Engagements.FeatureDone',
  'Engagements.AuditStepCompleted',

  // Docs
  'Docs.DocumentApproved',
  'Docs.ReportGenerated',
  'Docs.AttachmentSaved',

  // Billing
  'Billing.ContractCreated',
  'Billing.TimeEntryApproved',
  'Billing.InvoiceCreated',
  'Billing.InvoicePosted',
  'Billing.PaymentReceived',
  'Billing.InvoiceOverdue',

  // People
  'People.StaffingRequestCreated',
  'People.AssignmentCreated',
  'People.OverallocationDetected',
  'People.CertExpiring'
];
