import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Dire quoi faire ensuite, pas seulement qu'il n'y a rien. */
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50">
        <Icon className="h-6 w-6 text-orange-500" aria-hidden />
      </div>
      <h2 className="mt-4 text-base font-bold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
