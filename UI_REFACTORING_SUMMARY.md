# UI Theme Refactoring Report

## Completed Refactorings

### 1. App.tsx
- **Login View:** Complete refactor for Light Mode compatibility. Replaced hardcoded dark styles with theme-aware classes.
- **Register View:** Verified and updated input and button styles.
- **Admin View:** Updated tables, modals, and headers. Removed hardcoded `bg-zinc-950` and `text-zinc-300`.
- **Audit View:** Refactored tables to use `bg-white dark:bg-zinc-900` and `bg-slate-50 dark:bg-zinc-950`.
- **Management View:** Ensured card layouts and lists are theme-aware.
- **Line Stop Dashboard:** Updated input fields, tables, and modals.
- **Preview Modals:** Updated Checklist and Meeting preview modals to support light mode backgrounds and text colors.

### 2. ChecklistModule.tsx
- Removed hardcoded `bg-zinc-900` from cards.
- Updated Input and Select fields to use `bg-white dark:bg-zinc-950`.
- Ensured text contrast in both modes.

### 3. LineStopModule.tsx
- Refactored form inputs and modals.
- Updated table headers and rows for better contrast.

### 4. MaintenanceModule.tsx
- Updated QR Code scanning interface.
- Refactored maintenance forms and history views.

### 5. ScrapModule.tsx
- **Huge Refactor:** Addressed all sub-components (`ScrapForm`, `ScrapPending`, `ScrapHistory`, `ScrapOperational`, `ScrapManagementAdvanced`).
- Standardized inputs, tables, and modals across the module.

## Verification
- Run `npm run dev` to verify changes locally.
- Check Login/Register screens in Light Mode.
- Verify Admin tables in Light Mode.
- Verify Audit logs in Light Mode.
- Verify Checklist and Line Stop modals in Light Mode.
