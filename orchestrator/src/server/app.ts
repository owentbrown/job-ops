/**
 * Express app factory (useful for tests).
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unauthorized } from "@infra/errors";
import {
  apiErrorHandler,
  fail,
  notFoundApiHandler,
  requestContextMiddleware,
} from "@infra/http";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { sanitizeUnknown } from "@infra/sanitize";
import { verifyToken } from "@server/auth/jwt";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import { isDemoMode } from "@server/config/demo";
import * as usersRepo from "@server/repositories/users";
import { proxyChallengeViewerRequest } from "@server/services/challenge-viewer";
import { DEFAULT_TENANT_ID } from "@server/tenancy/constants";
import cors from "cors";
import express from "express";
import { apiRouter } from "./api/index";
import { ojcpManifestHandler, ojcpMcpHandler } from "./ojcp";
import { resolveTracerRedirect } from "./services/tracer-links";

const __dirname = dirname(fileURLToPath(import.meta.url));
export function createAuthGuard() {
  const testAuthBypassEnabled =
    process.env.NODE_ENV === "test" &&
    process.env.JOBOPS_TEST_AUTH_BYPASS === "1";

  async function getAuthorizationContext(req: express.Request): Promise<{
    userId: string;
    tenantId: string;
    username: string;
    isSystemAdmin: boolean;
  } | null> {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length).trim();
    try {
      const payload = await verifyToken(token);
      const user = await usersRepo.getUserById(payload.userId);
      const appConfig = getJobOpsAppConfig();
      if (
        !user ||
        user.isDisabled ||
        user.workspaceId !== payload.tenantId ||
        (appConfig.appMode === "hosted" &&
          user.workspaceId !== appConfig.hostedTenantId)
      ) {
        return null;
      }
      return {
        userId: user.id,
        tenantId: user.workspaceId,
        username: user.username,
        isSystemAdmin: user.isSystemAdmin,
      };
    } catch {
      return null;
    }
  }

  function isPublicReadOnlyRoute(method: string, path: string): boolean {
    const normalizedMethod = method.toUpperCase();
    const normalizedPath = path.split("?")[0] || path;

    // Explicitly allowed public API routes
    if (normalizedPath === "/api/demo/info") return true;
    if (normalizedPath === "/api/app/status") return true;
    if (normalizedPath === "/api/profile/status") return true;
    if (
      normalizedMethod === "POST" &&
      normalizedPath === "/api/billing/webhook" &&
      getJobOpsAppConfig().appMode === "hosted"
    )
      return true;
    if (normalizedMethod === "POST" && normalizedPath === "/ojcp/mcp")
      return true;
    if (
      normalizedMethod === "POST" &&
      normalizedPath === "/api/visa-sponsors/search"
    )
      return true;
    if (
      normalizedMethod === "POST" &&
      normalizedPath === "/api/webhook/trigger"
    )
      return Boolean(process.env.WEBHOOK_SECRET?.trim());

    // Auth endpoints must be accessible without existing auth.
    if (
      normalizedMethod === "POST" &&
      (normalizedPath === "/api/auth/login" ||
        normalizedPath === "/api/auth/logout" ||
        normalizedPath === "/api/auth/signup" ||
        normalizedPath === "/api/auth/setup")
    )
      return true;
    if (
      normalizedMethod === "GET" &&
      normalizedPath === "/api/auth/bootstrap-status"
    )
      return true;
    if (
      normalizedMethod === "GET" &&
      normalizedPath === "/api/auth/sso/providers"
    )
      return true;
    if (
      normalizedMethod === "POST" &&
      /^\/api\/auth\/sso\/(google|github|oidc)\/(start|callback)$/.test(
        normalizedPath,
      )
    )
      return true;
    if (
      ["GET", "HEAD"].includes(normalizedMethod) &&
      /^\/api\/design-resume\/assets\/[^/]+\/content$/.test(normalizedPath)
    )
      return getJobOpsAppConfig().appMode !== "hosted";
    if (
      ["GET", "HEAD"].includes(normalizedMethod) &&
      /^\/api\/[^/]+\/health$/.test(normalizedPath)
    )
      return true;

    return false;
  }

  function isProtectedDemoRoute(path: string): boolean {
    const normalizedPath = path.split("?")[0] || path;

    if (normalizedPath === "/api/auth/me") return true;
    // Linking and listing connected accounts act on a real user, so they stay
    // behind auth in demo mode. requiresAuth consults isPublicReadOnlyRoute
    // first, which keeps the sign-in routes reachable.
    if (normalizedPath.startsWith("/api/auth/sso/")) return true;
    if (normalizedPath.startsWith("/api/workspaces")) return true;
    if (normalizedPath === "/api/settings/codex-auth") return true;
    if (normalizedPath === "/api/settings/rx-resumes") return true;
    if (/^\/api\/settings\/rx-resumes\/[^/]+\/projects$/.test(normalizedPath)) {
      return true;
    }

    return false;
  }

  function isPublicDemoRoute(path: string): boolean {
    if (!isDemoMode()) return false;

    const normalizedPath = path.split("?")[0] || path;
    if (!normalizedPath.startsWith("/api/")) return false;

    return !isProtectedDemoRoute(normalizedPath);
  }

  function requiresAuth(method: string, path: string): boolean {
    if (isPublicReadOnlyRoute(method, path)) return false;
    if (isPublicDemoRoute(path)) return false;
    // OPTIONS is always exempt for CORS preflight.
    if (method.toUpperCase() === "OPTIONS") return false;

    // Analytics and per-job tracer details are workspace-private.
    if (path.startsWith("/api/tracer-links/analytics")) return true;
    if (path.startsWith("/api/tracer-links/jobs")) return true;

    // Allow public read access to other tracer link routes.
    if (path.startsWith("/api/tracer-links")) {
      return !["GET", "HEAD"].includes(method.toUpperCase());
    }

    // All other /api/* paths require auth regardless of HTTP method.
    if (path.startsWith("/api/")) return true;

    // Non-API routes (SPA, /health, static) remain publicly readable via GET/HEAD.
    return !["GET", "HEAD"].includes(method.toUpperCase());
  }

  const middleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    void (async () => {
      if (!requiresAuth(req.method, req.path)) {
        next();
        return;
      }

      if (testAuthBypassEnabled) {
        runWithRequestContext(
          {
            userId: "test-user",
            tenantId: DEFAULT_TENANT_ID,
            username: "test",
            isSystemAdmin: true,
          },
          () => next(),
        );
        return;
      }

      const userCount = await usersRepo.countUsers();
      if (userCount === 0) {
        fail(
          res,
          unauthorized(
            isDemoMode()
              ? "Authentication required"
              : "Initial setup is required",
          ),
        );
        return;
      }

      const authContext = await getAuthorizationContext(req);
      if (authContext) {
        runWithRequestContext(authContext, () => next());
        return;
      }
      fail(res, unauthorized("Authentication required"));
    })().catch(next);
  };

  return {
    middleware,
    getAuthorizationContext,
  };
}

export function createApp() {
  getJobOpsAppConfig();

  const app = express();
  const authGuard = createAuthGuard();
  const corsMiddleware = cors();

  const handleTracerRedirect = async (
    req: express.Request,
    res: express.Response,
    slug: string,
    route: string,
  ) => {
    try {
      const redirect = await resolveTracerRedirect({
        token: slug,
        requestId:
          (res.getHeader("x-request-id") as string | undefined) ?? null,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        referrer: req.header("referer") ?? null,
      });

      if (!redirect) {
        logger.warn("Tracer link not found", {
          route,
          token: slug,
        });
        res.status(404).type("text/plain; charset=utf-8").send("Not found");
        return;
      }

      logger.info("Tracer link redirected", {
        route,
        token: slug,
        jobId: redirect.jobId,
      });
      res.set("Cache-Control", "no-store");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.redirect(302, redirect.destinationUrl);
    } catch (error) {
      logger.error("Tracer redirect failed", {
        route,
        token: slug,
        error,
      });
      res.status(500).type("text/plain; charset=utf-8").send("Internal error");
    }
  };

  app.use(corsMiddleware);
  app.use(requestContextMiddleware());
  if (getJobOpsAppConfig().appMode === "hosted") {
    app.use(
      "/api/billing/webhook",
      express.raw({ limit: "1mb", type: "application/json" }),
    );
  }
  app.use(
    "/api/design-resume/assets",
    express.raw({
      limit: "10mb",
      type: [
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/octet-stream",
      ],
    }),
  );
  // Resume file import sends base64 JSON payloads, which expand beyond the raw
  // file size. Scope the larger JSON limit to that endpoint only.
  app.use("/api/design-resume/import/file", express.json({ limit: "15mb" }));
  // Ghostwriter chat can include up to three base64 screenshot attachments, so
  // keep a larger JSON limit scoped to this endpoint to allow the maximum
  // validated payload through to route-level validation.
  app.use("/api/jobs/:id/chat", express.json({ limit: "12mb" }));
  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      logger.info("HTTP request completed", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
      });
    });
    next();
  });

  // Optional authentication for protected routes
  app.use(authGuard.middleware);

  app.get("/.well-known/ojcp.json", ojcpManifestHandler);
  app.all("/ojcp/mcp", ojcpMcpHandler);

  // API routes
  app.use("/api", apiRouter);
  app.use(notFoundApiHandler());

  app.get("/challenge-viewer/solved", (_req, res) => {
    res
      .status(200)
      .type("html")
      .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Challenge solved · Offerloop</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#4ade80;font-family:system-ui,sans-serif;text-align:center}h1{font-size:2rem;font-weight:600;margin-bottom:.5rem}p{color:#a1a1aa;font-size:1.1rem}</style></head>
<body><main><h1>Challenge solved</h1><p>This tab will close shortly. You can return to Offerloop.</p></main></body></html>`);
  });

  app.use("/challenge-viewer/session", (req, res) => {
    void proxyChallengeViewerRequest(req, res);
  });

  app.get("/cv/:slug", async (req, res) => {
    const slug = req.params.slug?.trim();
    if (!slug) {
      res.status(404).type("text/plain; charset=utf-8").send("Not found");
      return;
    }
    await handleTracerRedirect(req, res, slug, "GET /cv/:slug");
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Serve client app in production
  if (process.env.NODE_ENV === "production") {
    const packagedDocsDir = join(__dirname, "../../dist/docs");
    const workspaceDocsDir = join(__dirname, "../../../docs-site/build");
    const docsDir = existsSync(packagedDocsDir)
      ? packagedDocsDir
      : workspaceDocsDir;
    const docsIndexPath = join(docsDir, "index.html");
    let cachedDocsIndexHtml: string | null = null;

    if (!existsSync(docsIndexPath)) {
      // This fork doesn't bundle the docs site; send /docs to the online copy.
      app.get(/^\/docs(?:\/.*)?$/, (_req, res) => {
        res.redirect(302, "https://jobops.dakheera47.com/docs/");
      });
    } else {
      app.use("/docs", express.static(docsDir));
      app.get("/docs/*", async (req, res, next) => {
        if (!req.accepts("html")) {
          next();
          return;
        }
        if (extname(req.path)) {
          next();
          return;
        }
        if (!cachedDocsIndexHtml) {
          cachedDocsIndexHtml = await readFile(docsIndexPath, "utf-8");
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(cachedDocsIndexHtml);
      });
    }

    const clientDir = join(__dirname, "../../dist/client");
    const indexPath = join(clientDir, "index.html");
    let cachedIndexHtml: string | null = null;
    const serveClientHtml = async (
      req: express.Request,
      res: express.Response,
    ) => {
      if (!req.accepts("html")) {
        res.status(404).end();
        return;
      }
      if (!cachedIndexHtml) {
        cachedIndexHtml = await readFile(indexPath, "utf-8");
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(cachedIndexHtml);
    };

    // Entry HTML must be rewritten before static middleware can serve it.
    app.get(["/", "/index.html"], serveClientHtml);
    app.use(express.static(clientDir, { index: false }));
    app.get("*", serveClientHtml);
  }

  app.use(apiErrorHandler);

  return app;
}
