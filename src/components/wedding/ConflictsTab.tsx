import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ServerError } from "@/components/ui/ServerError";
import { useApiMutation } from "@/components/hooks/useApiMutation";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Conflict, Guest } from "@/types";

interface Props {
  serverErrorClass: string;
  guests: Guest[];
  conflicts: Conflict[];
  onCreated: (conflict: Conflict) => void;
  onDeleted: (id: string) => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400";

function fullName(guest: Guest): string {
  return `${guest.firstName} ${guest.lastName}`;
}

/** Resolve a typed/selected display name back to its unique guest (names are unique per wedding). */
function resolveGuest(guests: Guest[], value: string): Guest | undefined {
  const trimmed = value.trim();
  return guests.find((g) => fullName(g) === trimmed);
}

export function ConflictsTab({ serverErrorClass, guests, conflicts, onCreated, onDeleted }: Props) {
  const listId = useId();
  const [aValue, setAValue] = useState("");
  const [bValue, setBValue] = useState("");

  const create = useApiMutation<Conflict>("Nie udało się dodać konfliktu.");
  const remove = useApiMutation<{ id: string }>("Nie udało się usunąć konfliktu.");

  const guestA = resolveGuest(guests, aValue);
  const guestB = resolveGuest(guests, bValue);

  const samePair = Boolean(guestA && guestA.id === guestB?.id);
  const duplicate = Boolean(
    guestA &&
    guestB &&
    conflicts.some(
      (c) =>
        (c.guestAId === guestA.id && c.guestBId === guestB.id) ||
        (c.guestAId === guestB.id && c.guestBId === guestA.id),
    ),
  );
  // Derived so the reason surfaces the moment both pickers resolve, not only on submit.
  const pairError =
    guestA && guestB
      ? samePair
        ? "Nie można dodać konfliktu gościa z samym sobą."
        : duplicate
          ? "Ten konflikt jest już zdefiniowany."
          : null
      : null;
  const canSubmit = Boolean(guestA) && Boolean(guestB) && !samePair && !duplicate && !create.pending;

  async function submit() {
    if (!guestA || !guestB || samePair || duplicate) return;
    const data = await create.run({
      url: ROUTES.apiConflicts,
      method: "POST",
      body: { guestAId: guestA.id, guestBId: guestB.id },
    });
    if (!data) return;
    onCreated(data);
    setAValue("");
    setBValue("");
  }

  async function deleteConflict(conflict: Conflict) {
    if (remove.pending) return;
    const data = await remove.run({ url: ROUTES.apiConflicts, method: "DELETE", body: { id: conflict.id } });
    if (!data) return;
    onDeleted(conflict.id);
  }

  const guestById = new Map(guests.map((g) => [g.id, g]));
  function nameById(id: string): string {
    const guest = guestById.get(id);
    return guest ? fullName(guest) : "Nieznany gość";
  }

  return (
    <div>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Dodaj konflikt</h2>
        {guests.length < 2 ? (
          <p className="rounded-xl border border-rose-100 bg-white/70 p-4 text-sm text-slate-500">
            Dodaj co najmniej dwoje gości, aby zdefiniować konflikt.
          </p>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-4 rounded-xl border border-rose-100 bg-white/70 p-4"
          >
            <datalist id={listId}>
              {guests.map((guest) => (
                <option key={guest.id} value={fullName(guest)} />
              ))}
            </datalist>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="conflictGuestA" className="mb-1 block text-sm text-slate-600">
                  Gość A
                </label>
                <input
                  id="conflictGuestA"
                  list={listId}
                  value={aValue}
                  onChange={(e) => {
                    setAValue(e.target.value);
                    if (create.error) create.setError(null);
                  }}
                  placeholder="Zacznij pisać imię..."
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="conflictGuestB" className="mb-1 block text-sm text-slate-600">
                  Gość B
                </label>
                <input
                  id="conflictGuestB"
                  list={listId}
                  value={bValue}
                  onChange={(e) => {
                    setBValue(e.target.value);
                    if (create.error) create.setError(null);
                  }}
                  placeholder="Zacznij pisać imię..."
                  className={inputClass}
                />
              </div>
            </div>
            {pairError ? <p className="text-xs text-red-600">{pairError}</p> : null}
            <ServerError message={create.error} className={serverErrorClass} />
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
            >
              <Plus className="size-4" />
              {create.pending ? "Dodawanie..." : "Dodaj konflikt"}
            </button>
          </form>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Konflikty</h2>
        <ServerError message={remove.error} className={cn(serverErrorClass, "mb-3")} />
        {conflicts.length === 0 ? (
          <p className="text-sm text-slate-500">Nie zdefiniowano jeszcze żadnych konfliktów.</p>
        ) : (
          <ul className="space-y-2">
            {conflicts.map((conflict) => (
              <li
                key={conflict.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
              >
                <span className="min-w-0 truncate font-medium text-slate-800">
                  {nameById(conflict.guestAId)} <span className="text-slate-400">↔</span> {nameById(conflict.guestBId)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void deleteConflict(conflict);
                  }}
                  aria-label="Usuń konflikt"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="size-3.5" />
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
