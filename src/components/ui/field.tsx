import { Field as FieldPrimitive } from "@base-ui/react/field"
import { cn } from "@/lib/utils"

interface FieldProps extends FieldPrimitive.Root.Props {
  orientation?: "vertical" | "horizontal"
}

function Field({ orientation = "vertical", className, ...props }: FieldProps) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn(
        "flex flex-col gap-1.5",
        orientation === "horizontal" && "flex-row items-start gap-3",
        className,
      )}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn("text-sm font-medium leading-none", className)}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Field, FieldContent, FieldLabel, FieldDescription }
