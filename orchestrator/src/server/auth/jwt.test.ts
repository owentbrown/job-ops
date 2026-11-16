import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Session = {
  id: string;
  subject: string;
  userId: string;
  tenantId: string;
  expiresAt: number;
  revokedAt: number | null;
};
const sessions = new Map<string, Session>();

vi.mock("@server/repositories/auth-sessions", () => ({
  createAuthSession: vi.fn(async (args: Omit<Session, "revokedAt">) => {
    sessions.set(args.id, { ...args, revokedAt: null });
  }),
  getAuthSession: vi.fn(async (id: string) => sessions.get(id) ?? null),
  extendAuthSession: vi.fn(async (id: string, expiresAt: number) => {
    const session = sessions.get(id);
    if (session) session.expiresAt = expiresAt;
  }),
  revokeAuthSession: vi.fn(),
  deleteAllAuthSessions: vi.fn(async () => sessions.clear()),
}));

const DAY = 24 * 60 * 60;
const claims = {
  sub: "owen",
  userId: "user-1",
  tenantId: "tenant-1",
  username: "owen",
  isSystemAdmin: false,
};

describe("sign-in expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    vi.stubEnv("JWT_SECRET", "x".repeat(40));
    vi.stubEnv("JWT_EXPIRY_SECONDS", String(30 * DAY));
    sessions.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps you signed in while you keep using the app", async () => {
    const { signToken, verifyToken } = await import("./jwt");
    const { token } = await signToken(claims);
    // Use it every 20 days for half a year.
    for (let i = 0; i < 9; i++) {
      vi.advanceTimersByTime(20 * DAY * 1000);
      await expect(verifyToken(token)).resolves.toMatchObject({
        userId: "user-1",
      });
    }
  });

  it("signs you out after 30 days without using it", async () => {
    const { signToken, verifyToken } = await import("./jwt");
    const { token } = await signToken(claims);
    vi.advanceTimersByTime(29 * DAY * 1000);
    await verifyToken(token);
    vi.advanceTimersByTime(30 * DAY * 1000 + 1000);
    await expect(verifyToken(token)).rejects.toThrow();
  });
});
