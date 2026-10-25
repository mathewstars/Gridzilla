// Read-only live mode (captain: show dad's real Blatnica plant, which only talks to the live server).
//   ?api=<base url>  every GET to /api/... goes to <base>/api/... instead of this page's own origin.
//   ?api=proxy       GETs stay on /api/..., which the Vite dev server proxies to $GZ_API (vite.config.ts), so a live
//                    server needs no cross-origin headers: GZ_API=https://gridzilla.victronlab.sk npm run pitch:dev
// In either mode every non-GET to /api/... is refused here, in the page, before it leaves the browser: the reply is a
// 403 with detail "read-only, live server", so any button that shows its error says exactly that. Without ?api the
// deck reads and writes its own origin, as before (the default Vite proxy to the local platform).
// A base on another origin must allow cross-origin reads (the platform sends no CORS headers today), so for a live
// server use ?api=proxy with GZ_API, or open the deck the live server itself serves.
const raw = new URLSearchParams(location.search).get("api");

export const READ_ONLY = raw ? { base: raw === "proxy" ? "" : raw.replace(/\/+$/, "") } : null;

if (READ_ONLY) {
  const plain = window.fetch.bind(window);
  const refuse = () =>
    new Response(JSON.stringify({ detail: "read-only, live server" }), { status: 403, headers: { "Content-Type": "application/json" } });
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const local = url.startsWith("/api/");
    if (!local && !(READ_ONLY.base && url.startsWith(`${READ_ONLY.base}/api/`))) return plain(input, init);
    if (method !== "GET" && method !== "HEAD") return Promise.resolve(refuse());
    return plain(local ? `${READ_ONLY.base}${url}` : url, init);
  };
  (window as unknown as { __gzReadOnly?: unknown }).__gzReadOnly = { base: READ_ONLY.base || "proxy", note: "read-only, live server" };
}
