/** Sign-in copy, shared by the page, the server action, and the tests. */
export const AUTH_COPY = {
  notConfiguredTitle: "Sign-in isn't configured",
  notConfigured: "Sign-in isn't configured. Ask the site owner to set the sign-in environment variables.",
  missing: "Enter your email and password.",
  incorrect: "Email or password is incorrect.",
  tooMany: (minutes: number) =>
    `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
} as const
