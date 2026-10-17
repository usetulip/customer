"use client"

import { cn } from "@/lib/utils"
import type { PortalStep } from "@/components/client-portal/portal-shell"
import { Lock } from "lucide-react"

const STEPS: { value: PortalStep; label: string }[] = [
  { value: "intake", label: "1. Intake Brief" },
  { value: "processing", label: "2. Processing" },
  { value: "delivered", label: "3. Delivered" },
]

type PortalStepNavProps = {
  activeStep: PortalStep
  maxStep: PortalStep
}

export function PortalStepNav({ activeStep, maxStep }: PortalStepNavProps) {
  const activeIndex = STEPS.findIndex((step) => step.value === activeStep)
  const maxIndex = STEPS.findIndex((step) => step.value === maxStep)

  return (
    <div
      className="relative h-11 w-full rounded-full bg-[#ebebeb] p-1"
      role="tablist"
      aria-label="Portal progress"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-1 bottom-1 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          width: "calc((100% - 8px) / 3)",
          left: `calc(4px + ${activeIndex} * ((100% - 8px) / 3))`,
        }}
      />
      <div className="relative grid h-full grid-cols-3">
        {STEPS.map((step, index) => {
          const isActive = step.value === activeStep
          const isLocked = index > maxIndex
          const isCompleted = index < maxIndex

          return (
            <div
              key={step.value}
              role="tab"
              aria-selected={isActive}
              aria-disabled={isLocked}
              className={cn(
                "z-10 flex items-center justify-center gap-1 rounded-full px-2 text-sm select-none",
                isActive
                  ? "font-semibold text-foreground"
                  : "font-medium text-[#6b7280]",
                isLocked && "opacity-40",
                isCompleted && !isActive && "opacity-70"
              )}
            >
              {isLocked ? (
                <Lock className="size-3 shrink-0" aria-hidden />
              ) : null}
              <span className="truncate">{step.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
