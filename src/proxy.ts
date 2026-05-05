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
  if (!isProtectedRoute(req)) {
    return;
  }
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const { userId } = await auth();
  if (!userId) {
    if (isApi) {
      // Returning a JSON 401 instead of a 307 redirect prevents fetch() callers
      // (e.g. the admin upload form sending a PATCH with a body) from following
      // the redirect to /sign-in and trying to parse the resulting HTML.
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    const origin = req.nextUrl.origin;
    return Response.redirect(`${origin}/sign-in`, 307);
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
