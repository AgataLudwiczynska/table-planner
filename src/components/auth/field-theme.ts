import type { FormFieldTheme } from "@/components/ui/FormField";

// Dark glassmorphism palette for the auth screens (bg-cosmic background).
export const authFieldTheme: FormFieldTheme = {
  labelClassName: "text-blue-100/80",
  iconClassName: "text-white/40",
  inputClassName: "border-white/20 bg-white/10 text-white placeholder-white/40 focus:ring-purple-400",
  inputErrorClassName: "border-red-400/60 focus:ring-red-400",
  errorClassName: "text-red-300",
};

export const authServerErrorClass = "border-red-500/30 bg-red-900/30 text-red-300";
