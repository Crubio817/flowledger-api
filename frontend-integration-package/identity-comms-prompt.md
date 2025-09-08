# Frontend Integration Package - Identity & Comms Hub

## 📁 What You Need to Know

This package contains everything you need to build the Identity & Comms Hub frontend. The backend is fully ready and tested.

### Files Provided:
- `openapi.snapshot.json` - Complete API specification
- `api-types.ts` - TypeScript types for all endpoints
- `api.ts` - Ready-to-use API client functions
- `package.json` - Dependencies and scripts

## 🎯 Identity & Comms Hub Overview

### What It Does
Unified communication management system with:
- **Multi-Provider Identity**: AAD, email, and custom identity providers
- **Threaded Communications**: Email and ticket management with conversation history
- **State Management**: Automated workflow states with business rules
- **SLA Monitoring**: Response time tracking and breach alerts
- **Work Item Linking**: Connect to audits, projects, and other work items
- **Attachment Management**: File handling with document conversion

### Module Structure
- **Identity Management**: Put this in Settings or a dedicated People module
- **Communications**: Main Comms module for threads, messages, and workflows
- **Integration**: Links to existing clients, audits, and work items

## 📡 API Endpoints Available

### Principals (Identity)
```typescript
GET    /api/principals              // List principals with filters
GET    /api/principals/{id}         // Get principal details
POST   /api/principals              // Create new principal
PATCH  /api/principals/{id}         // Update principal
DELETE /api/principals/{id}         // Delete principal
```

### Communications
```typescript
GET    /api/comms/threads           // List threads with filters
GET    /api/comms/threads/{id}      // Get thread with messages
PATCH  /api/comms/threads/{id}      // Update thread status/state
POST   /api/comms/threads/{id}/reply // Reply to thread
POST   /api/comms/threads/{id}/link // Link to work items
POST   /api/comms/attachments/{id}/save-as-doc // Save as document
```

### Webhooks
```typescript
POST   /webhooks/graph              // Microsoft Graph email notifications
```

## 📊 Data Structures

### Principal
```typescript
{
  principal_id: number;
  org_id: number;
  principal_type: "person" | "service" | "team";
  display_name?: string;
  primary_email?: string;
  is_internal: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### Comms Thread
```typescript
{
  thread_id: number;
  org_id: number;
  mailbox_id: number;
  channel: "email" | "ticket";
  subject: string;
  status: "active" | "pending" | "resolved" | "escalated" | "on_hold" | "reopened";
  process_state: "triage" | "in_processing" | "queued" | "done" | "archived";
  assigned_principal_id?: number;
  client_id?: number;
  sla_rule_id?: number;
  first_msg_at?: string;
  last_msg_at: string;
  internet_conv_id?: string;
  created_at: string;
  updated_at: string;
}
```

### Comms Message
```typescript
{
  message_id: number;
  org_id: number;
  thread_id: number;
  direction: "in" | "out";
  provider: "graph" | "zammad";
  provider_msg_id: string;
  sent_at: string;
  snippet?: string;
  body_blob_url?: string;
  has_attachments: boolean;
  created_at: string;
}
```

### Thread Status Workflow
```
active → pending, resolved, escalated, on_hold
pending → active, resolved, escalated
escalated → active, resolved, on_hold
on_hold → active, escalated, resolved
resolved → reopened
reopened → active, resolved, escalated, on_hold
```

## 🔧 Key Features to Implement

### 1. Thread Management
- List threads with filtering (status, assignee, client, tags)
- Thread detail view with message history
- Status updates with validation
- Assignment to team members
- Tagging system

### 2. Message Handling
- Reply to threads with rich text
- Attachment upload and management
- Template system for common responses
- Message threading and history

### 3. Integration Points
- Link threads to existing work items (audits, projects, clients)
- Convert attachments to client documents
- SLA monitoring and alerts
- Real-time updates via polling/WebSocket

### 4. Identity Management
- Principal directory with search/filter
- Principal profiles and details
- Identity provider information
- Role and permission management

## 🎨 Frontend Patterns to Use

### API Calls
```typescript
// Use the provided api.ts functions
import { getCommsThreads, updateCommsThread } from './lib/api';

// Example usage
const threads = await getCommsThreads({ org_id: 1, status: 'active' });
await updateCommsThread(threadId, { status: 'resolved' });
```

### Component Structure
```typescript
// Use your existing component patterns
// Same styling approach (Tailwind/shadcn)
// Same form handling (React Hook Form)
// Same error handling patterns
```

### Routing
```typescript
// Use your existing routing structure
// Add routes like:
/comms/threads          // Thread list
/comms/threads/:id      // Thread detail
/settings/principals    // Principal management
```

## 🔗 Integration with Existing Systems

### Client Linking
- Threads can link to existing clients via `client_id`
- Use existing client selection components
- Maintain consistency with current client workflows

### Audit Integration
- Link threads to audits for context
- Use existing audit selection/linking patterns
- Maintain audit trail consistency

### Document Management
- Attachments can be saved as client documents
- Use existing document upload/storage patterns
- Maintain document access controls

## ✅ Success Criteria

### Functional Requirements
- View and manage communication threads
- Send/receive messages with attachments
- Update thread status and assignments
- Link threads to work items
- Manage principals and identities

### Technical Requirements
- Use existing API patterns and error handling
- Maintain consistent UI/UX with current modules
- Proper TypeScript typing with provided types
- Responsive design following existing patterns

### Business Requirements
- Support email and ticket workflows
- SLA monitoring and alerts
- Work item integration
- Multi-provider identity support

## 🚀 Next Steps

1. **Review the API endpoints** in `api.ts` and `api-types.ts`
2. **Plan your module structure** (Settings for identity, Comms for threads)
3. **Use existing patterns** for components, state, and API calls
4. **Start with thread listing** and detail views
5. **Add message composition** and attachment handling
6. **Implement status workflows** and assignments
7. **Add integration points** with existing modules

**The backend is fully ready - focus on building a clean UI that follows your existing patterns!** 🚀
