export function getUserRole(user: unknown) {
  if (
    user &&
    typeof user === "object" &&
    "role" in user &&
    user.role
  ) {
    return String(user.role)
  }
  return "user"
}

export function isAdminUser(user: unknown) {
  return getUserRole(user) === "admin"
}
