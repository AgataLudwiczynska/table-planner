import type { FormFieldTheme } from "@/components/ui/FormField";

// Light wedding palette for the auth screens (bg-wedding background).
export const authFieldTheme: FormFieldTheme = {
  labelClassName: "text-slate-700",
  iconClassName: "text-slate-400",
  inputClassName: "border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:ring-rose-400",
  inputErrorClassName: "border-red-400 focus:ring-red-400",
  errorClassName: "text-red-600",
};

export const authServerErrorClass = "border-red-300 bg-red-50 text-red-700";
