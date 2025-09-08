# Frontend Integration Package

This package contains all the essential files needed for your front end developer to integrate with the FlowLedger API.

## 📁 Files Included

### 1. `openapi.snapshot.json`
- **Purpose**: Complete OpenAPI 3.0.3 specification for the FlowLedger API
- **Usage**: Use this to understand all available endpoints, request/response schemas, and generate client code
- **Live Version**: Available at `http://localhost:4001/openapi.json` when API server is running

### 2. `api-types.ts`
- **Purpose**: Auto-generated TypeScript types from the OpenAPI specification
- **Usage**: Import these types in your front end for full type safety
- **Generation**: Run `npm run gen:api:types` to regenerate from updated OpenAPI spec

### 3. `api.ts`
- **Purpose**: Ready-to-use API client functions with axios
- **Usage**: Copy these functions or use as reference for your API calls
- **Features**:
  - Configured axios instance with correct base URL
  - Type-safe functions for common operations
  - Proper error handling patterns

### 4. `package.json`
- **Purpose**: Dependencies and scripts for the front end project
- **Key Dependencies**:
  - `axios`: For HTTP requests
  - `react` & `react-dom`: For React components
  - `react-router-dom`: For routing
  - `openapi-typescript`: For generating types from OpenAPI spec

### 5. `.env.local`
- **Purpose**: Environment configuration
- **Key Setting**: `VITE_API_BASE=http://localhost:4001`

## 🚀 Quick Start

1. **Copy files to your front end project**:
   ```bash
   cp api-types.ts your-project/src/lib/
   cp api.ts your-project/src/lib/
   cp .env.local your-project/
   ```

2. **Install dependencies**:
   ```bash
   npm install axios openapi-typescript
   ```

3. **Set up environment**:
   ```bash
   # Add to your .env.local
   VITE_API_BASE=http://localhost:4001
   ```

4. **Use the API client**:
   ```typescript
   import { getClients, getDashboardStats } from './lib/api';
   import type { paths } from './lib/api-types';

   // Example usage
   const clients = await getClients(20);
   const stats = await getDashboardStats();
   ```

## 📡 API Endpoints Available

### Core Endpoints
- `/api/health` - Health check
- `/api/dashboard-stats` - Dashboard statistics
- `/api/clients` - Client management
- `/api/clients-overview` - Client overview with metadata
- `/api/audits` - Audit management
- `/api/client-contacts` - Contact management
- `/api/client-tags` - Tag management
- `/api/industries` - Industry management
- `/api/task-packs` - Task pack management
- `/api/ai/*` - AI-powered features

### Identity & Comms Hub Endpoints ✨ NEW
- `/api/principals` - Principal management (users, services, teams)
- `/api/principals/{id}` - Individual principal operations
- `/api/comms/threads` - Communication threads management
- `/api/comms/threads/{id}` - Thread details and updates
- `/api/comms/threads/{id}/reply` - Reply to communication threads
- `/api/comms/threads/{id}/link` - Link threads to work items
- `/api/comms/attachments/{id}/save-as-doc` - Save attachments as documents
- `/webhooks/graph` - Microsoft Graph email notifications

### Response Format
All successful responses follow this pattern:
```json
{
  "status": "ok",
  "data": [...],
  "meta": { "page": 1, "limit": 20, "total": 100 }
}
```

### Error Format
```json
{
  "error": {
    "code": "ErrorCode",
    "message": "Error message"
  }
}
```

## 🎯 Identity & Comms Hub - Frontend Integration Guide

### **What It Does**
The Identity & Comms Hub provides a unified communication management system with:
- **Multi-Provider Identity**: Support for AAD, email, and custom identity providers
- **Threaded Communications**: Email and ticket management with full conversation history  
- **State Management**: Automated workflow states with business rules
- **SLA Monitoring**: Response time tracking and breach alerts
- **Work Item Linking**: Connect communications to audits, projects, and other work items
- **Attachment Management**: File handling with document conversion capabilities

### **Module Structure**
- **Identity Management**: Could go in Settings or a dedicated People module
- **Communications**: Main Comms module for threads, messages, and workflows
- **Integration**: Links to existing clients, audits, and work items

### **API Endpoints Available**

#### **Principals (Identity)**
```typescript
GET    /api/principals              // List principals with filters
GET    /api/principals/{id}         // Get principal details  
POST   /api/principals              // Create new principal
PATCH  /api/principals/{id}         // Update principal
DELETE /api/principals/{id}         // Delete principal
```

