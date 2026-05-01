import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/api/audits(.*)",
  "/api/admin(.*)",
  "/api/stripe/checkout(.*)",
]);

// Endpoints that authenticate themselves (bearer token, public spec) and must
// bypass the Clerk session check so the AI uploader and reference agents can
// reach them without a browser session.
const isPublicAdminApi = createRouteMatcher([
  "/api/admin/audits/spec",
  "/api/admin/audits/(.*)/upload",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicAdminApi(req)) {
    return;
  }
  if (isProtectedRoute(req)) {
    const origin = req.nextUrl.origin;
    await auth.protect({ unauthenticatedUrl: `${origin}/sign-in` });
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
