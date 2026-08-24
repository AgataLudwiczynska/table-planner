import { useEffect, useRef, useState, type CSSProperties } from "react";
import { TriangleAlert, X } from "lucide-react";
import { useGuestDraggable, useSeatDropTarget } from "@/components/hooks/useSeatDnd";
import { cn } from "@/lib/utils";
import type { Assignment, Guest, Table } from "@/types";

// Ring layout budget: seats sit on a circle inside a square box. Radius is a percentage of the
// box so the whole ring scales with the box's width — no fixed pixels to overflow small screens.
export const RING_RADIUS = 120;
const RING_BOX_MAX = 2 * RING_RADIUS + 180;
const RADIUS_PCT = 40;

interface GuestChipProps {
  guest: Guest;
  // Origin seat when the chip sits in a seat; null when it lives in the panel.
  seatId: string | null;
  selected: boolean;
  // On the ring, chips are tight — show first name only (full name in the title).
  compact?: boolean;
  onSelect: (guestId: string) => void;
}

export function GuestChip({ guest, seatId, selected, compact = false, onSelect }: GuestChipProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useGuestDraggable(ref, guest.id, seatId);
  const fullName = `${guest.firstName} ${guest.lastName}`;
  return (
    <button
      ref={ref}
      type="button"
      title={compact ? fullName : undefined}
      onClick={() => {
        onSelect(guest.id);
      }}
      className={cn(
        "cursor-grab rounded-full border px-3 py-1 text-sm transition-colors active:cursor-grabbing",
        compact && "max-w-[5rem] truncate px-2 py-0.5 text-xs",
        selected
          ? "border-rose-500 bg-rose-500 text-white"
          : "border-slate-300 bg-white text-slate-800 hover:border-rose-300",
      )}
    >
      {compact ? guest.firstName : fullName}
    </button>
  );
}

interface RingSeatProps {
  seatId: string;
  seatNumber: number;
  occupant: Guest | null;
  violating: boolean;
  selectedGuestId: string | null;
  style: CSSProperties;
  onSelectGuest: (guestId: string) => void;
  onSeatClick: (seatId: string) => void;
  onUnassign: (guestId: string) => void;
}

function RingSeat({
  seatId,
  seatNumber,
  occupant,
  violating,
  selectedGuestId,
  style,
  onSelectGuest,
  onSeatClick,
  onUnassign,
}: RingSeatProps) {
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
      style={style}
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
    >
      {occupant ? (
        <>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
              violating ? "bg-red-100 text-red-600" : "bg-slate-200 text-slate-600",
            )}
          >
            {seatNumber}
          </span>
          <div
            className={cn(
              "flex items-center gap-0.5 rounded-full border px-1 py-0.5",
              violating ? "border-red-400 bg-red-50" : "border-slate-200 bg-white",
            )}
          >
            {violating && <TriangleAlert className="size-3.5 shrink-0 text-red-600" aria-label="Konflikt sąsiedztwa" />}
            <GuestChip
              guest={occupant}
              seatId={seatId}
              compact
              selected={selectedGuestId === occupant.id}
              onSelect={onSelectGuest}
            />
            <button
              type="button"
              onClick={() => {
                onUnassign(occupant.id);
              }}
              aria-label={`Zwolnij miejsce ${String(seatNumber)}`}
              className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-300 text-slate-500 transition-colors hover:border-red-300 hover:text-red-600"
            >
              <X className="size-3" />
            </button>
          </div>
        </>
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
          className={cn(
            "flex size-11 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
            isOver
              ? "border-rose-400 bg-rose-50 text-rose-600"
              : "border-dashed border-slate-300 text-slate-400 hover:border-rose-300 hover:text-rose-500",
          )}
        >
          {seatNumber}
        </button>
      )}
    </div>
  );
}

interface TableRingProps {
  table: Table;
  assignmentBySeatId: Map<string, Assignment>;
  guestById: Map<string, Guest>;
  violatingSeatIds: Set<string>;
  selectedGuestId: string | null;
  onSelectGuest: (guestId: string) => void;
  onSeatClick: (seatId: string) => void;
  onUnassign: (guestId: string) => void;
}

export function TableRing({
  table,
  assignmentBySeatId,
  guestById,
  violatingSeatIds,
  selectedGuestId,
  onSelectGuest,
  onSeatClick,
  onUnassign,
}: TableRingProps) {
  const seats = table.seats;
  const n = seats.length;
  return (
    <section className="rounded-xl border border-slate-200 bg-white/60 p-4">
      <h3 className="mb-3 font-semibold text-slate-800">{table.name}</h3>
      <div className="relative mx-auto aspect-square w-full" style={{ maxWidth: RING_BOX_MAX }}>
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-slate-50/70"
        />
        {seats.map((seat, i) => {
          // Seat 1 at the top (−π/2), remaining seats spread clockwise around the ring.
          const angle = (2 * Math.PI * i) / n - Math.PI / 2;
          const left = 50 + RADIUS_PCT * Math.cos(angle);
          const top = 50 + RADIUS_PCT * Math.sin(angle);
          const assignment = assignmentBySeatId.get(seat.id);
          const occupant = assignment ? (guestById.get(assignment.guestId) ?? null) : null;
          return (
            <RingSeat
              key={seat.id}
              seatId={seat.id}
              seatNumber={seat.seatNumber}
              occupant={occupant}
              violating={violatingSeatIds.has(seat.id)}
              selectedGuestId={selectedGuestId}
              style={{ left: `${String(left)}%`, top: `${String(top)}%` }}
              onSelectGuest={onSelectGuest}
              onSeatClick={onSeatClick}
              onUnassign={onUnassign}
            />
          );
        })}
      </div>
    </section>
  );
}
