import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * The role-named type scale from globals.css. tailwind-merge only knows
 * Tailwind's own `text-xs…text-9xl`, so without this it reads `text-micro`
 * as a colour and drops it next to `text-amber-900`. Registering the sizes
 * here lets `cn("text-micro", "text-amber-900")` keep both.
 */
export const TEXT_SIZES = [
  "micro",
  "caption",
  "label",
  "body",
  "body-lg",
  "title-sm",
  "title",
  "title-lg",
  "display-sm",
  "display",
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TEXT_SIZES] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
