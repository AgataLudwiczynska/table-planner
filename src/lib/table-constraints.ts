// Single source of truth for table name/seat limits, shared by the form validation
// (TablesTab) and the API zod schema (api/tables.ts). The DB RPC enforces the same 1–30 range.
export const TABLE_NAME_MAX_LENGTH = 50;
export const SEATS_MIN = 1;
export const SEATS_MAX = 30;
