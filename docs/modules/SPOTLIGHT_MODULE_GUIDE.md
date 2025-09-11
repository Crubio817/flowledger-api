# Spotlight System - Complete Implementation Guide

## 📋 Overview

The Spotlight System is a dynamic Ideal Customer Profile (ICP) management system integrated into the FlowLedger Workstream Module. It enables organizations to define, manage, and evaluate customer profiles against incoming signals for better lead qualification and pursuit targeting.

## 🏗️ Architecture

### Core Components
- **Database Layer**: Multi-tenant schema with dynamic field definitions
- **API Layer**: REST endpoints for profile management and evaluation
- **Frontend Integration**: TypeScript client and React components
- **Evaluation Engine**: Signal matching and scoring logic

### Key Features
- Multi-tenant data isolation via `org_id`
- Dynamic field definitions with conditional logic
- Signal evaluation and scoring
- Profile cloning and templating
- Integration with Memory Layer for insights
- Event-driven updates via outbox pattern

---

## 🗄️ Database Schema

### Core Tables

#### `app.spotlights`
Main spotlight table storing ICP metadata.

```sql
CREATE TABLE app.spotlights (
    spotlight_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    name NVARCHAR(255) NOT NULL,
    domain NVARCHAR(100) NOT NULL,
    description NVARCHAR(1000) NULL,
    active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    row_version ROWVERSION
);
```

#### `app.spotlight_fields`
Dynamic field definitions for spotlights.

```sql
CREATE TABLE app.spotlight_fields (
    field_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    domain NVARCHAR(100) NOT NULL,
    field_name NVARCHAR(255) NOT NULL,
    field_type NVARCHAR(50) NOT NULL CHECK (field_type IN ('text','number','boolean','enum','date')),
    is_required BIT NOT NULL DEFAULT 0,
    display_order INT NOT NULL DEFAULT 0,
    enum_values NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    row_version ROWVERSION
);
```

#### `app.spotlight_values`
Actual field values for each spotlight.

```sql
CREATE TABLE app.spotlight_values (
    value_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    spotlight_id BIGINT NOT NULL,
    field_id BIGINT NOT NULL,
    field_value NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    row_version ROWVERSION,
    FOREIGN KEY (spotlight_id) REFERENCES app.spotlights(spotlight_id),
    FOREIGN KEY (field_id) REFERENCES app.spotlight_fields(field_id)
);
```

#### `app.spotlight_field_rules`
Conditional logic for field visibility.

```sql
CREATE TABLE app.spotlight_field_rules (
    rule_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    org_id INT NOT NULL,
    field_id BIGINT NOT NULL,
    condition_field_id BIGINT NOT NULL,
    operator NVARCHAR(10) NOT NULL CHECK (operator IN ('=','!=','>','<','>=','<=','contains')),
    condition_value NVARCHAR(255) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    row_version ROWVERSION,
    FOREIGN KEY (field_id) REFERENCES app.spotlight_fields(field_id),
    FOREIGN KEY (condition_field_id) REFERENCES app.spotlight_fields(field_id)
);
```

---

## 🚀 API Endpoints

### Base URL: `/api/spotlights`

#### GET `/api/spotlights`
List spotlights with filtering.

**Query Parameters:**
- `org_id` (required): Organization ID
- `domain`: Filter by domain
- `active`: Filter by active status
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

