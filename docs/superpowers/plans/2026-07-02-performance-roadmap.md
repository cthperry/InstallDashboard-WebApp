# InstallDashboard Performance Optimization Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue improving overall performance while preserving the current two-role model: `admin` and `engineer`.

**Architecture:** The app is a Next.js 16 / React 19 Firebase dashboard. Current F102 work already optimized many pure aggregation paths; the next gains should come from reducing realtime data volume, splitting the 151KB dashboard client component into route-specific shells, and adding repeatable performance evidence to CI.

**Tech Stack:** Next.js 16, React 19, Firebase Auth/Firestore, TypeScript, ESLint, custom unit runner, GitHub Actions, Vercel.

---

## Current Scan Summary

**Baseline inspected on:** 2026-07-02 Asia/Taipei.

**Current version:** `20260629-F102`.

**Current branch state:** `main...origin/main`, clean before creating this plan.

**Important files scanned:**
- `package.json`
- `next.config.ts`
- `src/app/layout.tsx`
- `src/app/providers.tsx`
- `src/features/dashboard/DashboardWorkspace.tsx`
- `src/features/dashboard/hooks/useDashboardData.ts`
- `src/features/data/installations.ts`
- `src/features/data/equipments.ts`
- `src/features/data/logs.ts`
- `src/domain/userRoles.ts`
- `firestore.rules`
- `.github/workflows/quality.yml`

**Findings:**
- `DashboardWorkspace.tsx` is still the largest dashboard file at about 151KB.
- `listenInstallations()` and `listenEquipments()` subscribe to full collections ordered by `updatedAt`, without limit, pagination, or route-specific Firestore filters.
- Logs already have bounded listeners: audit logs default to 80 rows and events default to 200 rows over 7 days.
- `SmartImportModal` and `GanttView` are dynamically imported, but the base dashboard workspace still contains install, equipment, insights, logs, forms, drawers, and controls in one client component.
- `src/app/layout.tsx` exports `dynamic = "force-dynamic"`, making the entire root layout dynamic even though most app shell work is client/auth driven.
- Role model is currently constrained to `admin` and `engineer` in `src/domain/userRoles.ts` and `firestore.rules`.
- CI currently runs version verification, unit tests, lint, typecheck, high audit gate, and production build.

---

## Recommended Execution Order

### Phase F103: Route-Scoped Realtime Data Listeners

**Why now:** Firestore full collection snapshots are the biggest remaining scalability risk. UI aggregation improvements help after data arrives; this phase reduces data transfer and client memory before render.

**Files:**
- Modify: `src/features/data/installations.ts`
- Modify: `src/features/data/equipments.ts`
- Modify: `src/features/dashboard/hooks/useDashboardData.ts`
- Test: `tests/dashboardReports.test.ts` or create `tests/dashboardDataPlan.test.ts` if query option helpers are extracted.

- [x] **Step 1: Extract listener option types**

Add explicit listener options without changing the existing default behavior:

```ts
export type InstallationListenOptions = {
  maxRows?: number;
};

export type EquipmentListenOptions = {
  maxRows?: number;
};
```

- [x] **Step 2: Implement bounded query construction**

Keep existing no-option behavior unchanged. When `maxRows` is provided, append Firestore `limit(maxRows)`:

```ts
export function listenInstallations(
  onData: (rows: Installation[]) => void,
  onError?: (e: unknown) => void,
  options: InstallationListenOptions = {},
) {
  const constraints = [orderBy("updatedAt", "desc")];
  if (options.maxRows && options.maxRows > 0) constraints.push(limit(options.maxRows));
  const q = query(collection(db, COL), ...constraints);
  return onSnapshot(q, /* existing mapper */, (e) => onError?.(e));
}
```

- [x] **Step 3: Apply conservative dashboard defaults**

In `useDashboardData`, use bounded reads for normal dashboard sections:

