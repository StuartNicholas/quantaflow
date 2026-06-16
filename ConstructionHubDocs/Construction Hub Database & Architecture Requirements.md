# Construction Hub Database & Architecture Requirements

## Architecture Philosophy

- Multi-company SaaS platform
- Project-centred architecture
- Company-owned data
- Auditability first
- Versioning first
- Future module support

---

# Project Is The Master Record

Everything should connect back to a project.

Examples:

- Documents
- Takeoffs
- Quotes
- Revisions
- Variations
- Procurement Plans
- Handover Packages
- Knowledge Entries

---

# Core Database Entities

Companies

Profiles

Company Settings

Projects

Builders

Suppliers

Libraries

Library Items

Room Presets

Joinery Presets

Documents

Project Revisions

Unit Types

Project Joinery Types

Takeoffs

Takeoff Items

Quotes

Quote Revisions

Quote Items

Variations

Variation Items

Procurement Plans

Procurement Items

Handover Packages

Knowledge Entries

Activity Logs

AI Usage Logs

---

# Critical Rules

1. Every company-owned record must include company_id.
2. Projects are the central entity.
3. Quotes must be versioned.
4. Revisions must be versioned.
5. Variations must be tracked.
6. AI output must be reviewable.
7. AI must never create pricing.
8. Activity logs must exist.
9. Audit fields must exist.
10. Historical records must never be overwritten.

---

# Future Integrations

Prepare architecture for:

- Xero
- Outlook
- Teams
- EstimateOne
- Supplier Systems
- Future Construction Hub Project Management Platform

Do not build these integrations unless specifically instructed.

---

# Claude Development Rules

Before writing code:

1. Review existing architecture.
2. Compare against Version 1 Scope.
3. Produce a gap analysis.
4. Identify technical debt.
5. Recommend build order.

Do not perform large rewrites unless necessary.

Prefer extending existing architecture.

Build Version 1 only.