**Response:**
```json
{
  "status": "ok",
  "data": [
    {
      "spotlight_id": 1,
      "name": "Enterprise Tech Startup",
      "domain": "tech",
      "description": "High-growth tech companies",
      "active": true,
      "created_at": "2025-09-09T00:00:00.000Z",
      "field_count": 5
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

#### POST `/api/spotlights`
Create a new spotlight profile.

**Request Body:**
```json
{
  "org_id": 1,
  "name": "Enterprise Tech Startup",
  "domain": "tech",
  "description": "High-growth tech companies"
}
```

#### GET `/api/spotlights/:id`
Get spotlight details with fields and values.

**Response:**
```json
{
  "status": "ok",
  "data": {
    "spotlight_id": 1,
    "name": "Enterprise Tech Startup",
    "domain": "tech",
    "description": "High-growth tech companies",
    "active": true,
    "fields": [
      {
        "field_id": 1,
        "field_name": "company_size",
        "field_type": "enum",
        "is_required": true,
        "display_order": 1,
        "enum_values": ["1-50", "51-200", "201-1000", "1000+"],
        "value": "51-200"
      }
    ],
    "created_at": "2025-09-09T00:00:00.000Z"
  }
}
```

#### PUT `/api/spotlights/:id`
Update spotlight profile and values.

**Request Body:**
```json
{
  "org_id": 1,
  "name": "Updated Enterprise Tech Startup",
  "description": "Updated description",
  "field_values": {
    "1": "51-200",
    "2": "5000000"
  }
}
```

#### POST `/api/spotlights/:id/evaluate`
Evaluate a signal against the spotlight.

**Request Body:**
```json
{
  "org_id": 1,
  "signal_data": {
    "company_size": "51-200",
    "revenue": "5000000",
    "industry": "software"
  }
}
```

**Response:**
```json
{
  "status": "ok",
  "data": {
    "match_score": 0.85,
    "matched_fields": 3,
    "total_fields": 4,
    "recommendation": "high_match"
  }
}
```

#### POST `/api/spotlights/:id/clone`
Clone a spotlight profile.

**Request Body:**
```json
{
  "org_id": 1,
  "name": "Cloned Enterprise Tech Startup"
}
```

---

## 🎨 Frontend Integration

### Installation

1. **Install Dependencies:**
```bash
cd frontend-integration-package
npm install zod
```

2. **Import Components:**
```typescript
import { SpotlightApi, SpotlightManager } from './spotlight-api';
import SpotlightManager from './SpotlightManager';
```

### Basic Usage

#### API Client Setup
```typescript
const spotlightApi = new SpotlightApi('/api');
```

#### Fetch Spotlights
```typescript
const loadSpotlights = async () => {
  try {
    const response = await spotlightApi.getSpotlights({
      org_id: 1,
      domain: 'tech'
    });

    if (response.status === 'ok') {
      setSpotlights(response.data);
    }
  } catch (error) {
    console.error('Failed to load spotlights:', error);
  }
};
```

#### Create New Spotlight
```typescript
const createSpotlight = async () => {
  try {
    const response = await spotlightApi.createSpotlight({
      org_id: 1,
      name: 'New Tech Profile',
      domain: 'tech',
      description: 'Description here'
    });

    console.log('Created spotlight:', response.data);
  } catch (error) {
    console.error('Failed to create spotlight:', error);
  }
};
```

---

## 🔧 Setup Instructions

### Database Setup

1. **Run Migration:**
```bash
cd /workspaces/flowledger-api/api
node scripts/run-ddl.js 20250909_add_spotlight_tables.sql
```

2. **Verify Tables:**
```sql
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'app' AND TABLE_NAME LIKE '%spotlight%';
```

### Backend Setup

1. **Add Routes** in `src/routes/spotlights.ts`:
```typescript
import { Router } from 'express';
import { asyncHandler } from '../utils/http';
import { getPool } from '../db/pool';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req);
  const orgId = Number(req.query.org_id);
  if (!orgId) return badRequest(res, 'org_id required');

  const pool = await getPool();
  const r = await pool.request()
    .input('orgId', sql.Int, orgId)
    .input('limit', sql.Int, limit).input('offset', sql.Int, offset)
    .query('SELECT * FROM app.spotlights WHERE org_id=@orgId ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY');

  listOk(res, r.recordset, { page, limit });
}));

// Add other endpoints...
```

2. **Register Routes** in `src/server.ts`:
```typescript
import spotlights from './routes/spotlights';
app.use('/api/spotlights', spotlights);
```

3. **Start Development Server:**
```bash
npm run dev
```

---

## 📊 Evaluation Logic

### Match Scoring
```typescript
const calculateMatchScore = (signalData: any, spotlightValues: any[]): number => {
  let matched = 0;
  let total = spotlightValues.length;

  for (const value of spotlightValues) {
    const signalValue = signalData[value.field_name];
    if (signalValue && matchesCriteria(signalValue, value.field_value, value.field_type)) {
      matched++;
    }
  }

  return total > 0 ? matched / total : 0;
};
```

### Recommendation Engine
```typescript
const getRecommendation = (score: number): string => {
  if (score >= 0.8) return 'high_match';
  if (score >= 0.6) return 'medium_match';
  if (score >= 0.4) return 'low_match';
  return 'no_match';
};
```

---

This implementation provides a flexible ICP management system that integrates seamlessly with the Workstream Module for enhanced lead qualification and pursuit optimization.</content>
<parameter name="filePath">/workspaces/flowledger-api/docs/SPOTLIGHT_MODULE_GUIDE.md
