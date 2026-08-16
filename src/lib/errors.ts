// Single source of truth: each domain error code → HTTP status + Polish user message.
export const API_ERRORS = {
  internal_error: { status: 500, message: "Wystąpił błąd serwera." },
  wedding_not_found: { status: 404, message: "Nie znaleziono wesela." },
  forbidden: { status: 403, message: "Brak uprawnień do tego wesela." },
  invalid_seat_count: { status: 400, message: "Nieprawidłowa liczba miejsc." },
  unauthorized: { status: 401, message: "Musisz być zalogowany." },
  supabase_unconfigured: { status: 503, message: "Usługa jest chwilowo niedostępna." },
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;
