import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServerErrorProps {
  message?: string | null;
  className?: string;
}

export function ServerError({ message, className }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", className)}>
      <CircleAlert className="size-4 shrink-0" />
      {message}
    </p>
  );
}
