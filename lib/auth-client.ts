import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  fetchOptions: {
    credentials: "include",
  },
  sessionOptions: {
    // Don't refetch the session every time the browser tab regains focus.
    // Default is true, which makes the portal re-render/flash on each tab switch.
    refetchOnWindowFocus: false,
  },
});
