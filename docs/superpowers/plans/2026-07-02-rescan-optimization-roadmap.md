# InstallDashboard Rescan Optimization Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-plan the next optimization phases from the current `20260629-F103` production baseline while preserving exactly two user roles: `admin` and `engineer`.

**Architecture:** Keep the Firebase/Next.js app behavior stable, then reduce dashboard JavaScript weight, render cost, and dependency/security risk in small releases. Each phase must ship through a `codex/*` PR, GitHub Quality Gates, Vercel preview, production deployment, and production version/log verification.

**Tech Stack:** Next.js 16.2.9, React 19.2.5, Firebase Auth/Firestore, TypeScript, ESLint, custom unit runner, GitHub Actions, Vercel.

---

## Rescan Baseline

**Scan time:** 2026-07-02 Asia/Taipei.

**Current production version:** `20260629-F103`.

**Production deployment:** `dpl_7j19775Yu2vH7qe5t6qpP2hE3C84`, target `production`, state `READY`, commit `743fce7faac85a41826ebbc8875ff98b2714e027`.

**GitHub main quality gate:** run `28550789855`, run number `69`, conclusion `success`.

**Local branch state:** `codex/optimize-route-scoped-listeners` is clean. Local `main` is one merge commit behind `origin/main`, so sync `main` before the next implementation branch.

**Production smoke check:** `/version.json` returns `20260629-F103`; homepage returns HTTP 200 and includes the Next bundle/version marker.

**Runtime error scan:** Vercel production `error`/`fatal` logs for the latest deployment over the last 30 minutes returned no matching logs.

**Local verification:**
- `npm run verify:version` passed.
- `npm run verify:quality` passed.
- `npm run build` passed.

**Remaining audit risk:**
- `npm audit --audit-level=moderate` reports 4 moderate advisories.
- `next` currently pulls a vulnerable nested `postcss <8.5.10` advisory path.
- `exceljs` currently pulls a vulnerable `uuid <11.1.1` advisory path.
- Do not use `npm audit fix --force`; the suggested automatic fixes are unsafe downgrade paths.

**Largest source files:**
- `src/features/dashboard/DashboardWorkspace.tsx`: 2,805 lines, 151,376 bytes.
- `src/app/globals.css`: 2,606 lines, 85,465 bytes.
- `src/features/dashboard/SmartImportModal.tsx`: 585 lines, 31,205 bytes.
- `src/app/admin/users/page.tsx`: 399 lines, 17,824 bytes.
- `src/features/dashboard/ImportEquipmentModal.tsx`: 359 lines, 17,824 bytes.
- `src/app/admin/customer-sites/page.tsx`: 340 lines, 17,773 bytes.

**Build asset baseline:**
- `.next/static` JavaScript files: 32.
- Total `.next/static` JavaScript bytes: 2,619,549.
- Largest JavaScript chunk: 930,899 bytes.

**Role invariant:**
- `src/domain/userRoles.ts` is limited to `engineer` and `admin`.
- `firestore.rules` accepts only `admin` and `engineer` for app roles.
- Future work may add scopes or permissions fields, but must not add a third role type.

---

## Recommended Priority

1. **F104: Sync main and split `DashboardWorkspace.tsx` into route-specific client sections.**
2. **F105: Add repeatable performance baseline reporting to CI.**
3. **F106: Upgrade aligned dependencies and resolve moderate audit risk without forced downgrades.**
4. **F107: Extract memoized table/kanban rendering boundaries.**
5. **F108: Split `globals.css` into app shell, dashboard, admin, and component bands.**
6. **F109: Move Insights analytics toward Firestore summary documents or scoped aggregate reads.**

---

## Phase F104: Dashboard Route Section Split

**Why now:** `DashboardWorkspace.tsx` remains the largest and riskiest file. F103 reduced listener data volume; the next gain is reducing dashboard parse/render coupling and making future changes testable.

**F104 execution note:** Implemented the first route-section split by extracting shared dashboard controls, install controls/status, the full equipment section, and insights header/logs into dedicated components. Detailed install table/Pipeline rendering and insights analytics charts remain in `DashboardWorkspace.tsx` and should be handled by F107 rendering-boundary extraction.

**Files:**
- Modify: `src/features/dashboard/DashboardWorkspace.tsx`
- Create: `src/features/dashboard/DashboardInstallSection.tsx`
- Create: `src/features/dashboard/DashboardEquipmentSection.tsx`
- Create: `src/features/dashboard/DashboardInsightsSection.tsx`
- Create: `src/features/dashboard/DashboardSharedControls.tsx`
- Test: `tests/dashboardReports.test.ts`

- [x] **Step 1: Sync local main before branching**

Run:

