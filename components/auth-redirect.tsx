"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { authClient } from "@/lib/auth-client"
import { isAdminUser } from "@/lib/auth-utils"

export function AuthRedirect({
  children,
  redirectTo = "/portal",
}: {
  children: React.ReactNode
  redirectTo?: string
}) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || isPending || !session) {
      return
    }

    if (isAdminUser(session.user)) {
      authClient.signOut()
      return
    }

    router.replace(redirectTo)
  }, [mounted, isPending, session, router, redirectTo])

  if (!mounted) {
    return <>{children}</>
  }

  if (isPending || session) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return <>{children}</>
}
