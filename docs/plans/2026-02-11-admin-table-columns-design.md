# Admin-Managed Table Columns Design

## Goal
Allow admins to show/hide existing Clients table columns, with preferences persisted per browser.

## Scope
- Table view only (no kanban changes).
- Existing columns only: Priority, Client Name, Business, Phase, Last Activity, Assigned To, Actions.
- Admin-only UI to manage column visibility.

## UI/UX
- Add an admin-only "Columns" control in the table view, near the table header.
- Control opens a lightweight checklist of available columns.
- Toggling a checkbox immediately shows/hides the column.
- Include "Reset to default" to restore all columns.
- Prevent hiding all columns (keep at least one selected).

## Data Flow
- `ClientsTable` defines a static `availableColumns` array with ids, labels, and render functions.
- `visibleColumns` state initializes from localStorage; default to all columns.
- Render headers and cells by filtering `availableColumns` by `visibleColumns`.
- Empty-state `colSpan` equals the number of visible columns.

## Persistence
- Store column visibility in localStorage (key: `gaia_table_columns`).
- Read on initial render; ignore unknown ids for forward compatibility.
- On localStorage read/write failure, fall back to default visibility.

## Access Control
- Admin-only: control is visible when role is `admin`.
- Non-admins always see the full default column set.

## Edge Cases
- If all columns are deselected, block the last unchecked or auto-reselect the first column.
- If localStorage value is malformed, ignore and revert to defaults.

## Testing
- Manual: verify toggle persists on reload, empty state alignment, admin-only control.
- Optional unit test: toggle a column and confirm header count and `colSpan` update.