#### **Communications**
```typescript
GET    /api/comms/threads           // List threads with filters
GET    /api/comms/threads/{id}      // Get thread with messages
PATCH  /api/comms/threads/{id}      // Update thread status/state
POST   /api/comms/threads/{id}/reply // Reply to thread
POST   /api/comms/threads/{id}/link // Link to work items
POST   /api/comms/attachments/{id}/save-as-doc // Save as document
```

#### **Webhooks**
```typescript
POST   /webhooks/graph              // Microsoft Graph email notifications
```

### **Data Structures**

#### **Principal**
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

#### **Comms Thread**
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

#### **Comms Message**
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

### **Thread Status Workflow**
```
active → pending, resolved, escalated, on_hold
pending → active, resolved, escalated  
escalated → active, resolved, on_hold
on_hold → active, escalated, resolved
resolved → reopened
reopened → active, resolved, escalated, on_hold
```

### **Key Features to Implement**

#### **1. Thread Management**
- List threads with filtering (status, assignee, client, tags)
- Thread detail view with message history
- Status updates with validation
- Assignment to team members
- Tagging system

#### **2. Message Handling**
- Reply to threads with rich text
- Attachment upload and management
- Template system for common responses
- Message threading and history

#### **3. Integration Points**
- Link threads to existing work items (audits, projects, clients)
- Convert attachments to client documents
- SLA monitoring and alerts
- Real-time updates via polling/WebSocket

#### **4. Identity Management**
- Principal directory with search/filter
- Principal profiles and details
- Identity provider information
- Role and permission management

### **Frontend Patterns to Use**

Based on your existing codebase, use these established patterns:

#### **API Calls**
```typescript
// Use the provided api.ts functions
import { getCommsThreads, updateCommsThread } from './lib/api';

// Example usage
const threads = await getCommsThreads({ org_id: 1, status: 'active' });
await updateCommsThread(threadId, { status: 'resolved' });
```

#### **State Management**
```typescript
// Use your existing state management approach
// Follow the same patterns as your current modules
```

#### **Component Structure**
```typescript
// Use your existing component patterns
// Same styling approach (Tailwind/shadcn)
// Same form handling (React Hook Form)
// Same error handling patterns
```

#### **Routing**
```typescript
// Use your existing routing structure
// Add routes like:
/comms/threads          // Thread list
/comms/threads/:id      // Thread detail  
/settings/principals    // Principal management
```

### **Integration with Existing Systems**

#### **Client Linking**
- Threads can link to existing clients via `client_id`
- Use existing client selection components
- Maintain consistency with current client workflows

#### **Audit Integration**
- Link threads to audits for context
- Use existing audit selection/linking patterns
- Maintain audit trail consistency

#### **Document Management**
- Attachments can be saved as client documents
- Use existing document upload/storage patterns
- Maintain document access controls

### **Success Criteria**

✅ **Functional Requirements**
- View and manage communication threads
- Send/receive messages with attachments
- Update thread status and assignments
- Link threads to work items
- Manage principals and identities

✅ **Technical Requirements**
- Use existing API patterns and error handling
- Maintain consistent UI/UX with current modules
- Proper TypeScript typing with provided types
- Responsive design following existing patterns

✅ **Business Requirements**
- Support email and ticket workflows
- SLA monitoring and alerts
- Work item integration
- Multi-provider identity support

### **Next Steps**

1. **Review the API endpoints** in `api.ts` and `api-types.ts`
2. **Plan your module structure** (Settings for identity, Comms for threads)
3. **Use existing patterns** for components, state, and API calls
4. **Start with thread listing** and detail views
5. **Add message composition** and attachment handling
6. **Implement status workflows** and assignments
7. **Add integration points** with existing modules

The backend is fully ready - focus on building a clean UI that follows your existing patterns! 🚀

## 🔧 Development Setup

### Start API Server
```bash
cd /workspaces/flowledger-api/api
npm run dev  # Runs on http://localhost:4001
```

### Start Front End
```bash
cd your-frontend-project
npm run dev  # Will run on http://localhost:5173
```

### API Documentation
- **Swagger UI**: `http://localhost:4001/api-docs`
- **OpenAPI JSON**: `http://localhost:4001/openapi.json`

## 📝 Notes

- All API endpoints use consistent error handling with `asyncHandler`
- Request validation is handled by Zod schemas on the backend
- Pagination is available on list endpoints with `page` and `limit` parameters
- All endpoints support CORS for cross-origin requests
- TypeScript types provide full type safety for API responses

## 🆘 Support

If you need help integrating:
1. Check the API documentation at `http://localhost:4001/api-docs`
2. Test endpoints with the health check: `http://localhost:4001/api/health`
3. Use the provided `api.ts` functions as reference implementations
