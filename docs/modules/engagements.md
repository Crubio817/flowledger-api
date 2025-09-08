# Engagements Module

Project management for Projects, Audits, and Jobs with state machines and progress.

## Guide

- Complete implementation guide: ./../ENGAGEMENTS_MODULE_GUIDE.md

## Code Pointers

- Routes: ./../../api/src/routes/engagements.ts
- State guards: ./../../api/src/state/engagements-guards.ts

## Highlights

- Multi-tenant via `org_id`
- Engagement/feature/audit/job state transitions
- Milestones, dependencies, change requests
- Event outbox + optional WebSocket updates

