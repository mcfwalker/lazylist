// Sanitize search input to prevent SQL injection in PostgREST filters
export function sanitizeSearchInput(input: string): string {
  // Escape PostgREST special characters: %, _, \
  // Also limit length and remove potentially dangerous characters
  return input
    .slice(0, 100) // Limit length
    .replace(/[%_\\]/g, '\\$&') // Escape PostgREST wildcards
    .replace(/[^\w\s\-.']/g, '') // Only allow safe characters
}
