# MCP Module

## Overview

The MCP (Model Context Protocol) Module integrates AI-powered tools for data enrichment and analysis in the Flowledger API. It uses FullEnrich and Clay for contact enrichment, and OpenAI for content generation. This module supports asynchronous processing and is integrated with the Workstream Module for signal analysis and proposal drafting.

### Key Features
- **Enrichment Tools**: `enrich_contact` for contact data.
- **AI Tools**: `analyze_signal`, `draft_proposal`.
- **Asynchronous**: Webhooks for results.
- **Idempotent**: Safe retries with unique keys.

### Technology Stack
- **Backend**: Node.js/Express with TypeScript.
- **APIs**: FullEnrich, Clay, OpenAI.
- **Database**: `enrichment_jobs` table for tracking.

## API Reference

### Tools
- `enrich_contact`: Enrich email/phone data.
- `analyze_signal`: Analyze signal text.
- `draft_proposal`: Generate proposal content.

### Endpoints
- `POST /api/mcp/enrich` - Trigger enrichment.
- Webhooks: Handle results asynchronously.

### Response Formats
- Enrichment: `{ job_id, status, data }`.

## Development Guide

### Setup
1. Configure API keys in [`.env`](.env).
2. Use [`src/mcp.ts`](src/mcp.ts) and [`src/mcp-tools.ts`](src/mcp-tools.ts).

### Key Files
- [`src/mcp.ts`](src/mcp.ts): MCP handlers.
- [`src/mcp-tools.ts`](src/mcp-tools.ts): Tool implementations.

### Testing
- Mock APIs for unit tests.

For questions, refer to the codebase.
