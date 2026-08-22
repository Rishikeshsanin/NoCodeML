import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "./components/Header";
import { SessionProvider } from "./contexts/SessionContext";

const Home = lazy(() => import("./pages/Home"));
const Workspace = lazy(() => import("./pages/Workspace"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PageFallback = () => (
  <div className="flex min-h-[45vh] items-center justify-center" role="status" aria-live="polite">
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      Loading temporary workspace…
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SessionProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="min-h-screen bg-background">
            <Header />
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/workspace" element={<Workspace />} />
                <Route path="/datasets" element={<Navigate to="/workspace" replace />} />
                <Route path="/experiments" element={<Navigate to="/workspace" replace />} />
                <Route path="/playground/:experimentId" element={<Navigate to="/workspace" replace />} />
                <Route path="/login" element={<Navigate to="/workspace" replace />} />
                <Route path="/register" element={<Navigate to="/workspace" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </div>
        </BrowserRouter>
      </SessionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
