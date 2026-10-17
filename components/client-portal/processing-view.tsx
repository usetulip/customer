"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { Project } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Check, Clock, Zap } from "lucide-react"

const FALLBACK_SECONDS = 48 * 60 * 60

function formatCountdown(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":")
}

function StepIcon({ status }: { status: "completed" | "active" | "pending" }) {
  if (status === "completed") {
    return (
      <span className="flex size-9 items-center justify-center rounded-full bg-[var(--portal-success)] text-white">
        <Check className="size-4" strokeWidth={2.5} />
      </span>
    )
  }

  if (status === "active") {
    return (
      <span className="flex size-9 items-center justify-center rounded-full bg-[var(--portal-accent)] text-white">
        <Zap className="size-4" fill="currentColor" />
      </span>
    )
  }

  return (
    <span className="flex size-9 items-center justify-center rounded-full border border-[#e5e7eb] bg-[#f9fafb] text-[#9ca3af]">
      <Clock className="size-4" />
    </span>
  )
}

type ProcessingViewProps = {
  project: Project | null
  isActive?: boolean
}

export function ProcessingView({ project, isActive = false }: ProcessingViewProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(
    project?.secondsRemaining ?? FALLBACK_SECONDS
  )
  const [hasMounted, setHasMounted] = useState(false)

  const pipelineSteps = project?.pipelineSteps ?? []
  const isAwaitingApproval = !project?.approvedAt

  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    setSecondsRemaining(project?.secondsRemaining ?? FALLBACK_SECONDS)
  }, [project?.secondsRemaining])

  useEffect(() => {
    if (!hasMounted || !isActive) {
      return
    }

    const interval = window.setInterval(() => {
      setSecondsRemaining((current) => (current > 0 ? current - 1 : 0))
    }, 1000)

    return () => window.clearInterval(interval)
  }, [hasMounted, isActive])

  return (
    <div className="flex flex-col gap-5">
      <Card className="rounded-2xl border-0 py-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-0">
        <CardContent className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <p className="text-sm font-normal text-[#6b7280]">
            Estimated time remaining (48-hour sprint)
          </p>
          <p
            suppressHydrationWarning
            className="text-[3.25rem] font-bold leading-none tracking-[-0.03em] text-[var(--portal-accent)] sm:text-[3.5rem]"
          >
            {formatCountdown(secondsRemaining)}
          </p>
          <CardDescription className="mt-1 text-sm font-normal text-[#6b7280]">
            Your UI bundle is being crafted with precision
          </CardDescription>
          {isAwaitingApproval ? (
            <p className="mt-2 text-xs font-medium text-[var(--portal-accent)]">
              Awaiting admin approval — your sprint timer has started
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-2xl border-0 py-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-0">
        <CardHeader className="gap-0 px-6 pb-0 pt-6">
          <CardTitle className="text-base font-semibold tracking-[-0.01em]">
            Pipeline Status
          </CardTitle>
          <Separator className="mt-4 bg-[#f0f0f0]" />
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-5">
          <ol className="flex flex-col">
            {pipelineSteps.map((step, index) => {
              const isLast = index === pipelineSteps.length - 1
              const lineColor =
                step.status === "completed"
                  ? "bg-[var(--portal-success)]"
                  : step.status === "active"
                    ? "bg-[var(--portal-accent)]"
                    : "bg-[#e5e7eb]"

              return (
                <li key={step.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <StepIcon status={step.status} />
                    {!isLast ? (
                      <span
                        className={cn("my-1.5 w-0.5 flex-1 min-h-9", lineColor)}
                      />
                    ) : null}
                  </div>
                  <div className={cn("pb-7", isLast && "pb-0")}>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        step.status === "pending"
                          ? "text-[#9ca3af]"
                          : "text-foreground"
                      )}
                    >
                      {step.label}
                    </p>
                    {step.status === "active" ? (
                      <div className="mt-2.5 flex gap-1">
                        {[0, 1, 2].map((dot) => (
                          <span
                            key={dot}
                            className="size-1.5 animate-pulse rounded-full bg-[var(--portal-accent)]"
                            style={{ animationDelay: `${dot * 200}ms` }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
