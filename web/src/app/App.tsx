import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { toast, Toaster } from "sonner";

import { ApiError } from "@/lib/api/client";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider, useTheme } from "@/lib/theme";

import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
  queryCache: new QueryCache({
    onError: (err, query) => {
      // Background refetch failures shouldn't be silent when data is already on screen.
      if (query.state.data !== undefined && err instanceof ApiError && err.status !== 401) {
        toast.error("Couldn't refresh", { description: err.friendly });
      }
    },
  }),
});

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="top-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border-line !bg-surface !text-ink !shadow-lift !font-sans",
          description: "!text-ink-muted",
          actionButton: "!bg-primary !text-primary-fg !rounded-full",
        },
      }}
    />
  );
}

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
          <ThemedToaster />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
