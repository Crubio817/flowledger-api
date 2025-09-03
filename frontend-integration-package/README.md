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
