# Admin Table Columns Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to show/hide existing Clients table columns with preferences persisted in localStorage.

**Architecture:** Add a column config in `ClientsTable` with admin-only controls that toggle `visibleColumns`. Persist selections to localStorage and render table headers/cells from the filtered column list. Wire `role` down from `App` so only admins see the control.

**Tech Stack:** React 18, Vite, Jest + React Testing Library, localStorage.

---

### Task 1: Add column manager UI + persistence in ClientsTable

**Files:**
- Create: `src/__tests__/ClientsTable.test.jsx`
- Modify: `src/components/ClientsTable.jsx`

**Step 1: Write the failing test**

```jsx
import { render, screen, fireEvent } from "@testing-library/react";
import ClientsTable from "../components/ClientsTable";

const baseClients = [];
const baseFilters = {
  searchTerm: "",
  filterPhase: "",
  filterPackage: "",
  filterPayment: "",
  filterAssignedTo: "",
};

const handlers = {
  onViewClient: jest.fn(),
  onEditClient: jest.fn(),
  onMoveClient: jest.fn(),
};

describe("ClientsTable column visibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("allows admins to hide a column and updates empty state colSpan", () => {
    render(
      <ClientsTable
        clients={baseClients}
        filters={baseFilters}
        role="admin"
        {...handlers}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(screen.getByLabelText(/business/i));

    expect(screen.queryByText("Business")).toBeNull();
    const emptyCell = screen.getByText(/no clients found/i).closest("td");
    expect(emptyCell).toHaveAttribute("colspan", "6");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/ClientsTable.test.jsx`

Expected: FAIL because column controls don’t exist yet.

**Step 3: Write minimal implementation**

In `src/components/ClientsTable.jsx`, add:

```jsx
const AVAILABLE_COLUMNS = [
  { id: "priority", label: "Priority" },
  { id: "clientName", label: "Client Name" },
  { id: "business", label: "Business" },
  { id: "phase", label: "Phase" },
  { id: "lastActivity", label: "⏰ Last Activity" },
  { id: "assignedTo", label: "Assigned To" },
  { id: "actions", label: "Actions" },
];

const DEFAULT_VISIBLE_COLUMNS = AVAILABLE_COLUMNS.map((col) => col.id);
const STORAGE_KEY = "gaia_table_columns";

const [visibleColumns, setVisibleColumns] = useState(() => {
  if (role !== "admin") return DEFAULT_VISIBLE_COLUMNS;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const valid = stored.filter((id) => DEFAULT_VISIBLE_COLUMNS.includes(id));
    return valid.length > 0 ? valid : DEFAULT_VISIBLE_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
});

const [showColumnsMenu, setShowColumnsMenu] = useState(false);

const toggleColumn = (id) => {
  setVisibleColumns((prev) => {
    if (prev.includes(id)) {
      if (prev.length === 1) return prev;
      const next = prev.filter((colId) => colId !== id);
      if (role === "admin") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    }
    const next = [...prev, id];
    if (role === "admin") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    return next;
  });
};

const resetColumns = () => {
  setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
  if (role === "admin") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_VISIBLE_COLUMNS));
  }
};
```

Render the admin-only control above the table:

```jsx
{role === "admin" && (
  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setShowColumnsMenu((prev) => !prev)}
      >
        Columns
      </button>
      {showColumnsMenu && (
        <div style={{ position: "absolute", right: 0, top: "110%", zIndex: 5, background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.75rem", minWidth: "200px" }}>
          {AVAILABLE_COLUMNS.map((col) => (
            <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <input
                type="checkbox"
                checked={visibleColumns.includes(col.id)}
                onChange={() => toggleColumn(col.id)}
              />
              {col.label}
            </label>
          ))}
          <button type="button" className="btn btn-secondary" onClick={resetColumns}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  </div>
)}
```

Update table rendering to only output visible columns and set empty-state `colSpan` based on `visibleColumns.length`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/ClientsTable.test.jsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/ClientsTable.jsx src/__tests__/ClientsTable.test.jsx
git commit -m "feat: add admin column visibility for clients table"
```

---

### Task 2: Wire admin role to ClientsTable

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/PhasesContainer.jsx`

**Step 1: Write the failing test**

If needed, add a small test that renders `PhasesContainer` with `role="admin"` and verifies the Columns button appears; otherwise skip if not adding tests for this wiring.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/ClientsTable.test.jsx`

Expected: FAIL if you added the wiring test.

**Step 3: Write minimal implementation**

In `src/App.jsx`, pass `role` into `PhasesContainer`:

```jsx
<PhasesContainer
  role={role}
  ...
/>
```

In `src/components/PhasesContainer.jsx`, accept `role` and pass it to `ClientsTable`:

```jsx
const PhasesContainer = ({ role, clients, filters, ... }) => {
  ...
  <ClientsTable role={role} ... />
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/ClientsTable.test.jsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/App.jsx src/components/PhasesContainer.jsx
git commit -m "chore: pass role to clients table"
```

---

### Notes
- Use try/catch around localStorage access for resilience.
- Ensure empty-state `colSpan` is `visibleColumns.length`.
- Keep at least one column selected (ignore uncheck if it’s the last).
