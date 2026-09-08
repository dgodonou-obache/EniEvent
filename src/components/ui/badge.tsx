import * as React from "react";

import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        {
          "border-transparent bg-primary text-primary-foreground": variant === "default",
          "border-transparent bg-slate-100 text-slate-900": variant === "secondary",
          "border-transparent bg-destructive text-destructive-foreground":
            variant === "destructive",
          "border-transparent bg-teal-100 text-teal-800": variant === "success",
          "border-transparent bg-amber-100 text-amber-800": variant === "warning",
          "border-slate-200 text-slate-600": variant === "outline",
        },
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
