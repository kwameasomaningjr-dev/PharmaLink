"use client";

import React, { FC, ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils";

export interface LiquidGlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  glow?: boolean;
}

const LiquidGlassButton = forwardRef<HTMLButtonElement, LiquidGlassButtonProps>(
  ({ className, variant = "primary", size = "md", glow = true, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "btn-liquid-glass",
          `btn-liquid-${variant}`,
          size === "sm" && "btn-sm",
          size === "lg" && "btn-lg",
          glow && "has-liquid-glow",
          className
        )}
        {...props}
      >
        <span className="liquid-glass-shine" aria-hidden="true" />
        <span className="liquid-glass-content">{children}</span>
      </button>
    );
  }
);

LiquidGlassButton.displayName = "LiquidGlassButton";

export { LiquidGlassButton };
