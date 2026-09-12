import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  destructive?: boolean;
}

const buttonBase =
  "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";

// Purpose-built confirmation modal over Radix AlertDialog: title + description + Anuluj/action.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  onConfirm,
  cancelLabel = "Anuluj",
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-rose-100 bg-white p-6 shadow-lg duration-200 sm:max-w-md">
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <AlertDialog.Title className="text-lg font-semibold text-slate-800">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-slate-500">{description}</AlertDialog.Description>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel
              className={cn(
                buttonBase,
                "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-300",
              )}
            >
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={onConfirm}
              className={cn(
                buttonBase,
                "text-white",
                destructive
                  ? "bg-red-600 hover:bg-red-700 focus:ring-red-400"
                  : "bg-rose-500 hover:bg-rose-600 focus:ring-rose-400",
              )}
            >
              {actionLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
