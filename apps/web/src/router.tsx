import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // One client per request: on the server a shared one would carry a visitor's data to the next.
  // A non-zero staleTime keeps data fetched on the server from being fetched again on hydration.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, gcTime: 30 * 60_000 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Query decides what is fresh, so a preload must not hold data of its own.
    defaultPreloadStaleTime: 0,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
