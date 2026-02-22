# Replace Magic Link with Google OAuth + Allowlist

## Context

Supabase magic link emails have strict rate limits that make the login experience unreliable. Replacing with Google OAuth eliminates this dependency while adding an email allowlist to restrict access to authorized users only (matt@mcfw.io, b@valeron.ai).

## Manual Prerequisites (before code changes)

1. **Google Cloud Console**: Create OAuth 2.0 credentials (Web Application). Set authorized redirect URI to `https://uygkxicupbvnfdcymyge.supabase.co/auth/v1/callback`
2. **Supabase Dashboard**: Authentication > Providers > Google — enable and paste Client ID + Secret. Ensure "Link identities" is enabled so existing magic link users get their Google identity merged (preserving user IDs and data).
3. **Vercel**: Add env var `ALLOWED_EMAILS=matt@mcfw.io,b@valeron.ai`

## Files to Modify

### 1. `src/app/api/auth/route.ts` — OAuth initiation

Replace the POST handler:
- Remove rate limiting (`checkRateLimit` import, IP extraction, rate limit check)
- Remove email parsing/validation
- Call `supabase.auth.signInWithOAuth({ provider: 'google' })` with `redirectTo` pointing to `/api/auth/callback` and `queryParams: { prompt: 'select_account' }`
- Return `{ url }` for the client to navigate to
- Keep DELETE handler unchanged

### 2. `src/app/api/auth/callback/route.ts` — Allowlist enforcement

After successful `exchangeCodeForSession`:
- Call `supabase.auth.getUser()` to get the authenticated email
- Parse `ALLOWED_EMAILS` env var (comma-separated, lowercased, trimmed)
- If email not in allowlist: `signOut()` immediately, redirect to `/login?error=not_allowed`
- If allowed: redirect to home as before

This is the right enforcement point — unauthorized users never get a valid session cookie.

### 3. `src/app/login/page.tsx` — Google sign-in button

Replace the `LoginForm` component:
- Remove `email`, `sent` state — keep `error`, `loading`
- Add handler for `error=not_allowed` URL param (display "Your Google account is not authorized")
- Replace `<form>` with a "Sign in with Google" button
- onClick: POST to `/api/auth`, receive `{ url }`, navigate via `window.location.href`
- Keep logo, Framer Motion animations, glass card layout

### 4. `src/app/login/page.module.css` — Minor cleanup

- Add `.googleButton` class with flex layout + gap for icon+text
- `.input` and `.success` classes become unused (leave or remove)

### 5. `src/app/api/auth/route.test.ts` — Rewrite tests

- Remove `checkRateLimit` mock and all rate limit / email validation tests
- Mock `signInWithOAuth` instead of `signInWithOtp`
- New tests: returns Google URL on success, returns 500 on failure
- DELETE tests unchanged

### 6. `.env.example` — Document new var

- Add `ALLOWED_EMAILS=matt@mcfw.io,b@valeron.ai`
- Update `NEXT_PUBLIC_APP_URL` comment from "magic link" to "OAuth callback"

## Edge Cases

- **Empty/missing `ALLOWED_EMAILS`**: Fails closed — no one can log in (safe default)
- **Google email differs from existing user**: If matt@mcfw.io is not Google Workspace, may need to update allowlist to `mcfwalker@gmail.com`. The env var approach handles this without code changes.
- **Non-allowed user completes OAuth**: Session created momentarily by Supabase, then immediately signed out in callback. Harmless orphan auth.users entry.

## Verification

1. `npm run build` — no build errors
2. `npm run test:run` — tests pass
3. Manual: visit `/login`, see Google button (no email input)
4. Manual: sign in with allowlisted email — lands on home page
5. Manual: sign in with non-allowlisted email — redirected to `/login?error=not_allowed`
6. Manual: logout works from sidebar
