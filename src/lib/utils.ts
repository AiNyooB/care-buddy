import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "type-hero-title", "type-page-title", "type-section-title",
            "type-body", "type-caption", "type-micro",
            "type-timer-number", "type-lock-timer",
            "type-badge", "type-card-number",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs))
}
