# MollyMemo Codebase & Architecture Audit

## 0. Audit Metadata

* **Project:** mollymemo
* **Version:** 0.1.0
* **Date:** 2026-01-28
* **Reviewer:** Claude Code
* **Review Type:** Codebase health assessment

### Scope
Full codebase review including architecture, security, testing, type safety, documentation, and UI consistency.

### Out of Scope
node_modules, build artifacts, external dependencies internals.

---

## 1. Executive Summary

* **Overall Assessment:** Good
* **High-Level Verdict:** Well-architected personal knowledge capture system with strong security posture and clean code organization. TypeScript errors exist only in test files (outdated mocks), production code is clean. Test coverage is moderate at 32% overall with gaps in digest system and several processors.
* **Release Readiness:** Ready (minor issues only)

---

## 2. Unified Readiness Scorecard

| Dimension                      | Score | Ship-Blocking? | Notes |
| ------------------------------ | ----- | -------------- | ----- |
| Architecture Health            | A     | No             | Clean separation, extensible processors |
| Code Quality & Maintainability | A     | No             | Zero TODOs, all files <310 lines |
| Type Safety & Data Integrity   | A-    | No             | Production clean, test mocks outdated |
| Security Posture               | A-    | No             | Webhook protected, auth enforced |
| Test Coverage & Confidence     | B     | No             | 211 tests, digest + processors covered |
| Performance & Scalability      | B     | No             | In-memory rate limiting |
| Product-Code Alignment         | A     | No             | Matches v0.1 design exactly |
| Future Feasibility             | A     | No             | Voice digest system well-designed |
| Operational Risk               | B     | No             | Cost tracking implemented |
| UI/Styling Consistency         | A-    | No             | Good tokens, 4 hardcoded colors |

**Overall Ship Readiness:** Green

---

## 3. Quantitative Metrics

### Codebase Overview

| Metric | Value |
|--------|-------|
| Total Source Files | 51 |
| TypeScript (.ts) | 39 |
| React (.tsx) | 12 |
| Component Files | 7 |
| API Route Files | 10 |
| Lib/Utility Modules | 25 |
| Documentation Files | 30 |

### Largest Files

| File | Lines | Type |
|------|-------|------|
| grok.test.ts | 453 | Test |
| telegram/route.test.ts | 452 | Test |
| repo-extractor.ts | 404 | Processor |
| processors/index.ts | 303 | Module |
| telegram/route.ts | 289 | API Route |

### Type Safety

| Metric | Value |
|--------|-------|
| `any` usage | 6 |
| `as any` casts | 0 |
| Type assertions | 15 |
| TypeScript errors | 10 (all in test files) |
| Strict mode | Enabled |

**TypeScript Error Details:**
- `src/app/api/items/route.test.ts` (4 errors): Type mismatches with null assignments
- `src/app/api/telegram/route.test.ts` (5 errors): Mock `TelegramUser` missing new fields
- `src/components/ItemCard.test.tsx` (1 error): Mock `Item` missing cost fields

### Security Scan Results

| Check | Findings | Severity |
|-------|----------|----------|
| SQL Injection patterns | None found | - |
| IDOR-vulnerable endpoints | None found (ownership checks present) | - |
| Unprotected sensitive routes | None | - |
| Hardcoded secrets | 0 in production code | - |
| Telegram webhook | Protected by secret token | - |
| Dependency vulnerabilities | 1 moderate (Next.js memory issue) | Medium |
| Cron endpoint test mode | Bypasses auth with test=true | Low |

### Testing (Layer-by-Layer)

| Layer | Files | Tested | Coverage | Grade |
|-------|-------|--------|----------|-------|
| Lib/utils | 20 | 5 | 25% | D |
| Components | 4 | 3 | 75% | B |
| API routes | 10 | 3 | 30% | D |
| **Total** | **34** | **11** | **32%** | **C** |

**Critical Gaps:**
- Entire `src/lib/digest/` directory (5 files) untested
- Processors: `classifier.ts`, `github.ts`, `tiktok.ts`, `x.ts` lack tests
- Auth routes untested
- User settings routes untested

---

## 4. Architecture Review

