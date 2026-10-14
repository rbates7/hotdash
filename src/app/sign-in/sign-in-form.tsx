"use client"

import { useActionState } from "react"
import { AlertCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { signIn, type SignInState } from "./actions"

/** 44px under 1280 (phone + tablet); Nova's h-8/h-9 needs `!` to lose. */
const TOUCH = "h-9! max-xl:h-11!"

export function SignInForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {
    error: null,
    email: "",
  })

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-label font-medium">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          // Keyed so a failed attempt re-fills the email the server echoed back.
          key={state.email}
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "sign-in-error" : undefined}
          className={TOUCH}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-label font-medium">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "sign-in-error" : undefined}
          className={TOUCH}
        />
      </div>

      {state.error ? (
        <p
          id="sign-in-error"
          role="alert"
          className="text-destructive flex items-start gap-2 text-sm"
        >
          <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className={`w-full ${TOUCH}`}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  )
}