```ts
const DASHBOARD_INSTALL_LIMIT = 600;
const DASHBOARD_EQUIPMENT_LIMIT = 600;

listenInstallations(onRows, onError, { maxRows: DASHBOARD_INSTALL_LIMIT });
listenEquipments(onRows, onError, { maxRows: DASHBOARD_EQUIPMENT_LIMIT });
```

For analytics pages that need full data, keep a separate option path until a server-side summary exists:

```ts
const needsFullInstallDataset = section === "insights" && insightsTab === "analytics";
const installOptions = needsFullInstallDataset ? {} : { maxRows: DASHBOARD_INSTALL_LIMIT };
```

- [x] **Step 4: Verify**

Run:

```powershell
npm run test:unit
npm run typecheck
npm run verify:quality
npm run build
```

Expected: all pass.

### Phase F104: Split DashboardWorkspace Into Route-Specific Client Shells

**Why now:** `DashboardWorkspace.tsx` contains install table, kanban, equipment table/drawer, insights, logs, modals, and shared controls. Splitting reduces parse/compile work and makes future optimizations safer.

**Files:**
- Create: `src/features/dashboard/DashboardInstallSection.tsx`
- Create: `src/features/dashboard/DashboardEquipmentSection.tsx`
- Create: `src/features/dashboard/DashboardInsightsSection.tsx`
- Create: `src/features/dashboard/DashboardSharedControls.tsx`
- Modify: `src/features/dashboard/DashboardWorkspace.tsx`

- [ ] **Step 1: Move install-only render block**

Move the install section render path from `DashboardWorkspace.tsx` into `DashboardInstallSection.tsx`. Pass only primitive props and stable handlers needed by that section.

- [ ] **Step 2: Move equipment-only render block**

Move equipment table, drawer open controls, equipment action queue, and equipment modal render ownership into `DashboardEquipmentSection.tsx`.

- [ ] **Step 3: Move insights/logs render block**

Move analytics, governance, audit logs, events, and report download UI into `DashboardInsightsSection.tsx`.

- [ ] **Step 4: Keep role invariant**

Do not add roles. Keep all access checks as:

```ts
const canUseAdminFeature = isAdmin;
```

- [ ] **Step 5: Verify**

Run:

```powershell
npm run test:unit
npm run typecheck
npm run verify:quality
npm run build
```

Expected: all pass and no role strings other than `admin` / `engineer` are introduced.

### Phase F105: Route-Level Dynamic Imports For Heavy Admin/Import Surfaces

**Why now:** Smart import and Gantt are already lazy. Legacy import modals, system status, and admin-heavy surfaces can be further isolated so ordinary install/equipment work pays less JS cost.

**Files:**
- Modify: `src/features/dashboard/DashboardWorkspace.tsx`
- Modify: `src/features/dashboard/ImportExcelModal.tsx`
- Modify: `src/features/dashboard/ImportEquipmentModal.tsx`
- Modify: `src/features/dashboard/SystemStatusPage.tsx`

- [ ] **Step 1: Lazy load legacy import modals**

Use `next/dynamic` with `ssr: false` for old Excel import modals, matching the existing `SmartImportModal` pattern.

- [ ] **Step 2: Lazy load system-only operational panels**

Ensure deployment/version/import-session history UI is only loaded by `/dashboard/system`.

- [ ] **Step 3: Verify bundle impact**

Run:

```powershell
npm run build
```

Expected: production build succeeds. Record route output and compare with the previous build logs.

### Phase F106: Rendering Boundaries For Large Tables And Kanban

**Why now:** Current table paging limits visible rows to 120, but the table and kanban rows are still rendered inside the main dashboard component. Memoized row components reduce rerender cost during filter, modal, toast, and form changes.

**Files:**
- Create: `src/features/dashboard/InstallationTable.tsx`
- Create: `src/features/dashboard/EquipmentTable.tsx`
- Create: `src/features/dashboard/InstallationKanban.tsx`
- Modify: `src/features/dashboard/DashboardWorkspace.tsx`

