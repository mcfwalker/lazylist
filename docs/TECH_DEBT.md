# Tech Debt

Tracking known limitations and future improvements.

---

## TikTok Photo Posts — Limited Caption Extraction

**Added:** 2026-01-30

**Issue:** tikwm API only returns hashtags for TikTok photo posts, not the full caption text. Video posts work fine.

**Impact:** Photo posts captured via Telegram will only have hashtag metadata, missing the main caption content like "EZ Backend, 17 public apis for your front-end side project".

**Workarounds considered:**
- Use a different TikTok API for photos
- Scrape TikTok page directly (fragile, may break)
- Accept limitation (current approach)

**Status:** Accepted — most TikToks are videos. Revisit if photo posts become common.
