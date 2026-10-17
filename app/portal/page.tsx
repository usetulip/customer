"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { ClientPortal } from "@/components/client-portal/client-portal"
import { authClient } from "@/lib/auth-client"
import { isAdminUser } from "@/lib/auth-utils"

export default function PortalPage() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (isPending) {
      return
    }

    if (!session) {
      router.replace("/login")
      return
    }

    if (isAdminUser(session.user)) {
      authClient.signOut().finally(() => {
        router.replace("/login")
      })
    }
  }, [isPending, session, router])

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-muted-foreground">Loading portal...</p>
      </div>
    )
  }

  if (!session || isAdminUser(session.user)) {
    return null
  }

  return <ClientPortal />
}
