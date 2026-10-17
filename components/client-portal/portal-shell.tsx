"use client"

import { useRouter } from "next/navigation"
import { PortalStepNav } from "@/components/client-portal/portal-step-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { LogOut } from "lucide-react"

export type PortalStep = "intake" | "processing" | "delivered"

type PortalShellProps = {
  activeStep: PortalStep
  maxStep: PortalStep
  children: React.ReactNode
}

export function PortalShell({
  activeStep,
  maxStep,
  children,
}: PortalShellProps) {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const isDelivered = activeStep === "delivered"
  const userEmail = session?.user?.email

  return (
    <div
      className={cn(
        "relative min-h-svh font-sans antialiased",
        "[--portal-accent:#E65F00] [--portal-accent-light:#FFF4ED] [--portal-accent-muted:#FDE8D8] [--portal-success:#10B981]",
        "bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,#fde8d8_0%,#fdfaf5_42%,#ffffff_100%)]"
      )}
    >
      <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        {userEmail ? (
          <p className="truncate text-sm text-[#6b7280]">
            <span className="font-medium text-foreground">Signed in as</span>{" "}
            {userEmail}
          </p>
        ) : (
          <span />
        )}
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full border-[#e5e7eb] bg-white/80 text-[#6b7280] shadow-sm backdrop-blur-sm hover:bg-white hover:text-foreground"
          onClick={async () => {
            await authClient.signOut()
            router.replace("/login")
            router.refresh()
          }}
        >
          <LogOut className="size-3.5" />
          Sign out
        </Button>
      </div>

      <div
        className={cn(
          "mx-auto flex w-full flex-col items-center gap-7 px-5 py-12 sm:gap-8 sm:py-16",
          isDelivered ? "max-w-[52rem]" : "max-w-[36rem]"
        )}
      >
        <header className="flex w-full flex-col items-center gap-2.5 text-center">
          <Badge
            variant="outline"
            className="h-6 rounded-full border-[#f5d5bc] bg-[#fff4ed] px-3 text-xs font-medium text-[var(--portal-accent)]"
          >
            SKD.ai Portal
          </Badge>
          <h1 className="text-[2.125rem] font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[2.375rem]">
            Client Portal
          </h1>
          <p className="text-[0.9375rem] font-normal text-[#6b7280]">
            Premium UI Design &amp; Engineering Pipeline
          </p>
        </header>

        <PortalStepNav activeStep={activeStep} maxStep={maxStep} />

        <div className="w-full">{children}</div>
      </div>
    </div>
  )
}
