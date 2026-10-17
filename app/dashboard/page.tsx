"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { authClient } from "@/lib/auth-client"
import { isAdminUser } from "@/lib/auth-utils"

export default function DashboardPage() {
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
      return
    }

    router.replace("/portal")
  }, [isPending, session, router])

  return (
    <div className="flex min-h-svh items-center justify-center">
      <p className="text-muted-foreground">Redirecting to portal...</p>
    </div>
  )
}
