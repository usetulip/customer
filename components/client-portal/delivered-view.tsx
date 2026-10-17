"use client"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Project } from "@/lib/api"
import {
  Box,
  Check,
  Code,
  Download,
  FileText,
  Settings2,
} from "lucide-react"

const NEXT_STEPS = [
  "Review the Figma system and make any design customizations",
  "Clone the React repository and integrate with your backend",
  "Import the custom view code into your project",
  "Deploy and iterate with confidence",
] as const

type DeliveredViewProps = {
  project: Project | null
}

export function DeliveredView({ project }: DeliveredViewProps) {
  const resources = [
    {
      icon: FileText,
      title: "Master Figma System",
      description: "Pre-configured tokens and components",
      action: "Download .fig",
      actionIcon: Download,
      url: project?.figmaFileUrl,
      fileName: project?.figmaFileName ?? "design-system.fig",
      available: Boolean(project?.figmaFileUrl),
    },
    {
      icon: Code,
      title: "React + ShadCN Starter Repo",
      description: "Your exact 1:1 engineering mirror",
      action: "View GitHub",
      actionIcon: Code,
      url: project?.githubUrl,
      fileName: null,
      available: Boolean(project?.githubUrl),
    },
    {
      icon: Box,
      title: "Custom View Code",
      description: "The specific layouts from your brief",
      action: "Download .zip",
      actionIcon: Download,
      url: project?.zipFileUrl,
      fileName: project?.zipFileName ?? "custom-views.zip",
      available: Boolean(project?.zipFileUrl),
    },
  ] as const

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden rounded-2xl border-0 bg-gradient-to-r from-[#ecfdf5] via-white to-[#fff7ed] py-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-0">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span className="flex size-[3.25rem] items-center justify-center rounded-full bg-[var(--portal-success)] text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)]">
            <Check className="size-6" strokeWidth={2.5} />
          </span>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-[-0.02em] text-foreground">
              Your UI Bundle is Ready
            </h2>
            <p className="text-sm font-normal text-[#6b7280]">
              All assets have been compiled and optimized for your platform
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {resources.map((resource) => (
          <Card
            key={resource.title}
            className="gap-0 rounded-2xl border-0 py-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-0"
          >
            <CardHeader className="items-center gap-3 px-5 pb-0 pt-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--portal-accent-light)] text-[var(--portal-accent)]">
                <resource.icon className="size-5" strokeWidth={2} />
              </span>
              <CardTitle className="text-[0.9375rem] font-semibold leading-snug">
                {resource.title}
              </CardTitle>
              <CardDescription className="text-xs font-normal leading-relaxed text-[#6b7280]">
                {resource.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-4">
              {resource.available && resource.url ? (
                <Button
                  asChild
                  className="h-10 w-full rounded-lg bg-[var(--portal-accent)] text-sm font-semibold text-white shadow-[0_2px_8px_rgba(230,95,0,0.2)] hover:bg-[#d45500]"
                >
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={resource.fileName ?? undefined}
                  >
                    <resource.actionIcon className="size-4" />
                    {resource.action}
                  </a>
                </Button>
              ) : (
                <Button
                  disabled
                  className="h-10 w-full rounded-lg text-sm font-semibold"
                >
                  <resource.actionIcon className="size-4" />
                  Pending upload
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="gap-0 rounded-2xl border-0 bg-[#faf6f0] py-0 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ring-0">
        <CardHeader className="px-6 pb-0 pt-6">
          <div className="flex items-center gap-2">
            <Settings2 className="size-[1.125rem] text-[var(--portal-accent)]" />
            <CardTitle className="text-base font-semibold tracking-[-0.01em]">
              Next Steps
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-4">
          <ul className="flex flex-col gap-3">
            {NEXT_STEPS.map((step) => (
              <li key={step} className="flex items-start gap-2.5">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-[var(--portal-accent)]"
                  strokeWidth={2.5}
                />
                <span className="text-sm font-normal leading-relaxed text-[#4b5563]">
                  {step}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
