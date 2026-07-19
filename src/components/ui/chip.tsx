// Chip — extended Badge with dismiss button
// Source: @wealthx/shadcn (ported to care-buddy)
//
// Usage:
//   <Chip>Label</Chip>
//   <Chip onRemove={() => handleRemove(id)}>Label</Chip>
//   <Chip variant="outline" disabled onRemove={...}>Label</Chip>

import { X } from "lucide-react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { badgeVariants } from "./badge"
import { Button } from "./button"

export interface ChipProps
  extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  /** When provided, renders a dismiss (×) button inside the chip. */
  onRemove?: () => void
  disabled?: boolean
}

function Chip({
  className,
  variant = "secondary",
  onRemove,
  disabled,
  children,
  ...props
}: ChipProps) {
  return (
    <span
      aria-disabled={disabled}
      data-slot="chip"
      data-variant={variant}
      className={cn(
        badgeVariants({ variant }),
        onRemove && "pr-1",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Remove"
          data-slot="chip-remove"
          disabled={disabled}
          className="ml-0.5 size-4 shrink-0 rounded-full p-0.5 opacity-60 hover:opacity-100 disabled:pointer-events-none"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </span>
  )
}

export { Chip }
