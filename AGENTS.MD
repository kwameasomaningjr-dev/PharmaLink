# PharmaLink Engineering Instructions

## Mission

Help turn PharmaLink into a secure, reliable Ghana-first pharmacy platform.
Prioritize customer safety, data integrity, pharmacy workflow correctness, and
production readiness over cosmetic changes.

## Repository Context

- Backend: TypeScript, Express, PostgreSQL-compatible database with PGlite fallback.
- Frontend: React served from `public/`.
- Tests: Vitest and Supertest.
- Main commands:
  - `npm run build`
  - `npm test`
  - `npm run dev`
  - `npm run seed`

## Required Workflow

Before changing code:

1. Inspect the relevant routes, services, database schema, frontend calls, and tests.
2. Check for existing uncommitted changes and preserve them.
3. Explain the root cause and propose the smallest complete solution.
4. Check frontend/API contract compatibility.
5. Implement focused changes only.
6. Add or update tests for changed behavior.
7. Run `npm run build` and the most relevant tests.
8. Report changed files, validation results, and remaining risks.

## Product Priorities

Prioritize work in this order:

1. Authentication, authorization, pharmacy tenant isolation, and privacy.
2. Inventory accuracy and prevention of overselling.
3. Prescription workflow correctness and secure file handling.
4. Order state transitions and auditability.
5. Payments, refunds, notifications, and delivery workflows.
6. Monitoring, backups, deployment, and operational recovery.
7. UI polish and secondary features.

## Safety Rules

- Never expose, commit, or print secrets, tokens, passwords, or private user data.
- Never use production credentials in tests or seed data.
- Do not claim an integration is real if it is mocked or demo-only.
- Do not silently weaken authentication or authorization.
- Validate all external input at API boundaries.
- Preserve audit trails for inventory, orders, prescriptions, and account changes.
- Treat prescription data and customer information as sensitive.
- Do not delete data, reset databases, commit changes, or create branches unless explicitly requested.

## Engineering Standards

- Fix root causes instead of masking symptoms.
- Keep changes small and consistent with the existing architecture.
- Prefer typed interfaces and explicit validation.
- Use transactions for inventory and order state changes.
- Make retries and external operations idempotent.
- Keep frontend requests aligned with implemented backend routes.
- Do not add placeholder integrations without clearly labeling them.
- Add regression tests for every fixed bug.
- Do not introduce unrelated refactors.

## Production Readiness Checks

When reviewing or implementing a feature, check:

- Authentication and role enforcement.
- Pharmacy tenant isolation.
- Input validation and error responses.
- Database constraints and transaction boundaries.
- Idempotency and concurrency behavior.
- Audit events and sensitive-data handling.
- Logging, request IDs, and useful failure diagnostics.
- Environment configuration and secure defaults.
- Tests for both success and failure paths.
- Frontend behavior when the API is unavailable.

## Collaboration With Copilot

When splitting work with Copilot:

- Define exact files and acceptance criteria for each task.
- Avoid assigning both agents the same files simultaneously.
- Keep database/schema changes coordinated.
- Require Copilot to report tests run and unresolved risks.
- Review all Copilot changes before merging them.
- Resolve conflicts by preserving the stronger security and data-integrity behavior.

## Final Response Format

End each task with:

1. What changed.
2. Why it changed.
3. Tests or checks run.
4. Known limitations.
5. Recommended next step.