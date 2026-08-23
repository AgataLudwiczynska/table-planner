import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { ServerError } from "@/components/ui/ServerError";
import { useApiMutation } from "@/components/hooks/useApiMutation";
import { usePanelDropTarget, useSeatMonitor, type DropCommit } from "@/components/hooks/useSeatDnd";
import { GuestChip, TableRing } from "@/components/wedding/TableRing";
import { validateAllTables } from "@/lib/adjacency";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Assignment, Conflict, Guest, Table } from "@/types";

export const PANEL_WIDTH_CLASS = "lg:w-72";

const serverErrorClass = "border-red-300 bg-red-50 text-red-700";

interface Props {
  tables: Table[];
  guests: Guest[];
  assignments: Assignment[];
  conflicts: Conflict[];
  onAssigned: (assignment: Assignment) => void;
  onUnassigned: (guestId: string) => void;
}

export function AssignmentBoard({ tables, guests, assignments, conflicts, onAssigned, onUnassigned }: Props) {
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);

  const assign = useApiMutation<Assignment>("Nie udało się przypisać gościa do miejsca.");
  const release = useApiMutation<{ guestId: string }>("Nie udało się zwolnić miejsca.");

  const guestById = new Map(guests.map((g) => [g.id, g]));
  const assignmentByGuestId = new Map(assignments.map((a) => [a.guestId, a]));
  const assignmentBySeatId = new Map(assignments.map((a) => [a.seatId, a]));
  const unassignedGuests = guests.filter((g) => !assignmentByGuestId.has(g.id));

  // Pure re-derivation on every render: assignments/conflicts changes re-run the full adjacency scan.
  const violations = validateAllTables(tables, assignments, conflicts);
  const violatingSeatIds = new Set(violations.flatMap((v) => [v.seatAId, v.seatBId]));
  const tableById = new Map(tables.map((t) => [t.id, t]));
  const seatNumberById = new Map(tables.flatMap((t) => t.seats.map((s) => [s.id, s.seatNumber] as const)));
  const guestName = (id: string) => {
    const guest = guestById.get(id);
    return guest ? `${guest.firstName} ${guest.lastName}` : "—";
  };

  // The one place both the DnD monitor and the click fallback commit an assign/move.
  async function assignGuestToSeat(guestId: string, seatId: string) {
    const data = await assign.run({ url: ROUTES.apiAssignments, method: "POST", body: { guestId, seatId } });
    if (!data) return;
    onAssigned(data);
    setSelectedGuestId(null);
  }
  async function unassignGuest(guestId: string) {
    const data = await release.run({ url: ROUTES.apiAssignments, method: "DELETE", body: { guestId } });
    if (!data) return;
    onUnassigned(data.guestId);
  }

  // Commit reads ids from the drop event; a panel drop only unassigns an actually-seated guest.
  function handleDrop({ guestId, seatId, toPanel }: DropCommit) {
    if (seatId) {
      void assignGuestToSeat(guestId, seatId);
    } else if (toPanel && assignmentByGuestId.has(guestId)) {
      void unassignGuest(guestId);
    }
  }
  useSeatMonitor(handleDrop);

  function selectGuest(guestId: string) {
    assign.setError(null);
    setSelectedGuestId((prev) => (prev === guestId ? null : guestId));
  }
  function handleSeatClick(seatId: string) {
    if (!selectedGuestId) return;
    void assignGuestToSeat(selectedGuestId, seatId);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedGuestId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const panelRef = useRef<HTMLDivElement>(null);
  const [panelOver, setPanelOver] = useState(false);
  usePanelDropTarget(panelRef, setPanelOver);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside
        ref={panelRef}
        className={cn(
          "shrink-0 rounded-xl border bg-white/70 p-4 lg:sticky lg:top-4 lg:self-start",
          PANEL_WIDTH_CLASS,
          panelOver ? "border-rose-400 ring-2 ring-rose-200" : "border-rose-100",
        )}
      >
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Nieprzypisani goście</h3>
        {unassignedGuests.length === 0 ? (
          <p className="text-sm text-slate-500">Wszyscy goście mają miejsca.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
            {unassignedGuests.map((guest) => (
              <li key={guest.id}>
                <GuestChip guest={guest} seatId={null} selected={selectedGuestId === guest.id} onSelect={selectGuest} />
              </li>
            ))}
          </ul>
        )}
        <ServerError message={release.error} className={cn(serverErrorClass, "mt-3")} />
      </aside>

      <div className="min-w-0 flex-1">
        <ServerError message={assign.error} className={cn(serverErrorClass, "mb-4")} />
        {violations.length > 0 && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              Naruszone konflikty sąsiedztwa ({violations.length})
            </h3>
            <ul className="space-y-1 text-sm text-red-700">
              {violations.map((v) => {
                const tableName = tableById.get(v.tableId)?.name ?? "—";
                const seatA = seatNumberById.get(v.seatAId) ?? "?";
                const seatB = seatNumberById.get(v.seatBId) ?? "?";
                return (
                  <li key={`${v.seatAId}|${v.seatBId}`}>
                    {guestName(v.guestAId)} i {guestName(v.guestBId)} — {tableName}, miejsca {seatA} i {seatB}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {tables.length === 0 ? (
          <p className="text-sm text-slate-500">Najpierw dodaj stół w zakładce „Stoły”.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {tables.map((table) => (
              <TableRing
                key={table.id}
                table={table}
                assignmentBySeatId={assignmentBySeatId}
                guestById={guestById}
                violatingSeatIds={violatingSeatIds}
                selectedGuestId={selectedGuestId}
                onSelectGuest={selectGuest}
                onSeatClick={handleSeatClick}
                onUnassign={(guestId) => {
                  void unassignGuest(guestId);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
