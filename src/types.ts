import type { Database } from "@/db/database.types";

export type Wedding = Database["public"]["Tables"]["weddings"]["Row"];
export type Table = Database["public"]["Tables"]["tables"]["Row"];
export type Seat = Database["public"]["Tables"]["seats"]["Row"];

// Future slices: add domain DTOs here (CreateTableInput, WeddingWithTables composite, etc.)
