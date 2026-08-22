import { useMemo, useState } from "react";
import { ArrowRight, BrainCircuit, Check, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

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

const Register = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { register } = useAuth();
  const navigate = useNavigate();

  const passwordChecks = useMemo(
    () => [
      { label: "8+ characters", passed: password.length >= 8 },
      { label: "Passwords match", passed: Boolean(password) && password === confirmPassword },
    ],
    [confirmPassword, password],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      await register(email, password);
      navigate("/login");
    } catch {
      // AuthContext surfaces API errors.
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6 lg:flex lg:items-center lg:py-12">
      <div className="pointer-events-none absolute left-[-14rem] bottom-[-14rem] h-[38rem] w-[38rem] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-12rem] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-primary-purple/10 blur-[110px]" />

      <div className="relative mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border/60 bg-card/35 shadow-2xl shadow-black/20 backdrop-blur-xl lg:min-h-[720px] lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex items-center justify-center p-4 sm:p-8 lg:p-10 xl:p-12">
          <div className="w-full max-w-md">
            <div className="mb-7 text-center lg:hidden">
              <div className="gradient-primary mx-auto flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg shadow-primary/20">
                <BrainCircuit className="h-7 w-7 text-background" />
              </div>
              <h1 className="gradient-text mt-3 text-3xl font-bold">NoCodeML</h1>
              <p className="mt-1 text-sm text-muted-foreground">Start building ML experiments without the boilerplate</p>
            </div>

            <Card className="rounded-3xl border-border/60 bg-background/45 shadow-xl backdrop-blur-xl">
              <CardHeader className="space-y-2 p-5 pb-3 sm:p-7 sm:pb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Create your workspace</div>
                <CardTitle className="text-2xl sm:text-3xl">Start experimenting</CardTitle>
                <CardDescription>Create an account and move from raw data to model comparison in one guided flow.</CardDescription>
              </CardHeader>

              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4 p-5 sm:p-7 sm:pt-4">
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
                      autoComplete="new-password"
                      placeholder="Create a password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 rounded-xl border-border/70 bg-background/70"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 rounded-xl border-border/70 bg-background/70"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {passwordChecks.map((check) => (
                      <span
                        key={check.label}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                          check.passed
                            ? "border-success/25 bg-success/10 text-success"
                            : "border-border/60 bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <Check className="h-3 w-3" />
                        {check.label}
                      </span>
                    ))}
                  </div>

                  {error && (
                    <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                      {error}
                    </div>
                  )}
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
                        Creating account…
                      </>
                    ) : (
                      <>
                        Create account
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link to="/login" className="font-medium text-primary hover:underline">
                      Sign in
                    </Link>
                  </p>
                </CardFooter>
              </form>
            </Card>
          </div>
        </section>

        <section className="relative hidden overflow-hidden border-l border-border/60 p-10 lg:flex lg:flex-col lg:justify-between xl:p-12">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-primary-purple/10 via-transparent to-primary/10" />
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
                Guided AutoML workspace
              </div>
              <h1 className="text-5xl font-bold leading-[1.05] tracking-tight xl:text-6xl">
                Learn by building <span className="gradient-text">real models.</span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
                Keep the important ML decisions visible: data quality, feature choices, model configuration, metrics and predictions.
              </p>
            </div>
          </div>

          <div className="relative rounded-2xl border border-border/60 bg-background/30 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/10">
                <ShieldCheck className="h-4 w-4 text-success" />
              </div>
              <div>
                <div className="text-sm font-semibold">Isolated workspace</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Your NoCodeML account, datasets and experiments stay inside the dedicated application database scope.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Register;
