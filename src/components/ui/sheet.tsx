import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-overlay/60 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "top",
  ...props
}: DialogPrimitive.Popup.Props & {
  side?: "top" | "bottom"
}) {
  const sideStyles =
    side === "top"
      ? "top-0 left-1/2 -translate-x-1/2 w-full max-w-[calc(var(--content-width)+32px)] rounded-b-2xl data-open:animate-in data-open:slide-in-from-top data-closed:animate-out data-closed:slide-out-to-top"
      : "bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[540px] rounded-t-2xl data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom"

  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex max-h-[85vh] flex-col bg-card p-0 text-sm text-card-foreground shadow-lg outline-none duration-200",
          sideStyles,
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function SheetHeader({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 items-center justify-between px-4 pt-3",
        className
      )}
      {...props}
    >
      <SheetTitle className="text-[var(--type-page-title)] font-[var(--type-page-title-weight)] leading-[var(--type-page-title-lh)]">
        {children}
      </SheetTitle>
      {showCloseButton && (
        <DialogPrimitive.Close
          data-slot="sheet-close"
          render={
            <button className="flex size-8 items-center justify-center rounded-[6px] bg-muted" />
          }
        >
          <XIcon size={16} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
}