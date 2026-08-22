import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { FormField, type FormFieldTheme } from "@/components/ui/FormField";
import { ServerError } from "@/components/ui/ServerError";
import { useApiMutation } from "@/components/hooks/useApiMutation";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Guest, GuestGroup, GuestSide } from "@/types";

const SIDE_LABELS: Record<GuestSide, string> = {
  panna_mloda: "Panna młoda",
  pan_mlody: "Pan młody",
  wspolne: "Wspólne",
  nieokreslone: "Nieokreślone",
};

const GROUP_LABELS: Record<GuestGroup, string> = {
  rodzina: "Rodzina",
  przyjaciele: "Przyjaciele",
  wspolpracownicy: "Współpracownicy",
};

const SIDE_VALUES = Object.keys(SIDE_LABELS) as GuestSide[];
const GROUP_VALUES = Object.keys(GROUP_LABELS) as GuestGroup[];

interface Props {
  fieldTheme: FormFieldTheme;
  serverErrorClass: string;
  guests: Guest[];
  onCreated: (guest: Guest) => void;
  onUpdated: (guest: Guest) => void;
  onDeleted: (id: string) => void;
}

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400";

function guestMeta(guest: Guest): string {
  const parts = [guest.side ? SIDE_LABELS[guest.side] : null, guest.group ? GROUP_LABELS[guest.group] : null].filter(
    (p): p is string => p !== null,
  );
  return parts.join(" · ");
}

export function GuestsTab({ fieldTheme, serverErrorClass, guests, onCreated, onUpdated, onDeleted }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [side, setSide] = useState<GuestSide | "">("");
  const [group, setGroup] = useState<GuestGroup | "">("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string }>({});

  const save = useApiMutation<Guest>("Nie udało się zapisać gościa.");
  const remove = useApiMutation<{ id: string }>("Nie udało się usunąć gościa.");

  function resetForm() {
    setFirstName("");
    setLastName("");
    setSide("");
    setGroup("");
    setEditingId(null);
    setFieldErrors({});
    save.setError(null);
  }

  function startEdit(guest: Guest) {
    setEditingId(guest.id);
    setFirstName(guest.firstName);
    setLastName(guest.lastName);
    setSide(guest.side ?? "");
    setGroup(guest.group ?? "");
    setFieldErrors({});
    save.setError(null);
  }

  async function submit() {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const errors: { firstName?: string; lastName?: string } = {};
    if (!trimmedFirst) errors.firstName = "Podaj imię.";
    if (!trimmedLast) errors.lastName = "Podaj nazwisko.";
    setFieldErrors(errors);
    save.setError(null);
    if (Object.keys(errors).length > 0) return;

    const body = {
      firstName: trimmedFirst,
      lastName: trimmedLast,
      side: side === "" ? null : side,
      group: group === "" ? null : group,
    };
    const isEdit = editingId !== null;
    const data = await save.run({
      url: ROUTES.apiGuests,
      method: isEdit ? "PATCH" : "POST",
      body: isEdit ? { ...body, id: editingId } : body,
    });
    if (!data) return;
    if (isEdit) {
      onUpdated(data);
    } else {
      onCreated(data);
    }
    resetForm();
  }

  async function deleteGuest(guest: Guest) {
    if (remove.pending) return;
    const confirmed = window.confirm(
      `Usunąć gościa „${guest.firstName} ${guest.lastName}”? Powiązane konflikty również zostaną usunięte.`,
    );
    if (!confirmed) return;
    const data = await remove.run({ url: ROUTES.apiGuests, method: "DELETE", body: { id: guest.id } });
    if (!data) return;
    if (editingId === guest.id) resetForm();
    onDeleted(guest.id);
  }

  return (
    <div>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">{editingId ? "Edytuj gościa" : "Dodaj gościa"}</h2>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4 rounded-xl border border-rose-100 bg-white/70 p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              {...fieldTheme}
              id="guestFirstName"
              label="Imię"
              value={firstName}
              onChange={(v) => {
                setFirstName(v);
                if (fieldErrors.firstName) setFieldErrors((prev) => ({ ...prev, firstName: undefined }));
              }}
              placeholder="np. Anna"
              error={fieldErrors.firstName}
            />
            <FormField
              {...fieldTheme}
              id="guestLastName"
              label="Nazwisko"
              value={lastName}
              onChange={(v) => {
                setLastName(v);
                if (fieldErrors.lastName) setFieldErrors((prev) => ({ ...prev, lastName: undefined }));
              }}
              placeholder="np. Kowalska"
              error={fieldErrors.lastName}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="guestSide" className="mb-1 block text-sm text-slate-600">
                Strona
              </label>
              <select
                id="guestSide"
                value={side}
                onChange={(e) => {
                  setSide(e.target.value as GuestSide | "");
                }}
                className={selectClass}
              >
                <option value="">—</option>
                {SIDE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {SIDE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="guestGroup" className="mb-1 block text-sm text-slate-600">
                Grupa
              </label>
              <select
                id="guestGroup"
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value as GuestGroup | "");
                }}
                className={selectClass}
              >
                <option value="">—</option>
                {GROUP_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {GROUP_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ServerError message={save.error} className={serverErrorClass} />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={save.pending}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
            >
              {editingId ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {save.pending ? "Zapisywanie..." : editingId ? "Zapisz zmiany" : "Dodaj gościa"}
            </button>
            {editingId ? (
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
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Goście</h2>
        <ServerError message={remove.error} className={cn(serverErrorClass, "mb-3")} />
        {guests.length === 0 ? (
          <p className="text-sm text-slate-500">Nie dodano jeszcze żadnych gości.</p>
        ) : (
          <ul className="space-y-2">
            {guests.map((guest) => {
              const meta = guestMeta(guest);
              return (
                <li
                  key={guest.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      {guest.firstName} {guest.lastName}
                    </p>
                    {meta ? <p className="truncate text-sm text-slate-500">{meta}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        startEdit(guest);
                      }}
                      aria-label={`Edytuj gościa ${guest.firstName} ${guest.lastName}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Pencil className="size-3.5" />
                      Edytuj
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteGuest(guest);
                      }}
                      aria-label={`Usuń gościa ${guest.firstName} ${guest.lastName}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="size-3.5" />
                      Usuń
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
