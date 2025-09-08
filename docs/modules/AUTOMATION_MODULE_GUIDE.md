# Automation Module Integration Guide

## Overview

The Automation module enables FlowLedger to automatically respond to events across all domains (Comms, Workstream, Engagements, Docs, Billing, People) by executing predefined rules with triggers, conditions, and actions.

## Key Features

- **Event-Driven**: Listens to domain events and provider webhooks
- **Rule Engine**: JSON-logic conditions with throttling and idempotency
- **Action Catalog**: Pre-built actions for all FlowLedger domains
- **Real-time Processing**: Sub-second rule evaluation and execution
- **Observability**: Comprehensive logging, metrics, and DLQ management
- **Templates**: Pre-built automation templates for common workflows

## Architecture

```
Events → Rule Engine → Action Queue → Executors → Providers
   ↑         ↓              ↓         ↓           ↓
Domain   Conditions    Retry     Idempotent   External
Events   + Throttle    + DLQ     Keys        APIs
```

## Quick Start

### 1. Install Dependencies

```bash
npm install axios react  # If not already installed
```

### 2. Import Components

```typescript
import { AutomationManager } from './AutomationManager';
import {
  getAutomationRules,
  createAutomationRule,
  testAutomationRule
} from './automation-api';
```

### 3. Basic Usage

```tsx
function App() {
  return (
    <div>
      <AutomationManager orgId={1} />
    </div>
  );
}
```

## API Reference

### Core Functions

#### `getAutomationRules(orgId: number)`
Fetch all automation rules for an organization.

```typescript
const rules = await getAutomationRules(1);
console.log(rules); // [{ rule_id: 1, name: "Won Pursuit → Engagement", ... }]
```

#### `createAutomationRule(data)`
Create a new automation rule.

```typescript
const newRule = await createAutomationRule({
  org_id: 1,
  name: "Feature Done → Invoice Draft",
  trigger: { event_types: ["Engagement.FeatureDone"] },
  conditions: {
    regex: { var: "payload.title", pattern: ".*Delivery.*" }
  },
  actions: [
    {
      type: "billing.add_milestone_line",
      params: {
        engagement_id: "{{payload.engagement_id}}",
        feature_id: "{{payload.feature_id}}"
      }
    }
  ],
  throttle: { per: "hour", limit: 5 }
});
```

#### `testAutomationRule(orgId, rule, sampleEvent)`
Test a rule against a sample event.

```typescript
const result = await testAutomationRule(1, rule, {
  type: "Engagement.FeatureDone",
  tenant_id: 1,
  source: "domain",
  payload: { engagement_id: 123, feature_id: 456, title: "Final Delivery" }
});

console.log(result.matches); // true or false
console.log(result.evaluation); // { trigger_matched: true, conditions_passed: true, throttle_ok: true }
```

### Rule Structure

```typescript
interface AutomationRule {
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
  conditions?: any; // JSON-logic object
  throttle?: {
    per: 'minute' | 'hour' | 'day';
    limit: number;
  };
  actions: AutomationAction[];
}

interface AutomationAction {
  type: string;
  params: Record<string, any>;
}
```

## Event Types

### Domain Events
- `Comms.MessageReceived`
- `Comms.ThreadCreated`
- `Comms.ThreadIdle`
- `Comms.StatusChanged`
- `Workstream.SignalCreated`
- `Workstream.CandidatePromoted`
- `Workstream.PursuitWon`
- `Engagements.TaskDone`
- `Engagements.FeatureDone`
- `Docs.DocumentApproved`
- `Billing.InvoicePosted`
- `Billing.InvoiceOverdue`
- `People.AssignmentCreated`

### Provider Events
- `Comms.MessageReceived`
- `Zammad.TicketCreated`
- `Graph.CalendarEvent`

## Action Catalog

### Communication Actions
- `comms.draft_reply` - Draft a reply in a thread
- `comms.send_email` - Send an email
- `comms.set_status` - Update thread status
- `comms.escalate` - Escalate a communication

### Workstream Actions
- `workstream.create_candidate` - Create candidate from signal
- `workstream.promote_to_pursuit` - Promote candidate to pursuit

### Engagement Actions
- `engagements.create_task` - Create a new task
- `engagements.update_state` - Update feature/engagement state
- `engagements.generate_report_doc` - Generate report document

### Billing Actions
- `billing.create_invoice` - Create new invoice
- `billing.add_milestone_line` - Add milestone line item
- `billing.post_invoice` - Post an invoice
- `billing.send_dunning` - Send dunning notice

### People Actions
- `people.create_staffing_request` - Create staffing request
- `people.rank_candidates` - Rank candidates
- `people.create_assignment` - Create resource assignment

### Automation Actions
- `automation.schedule_followup` - Schedule followup action
- `automation.emit_event` - Emit custom event
- `automation.call_webhook` - Call external webhook

## Templates

Pre-built templates for common automations:

### Won Pursuit → Engagement Setup
```typescript
{
  name: "Won Pursuit → Create Engagement + Tasks",
  trigger: { event_types: ["Pursuit.Won"] },
  actions: [
    {
      type: "engagements.create_task",
      params: {
        title: "Kickoff Meeting",
        assignee_id: "{{payload.account_manager_id}}"
      }
    },
    {
      type: "comms.draft_reply",
      params: {
        template: "engagement_won",
        thread_from: "pursuit"
      }
    }
  ]
}
```

