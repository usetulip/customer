import { AuthRedirect } from "@/components/auth-redirect"
import { SignupForm } from "@/components/signup-form"

export default function SignupPage() {
  return (
    <AuthRedirect>
      <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
        <div className="w-full max-w-sm">
          <SignupForm />
        </div>
      </div>
    </AuthRedirect>
  )
}
