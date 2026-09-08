import * as React from "react";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  indicatorColor?: string;
  label?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, indicatorColor = "bg-primary", label, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className={cn("relative h-2 w-full overflow-hidden rounded-full bg-slate-200", className)}
        {...props}
      >
        <div
          className={cn("h-full w-full flex-1 transition-all duration-300", indicatorColor)}
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </div>
    );
  },
);
Progress.displayName = "Progress";

export { Progress };
