import { useEffect, useRef, useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { ServerError } from "@/components/ui/ServerError";
import { useApiMutation } from "@/components/hooks/useApiMutation";
import {
  useGuestDraggable,
  usePanelDropTarget,
  useSeatDropTarget,
  useSeatMonitor,
  type DropCommit,
} from "@/components/hooks/useSeatDnd";
import { validateAllTables } from "@/lib/adjacency";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Assignment, Conflict, Guest, Table } from "@/types";

// Layout budget fixed here so Phase 5's TableRing has a known envelope (radius) to place seats in.
export const PANEL_WIDTH_CLASS = "lg:w-72";
export const RING_RADIUS = 120;

const serverErrorClass = "border-red-300 bg-red-50 text-red-700";

interface Props {
  tables: Table[];
  guests: Guest[];
  assignments: Assignment[];
  conflicts: Conflict[];
  onAssigned: (assignment: Assignment) => void;
  onUnassigned: (guestId: string) => void;
}

interface GuestChipProps {
  guest: Guest;
  // Origin seat when the chip sits in a seat; null when it lives in the panel.
  seatId: string | null;
  selected: boolean;
  onSelect: (guestId: string) => void;
}

function GuestChip({ guest, seatId, selected, onSelect }: GuestChipProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useGuestDraggable(ref, guest.id, seatId);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        onSelect(guest.id);
      }}
      className={cn(
        "cursor-grab rounded-full border px-3 py-1 text-sm transition-colors active:cursor-grabbing",
        selected
          ? "border-rose-500 bg-rose-500 text-white"
          : "border-slate-300 bg-white text-slate-800 hover:border-rose-300",
      )}
    >
      {guest.firstName} {guest.lastName}
    </button>
  );
}

interface TableSeatProps {
  seatId: string;
  seatNumber: number;
  occupant: Guest | null;
  violating: boolean;
  selectedGuestId: string | null;
  onSelectGuest: (guestId: string) => void;
  onSeatClick: (seatId: string) => void;
  onUnassign: (guestId: string) => void;
}

function TableSeat({
  seatId,
  seatNumber,
  occupant,
  violating,
  selectedGuestId,
  onSelectGuest,
  onSeatClick,
  onUnassign,
}: TableSeatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);
  const isOccupied = occupant !== null;
  // canDrop reads live occupancy through a ref so the drop target binds once, not per assignment change.
  const occupiedRef = useRef(isOccupied);
  useEffect(() => {
    occupiedRef.current = isOccupied;
  }, [isOccupied]);
  useSeatDropTarget(ref, seatId, occupiedRef, setIsOver);

  return (
    <div
      ref={ref}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-lg border px-2 py-1",
        violating ? "border-red-400 bg-red-50" : isOver ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white",
      )}
    >
      <span
        className={cn("w-5 shrink-0 text-center text-xs font-semibold", violating ? "text-red-600" : "text-slate-400")}
      >
        {seatNumber}
      </span>
      {occupant ? (
        <div className="flex min-w-0 items-center gap-1">
          {violating && <TriangleAlert className="size-4 shrink-0 text-red-600" aria-label="Konflikt sąsiedztwa" />}
          <GuestChip
            guest={occupant}
            seatId={seatId}
            selected={selectedGuestId === occupant.id}
            onSelect={onSelectGuest}
          />
          <button
            type="button"
            onClick={() => {
              onUnassign(occupant.id);
            }}
            aria-label={`Zwolnij miejsce ${String(seatNumber)}`}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition-colors hover:border-red-300 hover:text-red-600"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            onSeatClick(seatId);
          }}
          aria-label={
            selectedGuestId
              ? `Przypisz wybranego gościa do miejsca ${String(seatNumber)}`
              : `Puste miejsce ${String(seatNumber)}`
          }
          className="flex-1 rounded-md py-1 text-left text-sm text-slate-400 transition-colors hover:text-rose-500"
        >
          Puste
        </button>
      )}
    </div>
  );
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
          <div className="grid gap-6 sm:grid-cols-2">
            {tables.map((table) => (
              <section key={table.id} className="rounded-xl border border-slate-200 bg-white/60 p-4">
                <h3 className="mb-3 font-semibold text-slate-800">{table.name}</h3>
                <ul className="space-y-2">
                  {table.seats.map((seat) => {
                    const assignment = assignmentBySeatId.get(seat.id);
                    const occupant = assignment ? (guestById.get(assignment.guestId) ?? null) : null;
                    return (
                      <li key={seat.id}>
                        <TableSeat
                          seatId={seat.id}
                          seatNumber={seat.seatNumber}
                          occupant={occupant}
                          violating={violatingSeatIds.has(seat.id)}
                          selectedGuestId={selectedGuestId}
                          onSelectGuest={selectGuest}
                          onSeatClick={handleSeatClick}
                          onUnassign={(guestId) => {
                            void unassignGuest(guestId);
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
