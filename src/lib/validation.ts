/**
 * Input validation and sanitization utilities.
 * Used by all API routes that accept user input.
 */

/** Strip HTML/script tags from input */
export function sanitize(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .trim();
}

/** Validate email format */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Validate username (1-30 chars, no HTML) */
export function validateName(name: string): { valid: boolean; error?: string; value: string } {
  const cleaned = sanitize(name);
  if (!cleaned) return { valid: false, error: "Name is required", value: "" };
  if (cleaned.length > 30) return { valid: false, error: "Name must be 30 characters or less", value: cleaned };
  return { valid: true, value: cleaned };
}

/** Validate bio (max 250 chars) */
export function validateBio(bio: string): { valid: boolean; error?: string; value: string } {
  const cleaned = sanitize(bio);
  if (cleaned.length > 250) return { valid: false, error: "Bio must be 250 characters or less", value: cleaned };
  return { valid: true, value: cleaned };
}

/** Validate review text (10-10000 chars) */
export function validateReviewText(text: string): { valid: boolean; error?: string; value: string } {
  const cleaned = sanitize(text);
  if (!cleaned) return { valid: false, error: "Review text is required", value: "" };
  if (cleaned.length < 10) return { valid: false, error: "Review must be at least 10 characters", value: cleaned };
  if (cleaned.length > 10000) return { valid: false, error: "Review must be 10,000 characters or less", value: cleaned };
  return { valid: true, value: cleaned };
}

/** Validate rating score (integer 1-5) */
export function isValidScore(score: number): boolean {
  return Number.isInteger(score) && score >= 1 && score <= 5;
}

/** Validate recommend tag */
export function isValidRecTag(tag: string | null): boolean {
  return tag === null || ["recommend", "mixed", "skip"].includes(tag);
}

/** Validate library status */
export function isValidStatus(status: string): boolean {
  return ["completed", "in_progress", "want_to", "dropped"].includes(status);
}

/** Validate list name (1-100 chars) */
export function validateListName(name: string): { valid: boolean; error?: string; value: string } {
  const cleaned = sanitize(name);
  if (!cleaned) return { valid: false, error: "List name is required", value: "" };
  if (cleaned.length > 100) return { valid: false, error: "List name must be 100 characters or less", value: cleaned };
  return { valid: true, value: cleaned };
}

/**
 * Simple in-memory rate limiter.
 * On Vercel serverless, each invocation may get a fresh instance,
 * so this provides basic protection within a single instance lifetime.
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= maxRequests) {
    return false; // blocked
  }

  entry.count++;
  return true; // allowed
}

/** Get client IP from request headers */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