### Feature Complete → Invoice
```typescript
{
  name: "Feature Done → Draft Invoice",
  trigger: { event_types: ["Engagement.FeatureDone"] },
  conditions: {
    regex: { var: "payload.title", pattern: ".*Delivery.*" }
  },
  actions: [
    {
      type: "billing.add_milestone_line",
      params: {
        engagement_id: "{{payload.engagement_id}}",
        feature_id: "{{payload.feature_id}}"
      }
    }
  ]
}
```

### Idle Thread Follow-up
```typescript
{
  name: "Thread Idle 48h → Create Task",
  trigger: { event_types: ["Comms.ThreadIdle"] },
  conditions: {
    and: [
      { ">": [{ var: "payload.idle_hours" }, 48] },
      { "==": [{ var: "payload.status" }, "waiting_on_us"] }
    ]
  },
  actions: [
    {
      type: "engagements.create_task",
      params: {
        title: "Follow up on idle thread",
        priority: "medium"
      }
    }
  ]
}
```

## Advanced Usage

### JSON-Logic Conditions

Use JSON-logic for complex conditions:

```typescript
{
  conditions: {
    and: [
      { ">": [{ var: "payload.amount" }, 10000] },
      { "in": [{ var: "payload.status" }, ["approved", "completed"]] },
      {
        or: [
          { "regex": { var: "payload.description", pattern: "urgent" } },
          { "==": [{ var: "payload.priority" }, "high"] }
        ]
      }
    ]
  }
}
```

### Template Variables

Use `{{variable}}` syntax in action parameters:

```typescript
{
  type: "comms.send_email",
  params: {
    to: "{{payload.client_email}}",
    subject: "Update on {{payload.project_name}}",
    body: "Dear {{payload.client_name}}, ..."
  }
}
```

### Throttling

Prevent rule spam with throttling:

```typescript
{
  throttle: {
    per: "hour",  // minute | hour | day
    limit: 5      // max executions per period
  }
}
```

## Integration Examples

### React Component Integration

```tsx
import React from 'react';
import { AutomationManager } from './AutomationManager';

function AutomationPage() {
  const [orgId] = useState(1);

  return (
    <div className="page">
      <h1>Automation Rules</h1>
      <AutomationManager orgId={orgId} />
    </div>
  );
}
```

### Custom Rule Creation

```typescript
async function createCustomRule() {
  const rule = {
    name: "Custom SLA Breach Alert",
    trigger: { event_types: ["Workstream.SLABreach"] },
    conditions: {
      ">": [{ var: "payload.breach_hours" }, 24]
    },
    actions: [
      {
        type: "comms.send_email",
        params: {
          to: "manager@company.com",
          subject: "SLA Breach Alert",
          body: "SLA breached by {{payload.breach_hours}} hours"
        }
      }
    ],
    throttle: { per: "day", limit: 10 }
  };

  const result = await createAutomationRule({
    org_id: 1,
    ...rule
  });

  console.log("Rule created:", result);
}
```

### Event Ingestion

```typescript
import { ingestAutomationEvent } from './automation-api';

// From your domain code
async function onFeatureCompleted(featureId: number, engagementId: number) {
  await ingestAutomationEvent({
    type: "Engagement.FeatureDone",
    tenant_id: 1,
    aggregate_type: "feature",
    aggregate_id: featureId,
    payload: {
      engagement_id: engagementId,
      feature_id: featureId,
      title: "Feature completed",
      completed_by: userId
    },
    source: "domain",
    correlation_id: `eng-${engagementId}`
  });
}
```

## Monitoring & Debugging

### Activity Logs

```typescript
const logs = await getAutomationLogs({
  org_id: 1,
  rule_id: 123,  // Optional: filter by rule
  limit: 50
});

logs.forEach(log => {
  console.log(`${log.outcome}: ${log.rule_name} - ${log.error_message || 'Success'}`);
});
```

### Rule Testing

```typescript
const testResult = await testAutomationRule(orgId, rule, sampleEvent);

if (!testResult.matches) {
  console.log("Rule would not trigger:", testResult.reason);
} else {
  console.log("Actions that would execute:", testResult.actions);
}
```

## Best Practices

1. **Start Simple**: Use templates for common automations
2. **Test Thoroughly**: Always test rules with sample events
3. **Use Throttling**: Prevent spam and API rate limit issues
4. **Monitor Logs**: Regularly check automation activity logs
5. **Handle Errors**: Rules should be resilient to action failures
6. **Version Control**: Keep track of rule changes over time

## Troubleshooting

### Common Issues

1. **Rule not triggering**: Check event type matching and conditions
2. **Actions failing**: Verify action parameters and permissions
3. **High latency**: Check throttling and queue depth
4. **Duplicate executions**: Ensure idempotency keys are unique

### Debug Steps

1. Test rule with sample event using `testAutomationRule()`
2. Check activity logs for execution details
3. Verify event ingestion with correlation IDs
4. Monitor queue depth and processing times

## Security Considerations

- Actions require specific permissions
- Webhook URLs must be pre-approved
- PII is not stored in automation logs
- Tenant isolation enforced at database level
- Rate limiting on external API calls

## Performance

- Rules evaluated in <100ms
- Actions queued asynchronously
- Idempotency prevents duplicate execution
- Throttling prevents system overload
- Background processing doesn't block UI

---

**Next Steps:**
1. Run database migration: `npm run db:migrate:core-modules`
2. Start the server: `npm run dev`
3. Test with sample rules and events
4. Monitor logs and adjust as needed

For questions or issues, check the activity logs and correlation IDs for debugging.
