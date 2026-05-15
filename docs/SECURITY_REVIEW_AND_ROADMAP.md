# Security Review and Roadmap

Date: 2026-05-15

## Fixed in this pass

- Firestore access now requires a signed-in `@premtek.com.tw` account at the rules layer, not only in frontend code.
- Users can only bootstrap their own profile as `engineer`; admin role changes remain admin-only.
- User documents are no longer readable by every signed-in user; users can read their own profile, admins can read all.
- Installation deletion is now admin-only.
- Security headers were added for content sniffing, framing, referrer, browser permissions, and opener isolation.
- Excel import entry points now reject non-Excel files, files larger than 5 MB, and sheets over 1200 parsed rows.
- Excel import and template export were migrated from vulnerable `xlsx` to `exceljs`; legacy `.xls` upload is no longer accepted.
- The local DOCX UI refuses non-localhost binding unless explicitly allowed, caps JSON request size, validates base64, and caps uploaded photo bytes.
- Next.js was updated to `16.2.6`; top-level PostCSS was updated to `8.5.14`.

## Residual risks

- `npm audit` still reports Next's internal `postcss@8.4.31`. This is bundled by Next and cannot be safely overridden without an invalid dependency tree. Track the next upstream Next release and re-run `npm audit`.
- Firestore writes still allow all company engineers to create/update installation and equipment records. If this data is sensitive by region or team, add region-scoped roles.
- Audit/event logs are client-written. For tamper-resistant audit trails, move privileged mutations through server-side endpoints or Cloud Functions.

## Recommended Feature Plan

1. Role model v2: add `admin`, `manager`, `engineer`, `viewer`, and optional region scope.
2. Server-side mutation layer: route deletes, role changes, imports, and migrations through Cloud Functions or Next route handlers with Admin SDK verification.
3. Import hardening: add duplicate preview, import dry-run, rejected-row export, and background batch processing.
4. Audit and retention: immutable server-side audit logs, retention scheduler, and admin dashboard for purge history.
5. Security operations: Firebase App Check, MFA requirement for admins, deployment checklist, and scheduled dependency audit.
6. Monitoring: auth failure metrics, import failure metrics, Firestore rule denial alerts, and production error reporting.
