export type QueueRateLimits = {
  minDelay?: unknown;
  maxDelay?: unknown;
  hourlyLimit?: unknown;
  dailyLimit?: unknown;
  pauseEvery?: unknown;
  pauseMinutes?: unknown;
};

const DEFAULT_RATE_LIMITS = {
  minDelay: 180,
  maxDelay: 300,
  hourlyLimit: 20,
  dailyLimit: 120,
  pauseEvery: 10,
  pauseMinutes: 15,
};

type NormalizedRateLimits = {
  minDelay: number;
  maxDelay: number;
  hourlyLimit: number | null;
  dailyLimit: number | null;
  pauseEvery: number | null;
  pauseMinutes: number;
};

function readNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readPositiveLimit(value: unknown, fallback: number) {
  const parsed = Math.floor(readNumber(value, fallback));
  return parsed > 0 ? parsed : null;
}

function normalizeRateLimits(rateLimits?: QueueRateLimits): NormalizedRateLimits {
  const minDelay = Math.max(
    0,
    Math.floor(readNumber(rateLimits?.minDelay, DEFAULT_RATE_LIMITS.minDelay)),
  );
  const rawMaxDelay = Math.max(
    0,
    Math.floor(readNumber(rateLimits?.maxDelay, DEFAULT_RATE_LIMITS.maxDelay)),
  );
  const maxDelay = Math.max(minDelay, rawMaxDelay);

  return {
    minDelay,
    maxDelay,
    hourlyLimit: readPositiveLimit(
      rateLimits?.hourlyLimit,
      DEFAULT_RATE_LIMITS.hourlyLimit,
    ),
    dailyLimit: readPositiveLimit(
      rateLimits?.dailyLimit,
      DEFAULT_RATE_LIMITS.dailyLimit,
    ),
    pauseEvery: readPositiveLimit(
      rateLimits?.pauseEvery,
      DEFAULT_RATE_LIMITS.pauseEvery,
    ),
    pauseMinutes: Math.max(
      0,
      Math.floor(
        readNumber(rateLimits?.pauseMinutes, DEFAULT_RATE_LIMITS.pauseMinutes),
      ),
    ),
  };
}

function randomIntBetween(min: number, max: number) {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

function parseBaseDate(baseScheduledAt?: string | null) {
  const now = Date.now();
  const parsed = baseScheduledAt ? Date.parse(baseScheduledAt) : Number.NaN;
  return new Date(Number.isFinite(parsed) && parsed > now ? parsed : now);
}

function fitLimitBucket(
  candidateMs: number,
  baseMs: number,
  windowMs: number,
  limit: number | null,
  counts: Map<number, number>,
) {
  if (!limit) return candidateMs;
  let bucket = Math.floor((candidateMs - baseMs) / windowMs);
  while ((counts.get(bucket) ?? 0) >= limit) {
    bucket += 1;
    candidateMs = baseMs + bucket * windowMs;
  }
  return candidateMs;
}

function incrementBucket(
  candidateMs: number,
  baseMs: number,
  windowMs: number,
  counts: Map<number, number>,
) {
  const bucket = Math.floor((candidateMs - baseMs) / windowMs);
  counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
}

export function buildScheduledAtList(
  count: number,
  rateLimits?: QueueRateLimits,
  baseScheduledAt?: string | null,
) {
  if (count <= 0) return [];

  const limits = normalizeRateLimits(rateLimits);
  const baseMs = parseBaseDate(baseScheduledAt).getTime();
  const hourlyCounts = new Map<number, number>();
  const dailyCounts = new Map<number, number>();
  const scheduledAt: string[] = [];
  let elapsedSeconds = 0;

  for (let index = 0; index < count; index += 1) {
    elapsedSeconds += randomIntBetween(limits.minDelay, limits.maxDelay);

    if (
      index > 0 &&
      limits.pauseEvery &&
      index % limits.pauseEvery === 0 &&
      limits.pauseMinutes > 0
    ) {
      elapsedSeconds += limits.pauseMinutes * 60;
    }

    let candidateMs = baseMs + elapsedSeconds * 1000;
    candidateMs = fitLimitBucket(
      candidateMs,
      baseMs,
      60 * 60 * 1000,
      limits.hourlyLimit,
      hourlyCounts,
    );
    candidateMs = fitLimitBucket(
      candidateMs,
      baseMs,
      24 * 60 * 60 * 1000,
      limits.dailyLimit,
      dailyCounts,
    );
    candidateMs = fitLimitBucket(
      candidateMs,
      baseMs,
      60 * 60 * 1000,
      limits.hourlyLimit,
      hourlyCounts,
    );

    elapsedSeconds = Math.max(
      elapsedSeconds,
      Math.ceil((candidateMs - baseMs) / 1000),
    );
    incrementBucket(candidateMs, baseMs, 60 * 60 * 1000, hourlyCounts);
    incrementBucket(candidateMs, baseMs, 24 * 60 * 60 * 1000, dailyCounts);
    scheduledAt.push(new Date(candidateMs).toISOString());
  }

  return scheduledAt;
}

export function sortQueueContacts<T>(contacts: T[], getSortValue: (contact: T) => string) {
  return [...contacts].sort((left, right) =>
    getSortValue(left).localeCompare(getSortValue(right), "pt-BR", {
      numeric: true,
      sensitivity: "base",
    }),
  );
}