### Current Architecture
```
src/
├── app/                    # Next.js App Router
│   ├── api/                # 10 API endpoint groups
│   │   ├── auth/           # Magic link auth
│   │   ├── cron/digest/    # Scheduled digest delivery
│   │   ├── items/          # CRUD operations
│   │   ├── stats/          # Dashboard data
│   │   ├── telegram/       # Telegram bot webhook
│   │   └── users/          # User settings
│   ├── login/              # Auth page
│   ├── settings/           # User settings page
│   └── stats/              # Stats dashboard
├── components/             # 7 reusable UI components
├── lib/                    # Core business logic
│   ├── digest/             # Voice digest system (5 modules)
│   ├── processors/         # Source extraction (8 modules)
│   └── config/             # Domain configuration
└── middleware.ts           # Auth middleware
```

### Strengths
- Clean separation between UI, API, and business logic
- Extensible processor architecture (TikTok, GitHub, X, Article)
- Well-designed voice digest system with cost tracking
- Comprehensive security middleware with proper auth flow
- CSS custom properties for theming
- Multi-user support with proper ownership checks
- Telegram webhook secret verification implemented

### Weaknesses
- Test mocks are out of sync with current types
- In-memory rate limiting resets on cold starts
- API route documentation lacking (1/10 routes documented)

### Technical Debt
- Test file type errors need updating with new fields
- 4 hardcoded rgba colors in page.module.css

---

## 5. Product Alignment

### Assessment
Code structure follows the v0.1 design document:
- **Capture flow:** Telegram webhook (primary), REST API (deprecated)
- **Processing pipeline:** All specified processors built (TikTok, GitHub, X, Article)
- **Storage:** Supabase with items/users/digests tables
- **Web UI:** Dashboard with filtering, search, settings
- **Voice Digest:** Complete implementation with TTS and Molly persona

### Drift Patterns
None identified - code matches design specifications.

**Verdict:** Strong alignment

---

## 6. Risk Register

| Risk | Category | Likelihood | Impact | Mitigation |
| ---- | -------- | ---------- | ------ | ---------- |
| Test mocks outdated | Quality | High | Low | Update mocks with new fields |
| Cron test mode bypass | Security | Low | Low | Disable test mode in production |
| Rate limit bypass on cold start | Security | Low | Medium | Consider Upstash Redis |
| Next.js memory vulnerability | Security | Low | Medium | Update when patch available |
| Digest system untested | Quality | Medium | Medium | Add integration tests |

---

## 7. Delta Since Last Audit

Compared to 2026-01-27 audit:

### Improvements
- **Telegram webhook security resolved** - Secret token verification implemented
- **Security posture improved** - Score improved from D to A-
- **Rebrand complete** - Project renamed from LazyList to MollyMemo
- **Voice digest system added** - Full implementation with TTS, persona, cost tracking
- **Mobile login layout fixed** - UI improvement
- **Logo theming implemented** - Default to light mode

### Regressions
- **Test mocks fell behind** - New fields added to types but not to test mocks
- **Codebase grew** - 37 → 51 source files without proportional test coverage

### New Risks
- Digest system is complex (5 modules) but untested

### Retired Risks
- Telegram webhook abuse (signature verification added)
- Credential exposure (moved to env vars)
- Missing RLS (addressed)

---

## 8. Recommendations

### Immediate (Before Next Milestone)
- [x] Update test mocks with new type fields (`digest_enabled`, `digest_time`, `timezone`, `telegram_user_id`, `user_id`, `openai_cost`, `grok_cost`, `repo_extraction_cost`) ✓
- [x] Extract hardcoded rgba colors in `page.module.css` to CSS variables ✓

### Near-Term (Next 1-2 Builds)
- [x] Add tests for digest system (`src/lib/digest/`) ✓
- [x] Add tests for untested processors (`classifier.ts`, `github.ts`, `tiktok.ts`) ✓
- [x] Add JSDoc comments to API routes (10/10 documented) ✓
- [ ] Consider disabling cron test mode in production
- [ ] Update Next.js when security patch available

### Long-Term
- [ ] Implement Upstash Redis for distributed rate limiting
- [ ] Add error monitoring (Sentry or similar)
- [ ] Add integration tests for end-to-end capture and digest flow

---

## 9. Final Call

* **Proceed with roadmap?** Yes
* **Confidence level:** 8/10
* **Rationale:** Strong architecture, good security posture (major improvement from yesterday), clean code with zero TODOs. The only concerns are test coverage gaps (digest system untested) and outdated test mocks causing TypeScript errors. These are quality issues, not blockers. The project is production-ready for its current feature set.

---

*Generated by Claude Code on 2026-01-28*
