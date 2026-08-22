import { useState } from "react";
import { ArrowRight, BrainCircuit, Database, Layers3, Loader2, Sparkles } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || "/";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      // AuthContext surfaces the API error.
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6 lg:flex lg:items-center lg:py-12">
      <div className="pointer-events-none absolute left-[-12rem] top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-primary/10 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-[-14rem] right-[-10rem] h-[36rem] w-[36rem] rounded-full bg-primary-purple/10 blur-[120px]" />

      <div className="relative mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border/60 bg-card/35 shadow-2xl shadow-black/20 backdrop-blur-xl lg:min-h-[690px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r border-border/60 p-10 lg:flex lg:flex-col lg:justify-between xl:p-12">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary-purple/10" />
          <div className="relative">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="gradient-primary flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg shadow-primary/20">
                <BrainCircuit className="h-6 w-6 text-background" />
              </div>
              <span className="text-xl font-bold tracking-tight">NoCodeML</span>
            </Link>

            <div className="mt-20 max-w-lg">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                ML workspace, rebuilt for V3
              </div>
              <h1 className="text-5xl font-bold leading-[1.05] tracking-tight xl:text-6xl">
                Turn raw data into <span className="gradient-text">decisions.</span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
                Explore a dataset, configure an experiment, train multiple models and understand the result without leaving one guided workspace.
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-2 gap-3">
            {[
              { icon: Database, title: "Data-first", text: "Profile and inspect before training" },
              { icon: Layers3, title: "Run history", text: "Compare experiments without losing context" },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-border/60 bg-background/30 p-4">
                <Icon className="h-4 w-4 text-primary" />
                <div className="mt-3 text-sm font-semibold">{title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-4 sm:p-8 lg:p-10 xl:p-12">
          <div className="w-full max-w-md">
            <div className="mb-7 text-center lg:hidden">
              <div className="gradient-primary mx-auto flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg shadow-primary/20">
                <BrainCircuit className="h-7 w-7 text-background" />
              </div>
              <h1 className="gradient-text mt-3 text-3xl font-bold">NoCodeML</h1>
              <p className="mt-1 text-sm text-muted-foreground">Your guided machine-learning workspace</p>
            </div>

            <Card className="rounded-3xl border-border/60 bg-background/45 shadow-xl backdrop-blur-xl">
              <CardHeader className="space-y-2 p-5 pb-3 sm:p-7 sm:pb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Welcome back</div>
                <CardTitle className="text-2xl sm:text-3xl">Sign in to your workspace</CardTitle>
                <CardDescription>Continue your datasets, experiments and model runs.</CardDescription>
              </CardHeader>

              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-5 p-5 sm:p-7 sm:pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 rounded-xl border-border/70 bg-background/70"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 rounded-xl border-border/70 bg-background/70"
                    />
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-4 p-5 pt-1 sm:p-7 sm:pt-1">
                  <Button
                    type="submit"
                    className="gradient-primary h-11 w-full gap-2 rounded-xl font-semibold text-background shadow-lg shadow-primary/10"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in…
                      </>
                    ) : (
                      <>
                        Sign in
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    New to NoCodeML?{" "}
                    <Link to="/register" className="font-medium text-primary hover:underline">
                      Create an account
                    </Link>
                  </p>
                </CardFooter>
              </form>
            </Card>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
              Your experiments and datasets stay scoped to your authenticated NoCodeML account.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Login;
