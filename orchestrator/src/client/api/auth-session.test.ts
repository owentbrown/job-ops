import { afterEach, describe, expect, it, vi } from "vitest";

const TOKEN_KEY = "jobops.authToken";

async function freshModule() {
  vi.resetModules();
  return import("./auth-session");
}

describe("auth session persistence", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps the sign-in token after the app is reopened", async () => {
    const first = await freshModule();
    first.setAuthenticatedSession("token-abc");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("token-abc");

    // A closed home-screen app loses sessionStorage but keeps localStorage.
    sessionStorage.clear();
    const reopened = await freshModule();
    expect(reopened.hasAuthenticatedSession()).toBe(true);
    expect(reopened.getCachedAuthHeader()).toBe("Bearer token-abc");
  });

  it("moves a token saved by an older build out of sessionStorage", async () => {
    sessionStorage.setItem(TOKEN_KEY, "old-token");
    const mod = await freshModule();
    expect(mod.getCachedAuthHeader()).toBe("Bearer old-token");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("old-token");
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("forgets the token on sign-out", async () => {
    const mod = await freshModule();
    mod.setAuthenticatedSession("token-abc");
    mod.clearAuthSession();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(mod.hasAuthenticatedSession()).toBe(false);
  });
});