```powershell
git checkout main
git pull --ff-only origin main
git status --short --branch
```

Expected: local `main` points at `743fce7faac85a41826ebbc8875ff98b2714e027` and is clean.

- [x] **Step 2: Create the F104 branch**

Run:

```powershell
git checkout -b codex/split-dashboard-route-sections
```

Expected: new branch is created from current `main`.

- [x] **Step 3: Extract shared controls first**

Move filter chips, saved filter controls, common sort/paging controls, and shared toolbar props from `DashboardWorkspace.tsx` into `DashboardSharedControls.tsx`.

Keep prop types explicit:

```ts
export type DashboardSharedControlsProps = {
  isAdmin: boolean;
  chips: Array<{ id: string; label: string; value: string; onClear: () => void }>;
  onClearInstallFilters: () => void;
  onClearEquipmentFilters: () => void;
};
```

Expected: no behavior change; only render ownership moves.

- [ ] **Step 4: Extract install section**

Create `DashboardInstallSection.tsx` and move install table, kanban, bulk governance controls, install modal triggers, and install action queue render logic into it.

Keep the role check as boolean capability, not a new role:

```ts
export type DashboardInstallSectionProps = {
  isAdmin: boolean;
  canUseAdminFeature: boolean;
};
```

Expected: `/dashboard/install` and `/dashboard` continue to show the same install workflow.

- [x] **Step 5: Extract equipment section**

Create `DashboardEquipmentSection.tsx` and move equipment table, equipment drawer open controls, equipment action queue render logic, and equipment modal trigger render logic into it.

Expected: `/dashboard/equipment` continues to support row open, drawer view, sort, paging, and blocking fields.

- [ ] **Step 6: Extract insights section**

Create `DashboardInsightsSection.tsx` and move analytics, governance report, logs, events, retention controls, and report download UI into it.

Expected: `/dashboard/insights` continues to switch analytics/logs without broadening access beyond `admin` checks already in the data hook.

- [x] **Step 7: Add regression coverage for extracted pure props**

If helper builders are introduced, add focused tests to `tests/dashboardReports.test.ts`.

Run:

```powershell
npm run test:unit
npm run typecheck
```

Expected: both pass.

- [x] **Step 8: Release F104**

Run:

```powershell
npm run sync:version
npm run verify:version
npm run verify:quality
npm run build
```

Expected: all pass, version files match the new F104 version, and role scan still shows only `admin` and `engineer`.

---

## Phase F105: Performance Baseline Gate

**Why now:** The current build has 32 static JS files and about 2.62MB of `.next/static` JavaScript. Future optimization must have an objective baseline, not only code review.

**Files:**
- Create: `scripts/collect-performance-baseline.cjs`
- Modify: `package.json`
- Modify: `.github/workflows/quality.yml`
- Create: `docs/performance-baselines.md`

- [ ] **Step 1: Add the scanner script**

Create `scripts/collect-performance-baseline.cjs` to report:
- count of `.next/static/**/*.js`
- total JS bytes
- top 10 largest JS files
- route list from build output when available

Expected script output shape:

```text
[perf] static JS files: 32
[perf] static JS bytes: 2619549
[perf] largest chunk: .next/static/chunks/<name>.js 930899
```

- [ ] **Step 2: Add npm script**

Modify `package.json`:

```json
"perf:baseline": "node scripts/collect-performance-baseline.cjs"
```

- [ ] **Step 3: Add non-blocking CI reporting**

Modify `.github/workflows/quality.yml` after the build step:

```yaml
- name: Collect performance baseline
  run: npm run perf:baseline
```

Expected: CI reports performance numbers but does not fail on size yet.

- [ ] **Step 4: Document the F103/F105 numbers**

Create `docs/performance-baselines.md` with the F103 baseline and F105 post-change baseline.

- [ ] **Step 5: Release F105**

Run:

```powershell
npm run verify:quality
npm run build
npm run perf:baseline
```

Expected: all pass and the baseline document is updated.

---

## Phase F106: Dependency And Audit Stabilization

**Why now:** High audit gate passes, but moderate audit still reports 4 advisories. The fix should align packages, not accept unsafe `--force` downgrade suggestions.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: full quality/build

- [ ] **Step 1: Align Next lint package with Next runtime**

Update `eslint-config-next` from `15.5.x` to the current compatible `16.2.x` line.

Run:

```powershell
npm install eslint-config-next@16.2.10
npm run lint
```

Expected: lint passes with Next 16 aligned tooling.

- [ ] **Step 2: Patch-compatible framework updates**

Update patch/minor-safe packages first:

```powershell
npm install next@16.2.10 react@19.2.7 react-dom@19.2.7 firebase@12.15.0 postcss@8.5.16
```

