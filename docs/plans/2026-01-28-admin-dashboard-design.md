# Admin Dashboard Design

**Date:** 2026-01-28
**Status:** Implemented

## Overview

Admin-only dashboard for cost tracking and user analytics. Protected by `is_admin` flag in the database.

## Database Changes

- Added `is_admin` boolean column to `users` table (default: false)
- Partial index on `is_admin` for efficient admin lookups

## Authentication

Middleware checks for admin routes (`/admin/*`, `/api/admin/*`):

1. Verify user is authenticated (existing)
2. Query `users.is_admin` for the authenticated user
3. If not admin: redirect to `/` (UI) or return 403 (API)

## Route Structure

```
/admin              → Redirects to /admin/stats
/admin/stats        → Cost dashboard with per-user breakdown
/api/admin/stats/dashboard → Admin stats API
```

## Features

### Per-User Cost Breakdown

Shows all users with activity:
- Item count and cost
- Digest count and cost
- Total cost per user

Sorted by total cost descending.

### Existing Stats (now admin-only)

- Current month summary
- All-time totals
- Cost by operation type
- Cost by source type
- Monthly history

## Future Considerations

- `admin.mollymemo.com` subdomain via Vercel rewrite
- User management (enable/disable accounts)
- System health monitoring
- Cost alerts/thresholds
