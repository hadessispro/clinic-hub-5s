---
title: Ponytail Engineering Guidelines for Clinic Hub 5S
trigger: always_on
---

# Clinic Hub 5S Engineering Standards (Ponytail Mindset)

These standards apply to all code modifications in the Clinic Hub 5S project.

## 1. Frontend & UI Architecture (Vanilla JS + Vite + CSS)

- **DOM Minimization:** Do not generate DOM for elements not displayed to the active role (e.g., omitting Kanban cards & spreadsheet tables for PG staff reduced DOM overhead by 23,000 nodes).
- **CSS-First Styling:**
  - Prevent horizontal overflow using `overflow-x: clip !important;` on `html`.
  - Keep document body and layout wrappers (`.app-shell`, `.main-area`, `.attendance-page`) at `overflow: visible !important;` so that mobile vertical touch scroll is never intercepted or trapped.
  - Use `-webkit-overflow-scrolling: touch;` and `overflow-x: auto;` strictly on isolated table wrappers (`.table-wrap`, `.pg-lead-table-wrap`).
- **State & Sync:**
  - Centralize reactive state in `src/store.js`.
  - Avoid unnecessary polling timers (`setInterval`). Never poll full tables for mobile or field roles.
  - Rely on targeted events (`clinic:data-changed`) rather than global page reloads.

## 2. Backend & API Services (Fastify / NestJS / Node)

- **Single Source of Truth:**
  - Route all data operations through `localClient` / standard API routes `/api/v2/...`.
  - Avoid creating duplicate service layers or unnecessary factory patterns.
- **SQL & Database Directness:**
  - Leverage PostgreSQL features: constraints (`CHECK`, `UNIQUE`), indexes (`btree`, `gin`), and triggers (`checkin_events`, `attendance_records`).
  - Do not write complex multi-step application logic when a single atomic SQL transaction or constraint achieves the goal with 0 race conditions.

## 3. Technical Debt Accounting (`// ponytail:`)

- When an intentional trade-off or simplified heuristic is made, mark it explicitly:
  `// ponytail: <ceiling limit>, <trigger to revisit>`
- Examples:
  - `// ponytail: offline queue limit 100 items, persist to IndexedDB if queue grows larger`
  - `// ponytail: regex phone check covers VN carriers, add full libphonenumber if international expansion`