Expected: lockfile updates without major package jumps.

- [ ] **Step 3: Investigate Excel import dependency path**

Check whether current `exceljs` still requires vulnerable `uuid`.

Run:

```powershell
npm ls exceljs uuid
npm audit --audit-level=moderate
```

Expected: if no safe direct upgrade is available, document the residual risk and keep the high gate. Do not force install `exceljs@3.4.0`.

- [ ] **Step 4: Full verification**

Run:

```powershell
npm run verify:quality
npm run build
```

Expected: quality/build pass; audit state is either clean or explicitly documented.

---

## Phase F107: Memoized Rendering Boundaries

**Why now:** Route section split improves maintainability; memoized table and kanban rows reduce rerender cost during filter, modal, drawer, and toast state changes.

**Files:**
- Create: `src/features/dashboard/InstallationTable.tsx`
- Create: `src/features/dashboard/EquipmentTable.tsx`
- Create: `src/features/dashboard/InstallationKanban.tsx`
- Modify: `src/features/dashboard/DashboardInstallSection.tsx`
- Modify: `src/features/dashboard/DashboardEquipmentSection.tsx`

- [ ] **Step 1: Extract install table rows**

Create memoized row components that receive row data and stable callbacks by row id.

```ts
export const InstallationTableRow = memo(function InstallationTableRow(props: {
  row: Installation;
  onOpen: (id: string) => void;
}) {
  return null;
});
```

Replace `return null` with the current row markup during implementation.

- [ ] **Step 2: Extract equipment rows**

Create memoized equipment rows with id-based open handlers.

- [ ] **Step 3: Extract kanban cards**

Create memoized kanban card components and keep phase grouping in the parent view model.

- [ ] **Step 4: Manual interaction verification**

Verify:
- install row opens edit modal
- equipment row opens drawer
- install kanban card opens the same edit flow
- sort and pagination still work

---

## Phase F108: CSS Ownership Split

**Why now:** `globals.css` is 2,606 lines and has mixed app shell, admin, dashboard, table, and modal styling. This makes visual regressions hard to isolate.

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/app/styles/dashboard.css`
- Create: `src/app/styles/admin.css`
- Create: `src/app/styles/components.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Move dashboard-only selectors**

Move dashboard table, kanban, drawer, and insight selectors into `dashboard.css`.

- [ ] **Step 2: Move admin-only selectors**

Move admin menu and admin page utility selectors into `admin.css`.

- [ ] **Step 3: Move reusable component selectors**

Move badge, button, modal, and form utility selectors into `components.css`.

- [ ] **Step 4: Verify visual baseline**

Run:

```powershell
npm run build
```

Then manually inspect `/dashboard/install`, `/dashboard/equipment`, `/dashboard/insights`, and `/admin/users`.

---

## Phase F109: Insights Summary Data Plan

**Why now:** F103 keeps Insights analytics as full data for correctness. Long-term scale requires summaries or targeted aggregate reads.

**Files:**
- Create: `docs/firestore-insights-summary-plan.md`
- Later modify: `src/features/data/installations.ts`
- Later modify: `src/features/data/equipments.ts`
- Later modify: import/write service paths if summary docs are adopted.

- [ ] **Step 1: Document summary doc schema**

Draft summary documents for:
- install counts by phase/region/engineer
- equipment counts by status/region/customer
- SLA aging and overdue counts
- blocking counts by reason/owner

- [ ] **Step 2: Document index requirements**

Document Firestore indexes for:
- `installations.updatedAt desc`
- `installations.region + updatedAt desc`
- `installations.phase + updatedAt desc`
- `equipments.updatedAt desc`
- `equipments.region + updatedAt desc`
- `equipments.statusMain + updatedAt desc`

- [ ] **Step 3: Choose writer strategy**

Pick one:
- write-time summary updates for low write volume
- scheduled aggregation for higher write volume

Keep `admin` and `engineer` as the only role types.

---

## Release Rules For Every Code Phase

- Keep user roles limited to `admin` and `engineer`.
- Bump `package.json.version`.
- Run `npm run sync:version`.
- Run `npm run verify:version`.
- Add a release note to `src/features/dashboard/SystemStatusPage.tsx`.
- Run `npm run verify:quality`.
- Run `npm run build`.
- Open a `codex/*` PR.
- Wait for GitHub Actions and Vercel preview.
- Merge after checks pass.
- Wait for production deployment.
- Verify production `/version.json`, homepage HTTP 200, and Vercel production error/fatal logs.

## Immediate Recommendation

Start with F104. It lowers the main development risk without changing Firestore schema or role semantics, and it creates clean component ownership for the later performance and CSS phases.
