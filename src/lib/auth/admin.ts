export function parseAdminEmails(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function isAdminEmail(email: string | null | undefined, raw: string | undefined): boolean {
  return Boolean(email && parseAdminEmails(raw).includes(email.trim().toLowerCase()));
}
