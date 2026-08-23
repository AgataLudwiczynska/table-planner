import { useState } from "react";
import { Plus } from "lucide-react";
import { FormField, type FormFieldTheme } from "@/components/ui/FormField";
import { ServerError } from "@/components/ui/ServerError";
import { useApiMutation } from "@/components/hooks/useApiMutation";
import { GuestsTab } from "@/components/wedding/GuestsTab";
import { ConflictsTab } from "@/components/wedding/ConflictsTab";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Assignment, Conflict, Guest, Table, Wedding } from "@/types";

type TabKey = "tables" | "guests" | "conflicts";

const TABS: { key: TabKey; label: string }[] = [
  { key: "tables", label: "Stoły" },
  { key: "guests", label: "Goście" },
  { key: "conflicts", label: "Konflikty" },
];

const MAX_TABLE_NAME = 50;
const MIN_SEATS = 1;
const MAX_SEATS = 30;

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
  // Accepted here so wedding.astro can pass it; wired to state + board in Phase 3.
  initialAssignments?: Assignment[];
}

function seatLabel(count: number) {
  return count === 1 ? "miejsce" : "miejsc";
}

export default function WeddingWorkspace({
  initialWedding,
  initialTables,
  initialGuests = [],
  initialConflicts = [],
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("tables");
  const [wedding, setWedding] = useState(initialWedding);
  const [tables, setTables] = useState(initialTables);
  const [guests, setGuests] = useState(initialGuests);
  const [conflicts, setConflicts] = useState(initialConflicts);

  const [nameDraft, setNameDraft] = useState(initialWedding.name);
  const [tableName, setTableName] = useState("");
  const [seatCount, setSeatCount] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; seatCount?: string }>({});

  const rename = useApiMutation<Wedding>("Nie udało się zapisać nazwy.");
  const createTable = useApiMutation<Table>("Nie udało się dodać stołu.");

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

  async function addTable() {
    const trimmed = tableName.trim();
    const seats = Number(seatCount);
    const errors: { name?: string; seatCount?: string } = {};
    if (!trimmed) {
      errors.name = "Podaj nazwę stołu.";
    } else if (trimmed.length > MAX_TABLE_NAME) {
      errors.name = `Nazwa może mieć maksymalnie ${String(MAX_TABLE_NAME)} znaków.`;
    }
    if (!seatCount.trim() || !Number.isInteger(seats)) {
      errors.seatCount = "Podaj liczbę miejsc.";
    } else if (seats < MIN_SEATS || seats > MAX_SEATS) {
      errors.seatCount = `Liczba miejsc musi być od ${String(MIN_SEATS)} do ${String(MAX_SEATS)}.`;
    }
    setFieldErrors(errors);
    createTable.setError(null);
    if (Object.keys(errors).length > 0) return;

    const data = await createTable.run({
      url: ROUTES.apiTables,
      method: "POST",
      body: { name: trimmed, seatCount: seats },
    });
    if (!data) return;
    setTables((prev) => [...prev, data]);
    setTableName("");
    setSeatCount("");
  }

  function onGuestCreated(guest: Guest) {
    setGuests((prev) => [...prev, guest]);
  }
  function onGuestUpdated(guest: Guest) {
    setGuests((prev) => prev.map((g) => (g.id === guest.id ? guest : g)));
  }
  // Deleting a guest also drops any conflict referencing them (DB cascades; mirror it in state).
  function onGuestDeleted(id: string) {
    setGuests((prev) => prev.filter((g) => g.id !== id));
    setConflicts((prev) => prev.filter((c) => c.guestAId !== id && c.guestBId !== id));
  }
  function onConflictCreated(conflict: Conflict) {
    setConflicts((prev) => [...prev, conflict]);
  }
  function onConflictDeleted(id: string) {
    setConflicts((prev) => prev.filter((c) => c.id !== id));
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
        <div className="mt-6">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-700">Dodaj stół</h2>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void addTable();
              }}
              className="space-y-4 rounded-xl border border-rose-100 bg-white/70 p-4"
            >
              <FormField
                {...fieldTheme}
                id="tableName"
                label="Nazwa stołu"
                value={tableName}
                onChange={(v) => {
                  setTableName(v);
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="np. Stół 1"
                error={fieldErrors.name}
              />
              <FormField
                {...fieldTheme}
                id="seatCount"
                type="number"
                label={`Liczba miejsc (${String(MIN_SEATS)}–${String(MAX_SEATS)})`}
                value={seatCount}
                onChange={(v) => {
                  setSeatCount(v);
                  if (fieldErrors.seatCount) setFieldErrors((prev) => ({ ...prev, seatCount: undefined }));
                }}
                placeholder="np. 10"
                error={fieldErrors.seatCount}
              />
              <ServerError message={createTable.error} className={serverErrorClass} />
              <button
                type="submit"
                disabled={createTable.pending}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
              >
                <Plus className="size-4" />
                {createTable.pending ? "Dodawanie..." : "Dodaj stół"}
              </button>
            </form>
          </section>

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-slate-700">Stoły</h2>
            {tables.length === 0 ? (
              <p className="text-sm text-slate-500">Nie dodano jeszcze żadnych stołów.</p>
            ) : (
              <ul className="space-y-2">
                {tables.map((table) => (
                  <li
                    key={table.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
                  >
                    <span className="font-medium text-slate-800">{table.name}</span>
                    <span className="text-sm text-slate-500">
                      {table.seatCount} {seatLabel(table.seatCount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {activeTab === "guests" && (
        <div className="mt-6">
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
        <div className="mt-6">
          <ConflictsTab
            serverErrorClass={serverErrorClass}
            guests={guests}
            conflicts={conflicts}
            onCreated={onConflictCreated}
            onDeleted={onConflictDeleted}
          />
        </div>
      )}
    </div>
  );
}
