import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// Structural only — every palette class is injected by the consumer's theme.
const inputBase = "w-full rounded-lg border px-3 py-2 transition-colors focus:outline-none focus:ring-2";

/** Per-consumer palette so the field stays theme-agnostic (auth dark vs. workspace light). */
export interface FormFieldTheme {
  labelClassName?: string;
  iconClassName?: string;
  inputClassName?: string;
  inputErrorClassName?: string;
  errorClassName?: string;
}

interface FormFieldProps extends FormFieldTheme {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
  labelClassName,
  iconClassName,
  inputClassName,
  inputErrorClassName,
  errorClassName,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={cn("mb-1 block text-sm", labelClassName)}>
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span className={cn("absolute top-1/2 left-3 size-4 -translate-y-1/2", iconClassName)}>{icon}</span>
        ) : null}
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          className={cn(inputBase, icon ? "pl-10" : undefined, inputClassName, error ? inputErrorClassName : undefined)}
        />
        {endContent}
      </div>
      {error ? (
        <p className={cn("mt-1 flex items-center gap-1 text-xs", errorClassName)}>
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}
