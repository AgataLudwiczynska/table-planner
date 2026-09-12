import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { FormField, type FormFieldTheme } from "@/components/ui/FormField";
import { ServerError } from "@/components/ui/ServerError";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useApiMutation } from "@/components/hooks/useApiMutation";
import { ROUTES } from "@/lib/routes";
import { SEATS_MAX, SEATS_MIN, TABLE_NAME_MAX_LENGTH } from "@/lib/table-constraints";
import { cn } from "@/lib/utils";
import type { Assignment, Table } from "@/types";

interface Props {
  fieldTheme: FormFieldTheme;
  serverErrorClass: string;
  tables: Table[];
  assignments: Assignment[];
  onTableCreated: (table: Table) => void;
  onTableUpdated: (table: Table, unassignedGuestIds: string[]) => void;
  onTableDeleted: (tableId: string, unassignedGuestIds: string[]) => void;
}

function seatLabel(count: number): string {
  return count === 1 ? "miejsce" : "miejsc";
}

// Polish accusative: "1 przypisanego gościa" vs "N przypisanych gości".
function freedGuestsPhrase(count: number): string {
  return count === 1 ? "1 przypisanego gościa" : `${String(count)} przypisanych gości`;
}

export function TablesTab({
  fieldTheme,
  serverErrorClass,
  tables,
  assignments,
  onTableCreated,
  onTableUpdated,
  onTableDeleted,
}: Props) {
  const [tableName, setTableName] = useState("");
  const [seatCount, setSeatCount] = useState("");
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; seatCount?: string }>({});
  const [pendingShrink, setPendingShrink] = useState<{ name: string; seatCount: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Table | null>(null);

  const createTable = useApiMutation<Table>("Nie udało się dodać stołu.");
  const updateTable = useApiMutation<{ table: Table; unassignedGuestIds: string[] }>("Nie udało się zapisać stołu.");
  const removeTable = useApiMutation<{ tableId: string; unassignedGuestIds: string[] }>("Nie udało się usunąć stołu.");

  const isEdit = editingTableId !== null;
  const formPending = isEdit ? updateTable.pending : createTable.pending;
  const formError = isEdit ? updateTable.error : createTable.error;

  function resetForm() {
    setTableName("");
    setSeatCount("");
    setEditingTableId(null);
    setFieldErrors({});
    setPendingShrink(null);
    createTable.setError(null);
    updateTable.setError(null);
  }

  function startEdit(table: Table) {
    setEditingTableId(table.id);
    setTableName(table.name);
    setSeatCount(String(table.seatCount));
    setFieldErrors({});
    createTable.setError(null);
    updateTable.setError(null);
  }

  function validate(trimmed: string, seats: number): { name?: string; seatCount?: string } {
    const errors: { name?: string; seatCount?: string } = {};
    if (!trimmed) {
      errors.name = "Podaj nazwę stołu.";
    } else if (trimmed.length > TABLE_NAME_MAX_LENGTH) {
      errors.name = `Nazwa może mieć maksymalnie ${String(TABLE_NAME_MAX_LENGTH)} znaków.`;
    }
    if (!seatCount.trim() || !Number.isInteger(seats)) {
      errors.seatCount = "Podaj liczbę miejsc.";
    } else if (seats < SEATS_MIN || seats > SEATS_MAX) {
      errors.seatCount = `Liczba miejsc musi być od ${String(SEATS_MIN)} do ${String(SEATS_MAX)}.`;
    }
    return errors;
  }

  async function sendUpdate(name: string, seats: number) {
    if (editingTableId === null) return;
    const data = await updateTable.run({
      url: ROUTES.apiTables,
      method: "PATCH",
      body: { tableId: editingTableId, name, seatCount: seats },
    });
    if (!data) return;
    onTableUpdated(data.table, data.unassignedGuestIds);
    resetForm();
  }

  async function submit() {
    const trimmed = tableName.trim();
    const seats = Number(seatCount);
    const errors = validate(trimmed, seats);
    setFieldErrors(errors);
    createTable.setError(null);
    updateTable.setError(null);
    if (Object.keys(errors).length > 0) return;

    if (editingTableId === null) {
      const data = await createTable.run({
        url: ROUTES.apiTables,
        method: "POST",
        body: { name: trimmed, seatCount: seats },
      });
      if (!data) return;
      onTableCreated(data);
      resetForm();
      return;
    }

    // Any shrink pops the warning dialog before sending; grow / rename-only go straight through.
    const editing = tables.find((t) => t.id === editingTableId);
    if (editing && seats < editing.seatCount) {
      setPendingShrink({ name: trimmed, seatCount: seats });
      return;
    }
    await sendUpdate(trimmed, seats);
  }

  async function confirmDelete(target: Table) {
    const data = await removeTable.run({
      url: ROUTES.apiTables,
      method: "DELETE",
      body: { tableId: target.id },
    });
    if (!data) return;
    if (editingTableId === target.id) resetForm();
    onTableDeleted(data.tableId, data.unassignedGuestIds);
  }

  function assignedCount(table: Table): number {
    const tableSeatIds = new Set(table.seats.map((s) => s.id));
    return assignments.filter((a) => tableSeatIds.has(a.seatId)).length;
  }

  return (
    <div>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">{isEdit ? "Edytuj stół" : "Dodaj stół"}</h2>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
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
            label={`Liczba miejsc (${String(SEATS_MIN)}–${String(SEATS_MAX)})`}
            value={seatCount}
            onChange={(v) => {
              setSeatCount(v);
              if (fieldErrors.seatCount) setFieldErrors((prev) => ({ ...prev, seatCount: undefined }));
            }}
            placeholder="np. 10"
            error={fieldErrors.seatCount}
          />
          <ServerError message={formError} className={serverErrorClass} />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={formPending}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
            >
              {isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {formPending ? "Zapisywanie..." : isEdit ? "Zapisz zmiany" : "Dodaj stół"}
            </button>
            {isEdit ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <X className="size-4" />
                Anuluj
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Stoły</h2>
        <ServerError message={removeTable.error} className={cn(serverErrorClass, "mb-3")} />
        {tables.length === 0 ? (
          <p className="text-sm text-slate-500">Nie dodano jeszcze żadnych stołów.</p>
        ) : (
          <ul className="space-y-2">
            {tables.map((table) => (
              <li
                key={table.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{table.name}</p>
                  <p className="text-sm text-slate-500">
                    {table.seatCount} {seatLabel(table.seatCount)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      startEdit(table);
                    }}
                    aria-label={`Edytuj stół ${table.name}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <Pencil className="size-3.5" />
                    Edytuj
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeTable.setError(null);
                      setDeleteTarget(table);
                    }}
                    aria-label={`Usuń stół ${table.name}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" />
                    Usuń
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={pendingShrink !== null}
        onOpenChange={(open) => {
          if (!open) setPendingShrink(null);
        }}
        title="Zmniejszyć liczbę miejsc?"
        description="Zmniejszenie stołu może spowodować, że przypisani do niego goście zostaną z niego usunięci."
        actionLabel="Zmień mimo to"
        onConfirm={() => {
          const p = pendingShrink;
          setPendingShrink(null);
          if (p) void sendUpdate(p.name, p.seatCount);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Usunąć stół?"
        description={
          deleteTarget && assignedCount(deleteTarget) > 0
            ? `Usunięcie stołu „${deleteTarget.name}” zwolni ${freedGuestsPhrase(assignedCount(deleteTarget))}.`
            : `Czy na pewno chcesz usunąć stół „${deleteTarget?.name ?? ""}”?`
        }
        actionLabel="Usuń stół"
        destructive
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void confirmDelete(target);
        }}
      />
    </div>
  );
}