- [ ] **Step 1: Extract memoized row components**

Use `React.memo` for row components that receive stable row data and event handlers.

- [ ] **Step 2: Keep callbacks stable**

Use `useCallback` in the parent and pass row ids where possible:

```ts
const handleOpenInstallById = useCallback((id: string) => {
  const row = installationById.get(id);
  if (row) openEditInstall(row);
}, [installationById, openEditInstall]);
```

- [ ] **Step 3: Verify interaction behavior**

Manually verify:
- clicking install row opens edit modal
- clicking equipment row opens drawer
- sorting still works
- paging still works

Run:

```powershell
npm run verify:quality
npm run build
```

### Phase F107: Production Performance Evidence Gate

**Why now:** The project has quality gates but no repeatable performance budget. Future work needs objective evidence, not only code review.

**Files:**
- Create: `scripts/collect-performance-baseline.cjs`
- Modify: `package.json`
- Modify: `.github/workflows/quality.yml`
- Create: `docs/performance-baselines.md`

- [ ] **Step 1: Add a build artifact scanner**

Script should run after `next build` and report route count, largest emitted JS assets, and total `.next/static` JS size.

- [ ] **Step 2: Add package script**

```json
"perf:baseline": "node scripts/collect-performance-baseline.cjs"
```

- [ ] **Step 3: Add non-blocking CI report first**

Add to `quality.yml` after build:

```yaml
- name: Collect performance baseline
  run: npm run perf:baseline
```

- [ ] **Step 4: Convert to budget after two releases**

Once F107 and F108 have baseline data, fail CI only if a route or total JS grows above the agreed threshold.

### Phase F108: Firestore Query Index And Server Summary Plan

**Why now:** Analytics still needs broad datasets. The proper long-term fix is not more client loops; it is precomputed summary documents or targeted aggregate queries.

**Files:**
- Create: `docs/firestore-performance-index-plan.md`
- Modify later: `src/features/data/installations.ts`
- Modify later: `src/features/data/equipments.ts`
- Modify later: Firebase scheduled job or admin import/write paths if summary docs are introduced.

- [ ] **Step 1: Document required indexes**

Document indexes for:
- `installations.updatedAt desc`
- `installations.phase + updatedAt desc`
- `installations.region + updatedAt desc`
- `equipments.updatedAt desc`
- `equipments.region + updatedAt desc`
- `equipments.statusMain + updatedAt desc`

- [ ] **Step 2: Decide summary writer**

Use write-time summary updates if import/write volume is low. Use scheduled aggregation if write volume grows.

- [ ] **Step 3: Move Insights to summary docs**

Replace expensive client analytics for default view with summary docs, keeping full client recompute only as an admin diagnostic fallback.

---

## Recommended Priority

1. F103 route-scoped realtime listeners.
2. F104 split `DashboardWorkspace.tsx`.
3. F107 performance baseline script.
4. F106 memoized large rendering boundaries.
5. F105 lazy load remaining heavy surfaces.
6. F108 Firestore summary/index plan.

## Release Rules For Each Code Phase

For every code-changing phase:
- Keep roles limited to `admin` and `engineer`.
- Bump `package.json.version`.
- Run `npm run sync:version`.
- Run `npm run verify:version`.
- Add a release note in `src/features/dashboard/SystemStatusPage.tsx`.
- Run `npm run verify:quality`.
- Run `npm run build`.
- Push a `codex/*` branch, open PR, wait for GitHub Actions and Vercel preview, merge, wait for production, verify `/version.json`, homepage, and runtime error logs.

## Residual Risk

The largest remaining risk is data volume: full realtime collection snapshots can become expensive even if render-time loops are optimized. The second risk is maintainability: `DashboardWorkspace.tsx` is large enough that small optimizations are becoming harder to reason about. The plan above addresses those risks first.
