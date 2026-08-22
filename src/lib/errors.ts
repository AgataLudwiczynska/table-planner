// Single source of truth: each domain error code → HTTP status + Polish user message.
export const API_ERRORS = {
  internal_error: { status: 500, message: "Wystąpił błąd serwera." },
  wedding_not_found: { status: 404, message: "Nie znaleziono wesela." },
  forbidden: { status: 403, message: "Brak uprawnień do tego wesela." },
  invalid_seat_count: { status: 400, message: "Nieprawidłowa liczba miejsc." },
  validation_error: { status: 400, message: "Nieprawidłowe dane." },
  unauthorized: { status: 401, message: "Musisz być zalogowany." },
  supabase_unconfigured: { status: 503, message: "Usługa jest chwilowo niedostępna." },
  guest_not_found: { status: 404, message: "Nie znaleziono gościa." },
  guest_name_exists: {
    status: 409,
    message: "Gość o tym imieniu i nazwisku już istnieje w tym weselu. Dodaj rozróżnienie, np. „Kowalska (ciocia)”.",
  },
  conflict_exists: { status: 409, message: "Ten konflikt jest już zdefiniowany." },
  conflict_self: { status: 400, message: "Nie można dodać konfliktu gościa z samym sobą." },
  conflict_not_found: { status: 404, message: "Nie znaleziono konfliktu." },
  invalid_guest: { status: 400, message: "Nieprawidłowy gość." },
  seat_not_found: { status: 404, message: "Nie znaleziono miejsca." },
  seat_occupied: { status: 409, message: "To miejsce jest już zajęte." },
  assignment_not_found: { status: 404, message: "Nie znaleziono przypisania." },
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;
