import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "./components/Header";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import { ExperimentProvider } from "./contexts/ExperimentContext";
import { ModelsProvider } from "./contexts/ModelsContext";
import { SessionProvider } from "./contexts/SessionContext";
import { TrainingProvider } from "./contexts/TrainingContext";

const Home = lazy(() => import("./pages/Home"));
const Datasets = lazy(() => import("./pages/Datasets"));
const Experiments = lazy(() => import("./pages/Experiments"));
const Playground = lazy(() => import("./pages/Playground"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
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
      Loading workspace…
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SessionProvider>
        <AuthProvider>
          <ModelsProvider>
            <ExperimentProvider>
              <TrainingProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Suspense fallback={<PageFallback />}>
                    <Routes>
                      <Route path="/login" element={<Login />} />
                      <Route path="/register" element={<Register />} />
                      <Route
                        path="/*"
                        element={
                          <ProtectedRoute>
                            <div className="min-h-screen bg-background">
                              <Header />
                              <Routes>
                                <Route path="/" element={<Home />} />
                                <Route path="/datasets" element={<Datasets />} />
                                <Route path="/experiments" element={<Experiments />} />
                                <Route path="/playground/:experimentId" element={<Playground />} />
                                <Route path="*" element={<NotFound />} />
                              </Routes>
                            </div>
                          </ProtectedRoute>
                        }
                      />
                    </Routes>
                  </Suspense>
                </BrowserRouter>
              </TrainingProvider>
            </ExperimentProvider>
          </ModelsProvider>
        </AuthProvider>
      </SessionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
