import { cn } from "@/lib/utils";

/** Réserve la place du contenu pendant son chargement, sans faire sauter la page. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-xl bg-slate-100", className)}
      {...props}
    />
  );
}
