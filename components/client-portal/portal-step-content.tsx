"use client"

import { cn } from "@/lib/utils"

type PortalStepContentProps = {
  stepKey: string
  children: React.ReactNode
}

export function PortalStepContent({ stepKey, children }: PortalStepContentProps) {
  return (
    <div
      key={stepKey}
      className={cn(
        "w-full motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
      )}
    >
      {children}
    </div>
  )
}
