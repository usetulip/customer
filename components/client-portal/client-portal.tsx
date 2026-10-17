"use client"

import { useCallback, useEffect, useState } from "react"
import { DeliveredView } from "@/components/client-portal/delivered-view"
import { IntakeBrief } from "@/components/client-portal/intake-brief"
import {
  PortalShell,
  type PortalStep,
} from "@/components/client-portal/portal-shell"
import { PortalStepContent } from "@/components/client-portal/portal-step-content"
import { ProcessingView } from "@/components/client-portal/processing-view"
import {
  getMyProject,
  submitIntakeBrief,
  type IntakeBriefPayload,
  type Project,
} from "@/lib/api"

function projectToStep(project: Project | null): PortalStep {
  if (!project) {
    return "intake"
  }
  if (project.status === "delivered") {
    return "delivered"
  }
  return "processing"
}

export function ClientPortal() {
  const [activeStep, setActiveStep] = useState<PortalStep>("intake")
  const [project, setProject] = useState<Project | null>(null)
  const [hasMounted, setHasMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProject = useCallback(async () => {
    try {
      const { project: loaded } = await getMyProject()
      setProject(loaded)
      setActiveStep(projectToStep(loaded))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    setHasMounted(true)
    loadProject()
  }, [loadProject])

  useEffect(() => {
    if (project) {
      setActiveStep(projectToStep(project))
    }
  }, [project?.status, project?.id])

  useEffect(() => {
    if (!project || project.status === "delivered") {
      return
    }

    const interval = window.setInterval(() => {
      loadProject()
    }, 15000)

    return () => window.clearInterval(interval)
  }, [project, loadProject])

  async function handleSubmitBrief(payload: IntakeBriefPayload) {
    setError(null)
    const { project: created } = await submitIntakeBrief(payload)
    setProject(created)
    setActiveStep("processing")
  }

  const maxStep = projectToStep(project)

  if (!hasMounted || isLoading) {
    return (
      <PortalShell activeStep={activeStep} maxStep={maxStep}>
        <div className="h-[32rem] w-full rounded-2xl bg-white/60" />
      </PortalShell>
    )
  }

  return (
    <PortalShell activeStep={activeStep} maxStep={maxStep}>
      {error ? (
        <p className="mb-4 text-center text-sm text-red-600">{error}</p>
      ) : null}
      {activeStep === "intake" ? (
        <PortalStepContent stepKey="intake">
          <IntakeBrief
            onSubmit={handleSubmitBrief}
            existingProject={project}
          />
        </PortalStepContent>
      ) : null}
      {activeStep === "processing" ? (
        <PortalStepContent stepKey="processing">
          <ProcessingView project={project} isActive />
        </PortalStepContent>
      ) : null}
      {activeStep === "delivered" ? (
        <PortalStepContent stepKey="delivered">
          <DeliveredView project={project} />
        </PortalStepContent>
      ) : null}
    </PortalShell>
  )
}
