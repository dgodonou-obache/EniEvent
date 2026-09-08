import * as React from "react";

import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:shadow-orange-500/30":
              variant === "default",
            "border border-slate-200 bg-transparent text-slate-700 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600":
              variant === "outline",
            "text-slate-600 hover:bg-orange-50 hover:text-orange-600": variant === "ghost",
            "bg-slate-100 text-slate-900 hover:bg-slate-200": variant === "secondary",
            "bg-destructive text-destructive-foreground hover:bg-destructive/90":
              variant === "destructive",
            "h-11 px-5 py-2": size === "default",
            "h-9 rounded-lg px-3 text-xs": size === "sm",
            "h-12 px-8 text-base": size === "lg",
            "h-11 w-11": size === "icon",
          },
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
