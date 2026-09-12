import { useState } from "react";
import { type FormFieldTheme } from "@/components/ui/FormField";
import { useApiMutation } from "@/components/hooks/useApiMutation";
import { TablesTab } from "@/components/wedding/TablesTab";
import { GuestsTab } from "@/components/wedding/GuestsTab";
import { ConflictsTab } from "@/components/wedding/ConflictsTab";
import { AssignmentBoard } from "@/components/wedding/AssignmentBoard";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Assignment, Conflict, Guest, Table, Wedding } from "@/types";

type TabKey = "tables" | "guests" | "conflicts" | "seating";

const TABS: { key: TabKey; label: string }[] = [
  { key: "tables", label: "Stoły" },
  { key: "guests", label: "Goście" },
  { key: "conflicts", label: "Konflikty" },
  { key: "seating", label: "Rozsadzanie" },
];

// Light wedding palette (bg-wedding background), injected into the shared FormField.
const fieldTheme: FormFieldTheme = {
  labelClassName: "text-slate-600",
  inputClassName: "border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:ring-rose-400",
  inputErrorClassName: "border-red-400 focus:ring-red-400",
  errorClassName: "text-red-600",
};
const serverErrorClass = "border-red-300 bg-red-50 text-red-700";

interface Props {
  initialWedding: Wedding;
  initialTables: Table[];
  initialGuests?: Guest[];
  initialConflicts?: Conflict[];
  initialAssignments?: Assignment[];
}

export default function WeddingWorkspace({
  initialWedding,
  initialTables,
  initialGuests = [],
  initialConflicts = [],
  initialAssignments = [],
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("tables");
  const [wedding, setWedding] = useState(initialWedding);
  const [tables, setTables] = useState(initialTables);
  const [guests, setGuests] = useState(initialGuests);
  const [conflicts, setConflicts] = useState(initialConflicts);
  const [assignments, setAssignments] = useState(initialAssignments);

  const [nameDraft, setNameDraft] = useState(initialWedding.name);

  const rename = useApiMutation<Wedding>("Nie udało się zapisać nazwy.");

  async function saveName() {
    if (rename.pending) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      rename.setError("Nazwa wesela nie może być pusta.");
      setNameDraft(wedding.name);
      return;
    }
    if (trimmed === wedding.name) {
      rename.setError(null);
      return;
    }
    const data = await rename.run({ url: ROUTES.apiWedding, method: "PATCH", body: { name: trimmed } });
    if (!data) {
      setNameDraft(wedding.name);
      return;
    }
    setWedding(data);
    setNameDraft(data.name);
  }

  function onTableCreated(table: Table) {
    setTables((prev) => [...prev, table]);
  }
  // Resize: swap the table (new seats) and drop assignments freed by a shrink so guests reappear + violations recompute.
  function onTableUpdated(table: Table, unassignedGuestIds: string[]) {
    setTables((prev) => prev.map((t) => (t.id === table.id ? table : t)));
    if (unassignedGuestIds.length > 0) {
      const freed = new Set(unassignedGuestIds);
      setAssignments((prev) => prev.filter((a) => !freed.has(a.guestId)));
    }
  }
  function onTableDeleted(tableId: string, unassignedGuestIds: string[]) {
    setTables((prev) => prev.filter((t) => t.id !== tableId));
    if (unassignedGuestIds.length > 0) {
      const freed = new Set(unassignedGuestIds);
      setAssignments((prev) => prev.filter((a) => !freed.has(a.guestId)));
    }
  }

  function onGuestCreated(guest: Guest) {
    setGuests((prev) => [...prev, guest]);
  }
  function onGuestUpdated(guest: Guest) {
    setGuests((prev) => prev.map((g) => (g.id === guest.id ? guest : g)));
  }
  // Deleting a guest also drops any conflict AND any assignment referencing them (DB cascades; mirror in state).
  function onGuestDeleted(id: string) {
    setGuests((prev) => prev.filter((g) => g.id !== id));
    setConflicts((prev) => prev.filter((c) => c.guestAId !== id && c.guestBId !== id));
    setAssignments((prev) => prev.filter((a) => a.guestId !== id));
  }
  function onConflictCreated(conflict: Conflict) {
    setConflicts((prev) => [...prev, conflict]);
  }
  function onConflictDeleted(id: string) {
    setConflicts((prev) => prev.filter((c) => c.id !== id));
  }
  // Assign/move: upsert by guestId (a move frees the old seat, so replace the guest's row).
  function onAssigned(assignment: Assignment) {
    setAssignments((prev) => [...prev.filter((a) => a.guestId !== assignment.guestId), assignment]);
  }
  function onUnassigned(guestId: string) {
    setAssignments((prev) => prev.filter((a) => a.guestId !== guestId));
  }

  return (
    <div>
      <div>
        <input
          value={nameDraft}
          onChange={(e) => {
            setNameDraft(e.target.value);
            if (rename.error) rename.setError(null);
          }}
          onBlur={() => {
            void saveName();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          disabled={rename.pending}
          aria-label="Nazwa wesela"
          className={cn(
            "w-full bg-transparent text-3xl font-bold text-rose-600 caret-rose-500 outline-none",
            "border-b border-transparent transition-colors focus:border-rose-300 disabled:opacity-60",
          )}
        />
        {rename.error ? <p className="mt-1 text-sm text-red-600">{rename.error}</p> : null}
      </div>

      <div className="mt-6 flex gap-1 border-b border-rose-100" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => {
              setActiveTab(tab.key);
            }}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "border-rose-500 text-rose-600"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "tables" && (
        <div className="mx-auto mt-6 max-w-2xl">
          <TablesTab
            fieldTheme={fieldTheme}
            serverErrorClass={serverErrorClass}
            tables={tables}
            assignments={assignments}
            onTableCreated={onTableCreated}
            onTableUpdated={onTableUpdated}
            onTableDeleted={onTableDeleted}
          />
        </div>
      )}

      {activeTab === "guests" && (
        <div className="mx-auto mt-6 max-w-2xl">
          <GuestsTab
            fieldTheme={fieldTheme}
            serverErrorClass={serverErrorClass}
            guests={guests}
            onCreated={onGuestCreated}
            onUpdated={onGuestUpdated}
            onDeleted={onGuestDeleted}
          />
        </div>
      )}

      {activeTab === "conflicts" && (
        <div className="mx-auto mt-6 max-w-2xl">
          <ConflictsTab
            serverErrorClass={serverErrorClass}
            guests={guests}
            conflicts={conflicts}
            onCreated={onConflictCreated}
            onDeleted={onConflictDeleted}
          />
        </div>
      )}

      {activeTab === "seating" && (
        <div className="mt-6">
          <AssignmentBoard
            tables={tables}
            guests={guests}
            assignments={assignments}
            conflicts={conflicts}
            onAssigned={onAssigned}
            onUnassigned={onUnassigned}
          />
        </div>
      )}
    </div>
  );
}
