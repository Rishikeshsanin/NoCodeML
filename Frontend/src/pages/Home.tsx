import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Download,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const Home = () => {
  const workflow = [
    ["Upload", "Bring a CSV, Excel or Parquet dataset."],
    ["Explore", "Inspect quality, missing values, distributions and correlations."],
    ["Configure", "Pick a target or use NoCodeML's task and model suggestions."],
    ["Train", "Compare real classification or regression models."],
    ["Predict", "Run single or batch predictions with the fitted pipeline."],
    ["Export", "Download charts, metrics, predictions, models or the complete session."],
  ];

  return (
    <main className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_15%,hsl(var(--primary)/0.11),transparent_30%),radial-gradient(circle_at_85%_10%,hsl(var(--primary-purple)/0.12),transparent_28%),radial-gradient(circle_at_55%_72%,hsl(var(--primary-blue)/0.08),transparent_35%)]" />

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:py-24">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary shadow-[0_0_30px_hsl(var(--primary)/0.08)]">
            <ShieldCheck className="h-3.5 w-3.5" /> No signup. No permanent workspace.
          </div>

          <div className="space-y-5">
            <h1 className="max-w-4xl text-4xl font-black tracking-[-0.04em] sm:text-5xl md:text-6xl lg:text-7xl">
              Machine learning from your data, <span className="gradient-text">without the setup.</span>
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              NoCodeML is a temporary, guided AutoML workspace. Upload a dataset, understand it, train and compare models, make predictions and download the results. When the session ends, the workspace is removed.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-xl px-6 font-semibold shadow-[0_0_30px_hsl(var(--primary)/0.18)]">
              <Link to="/workspace">Start analyzing <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground sm:px-3"><Sparkles className="h-4 w-4 text-primary" /> Guest-first by design</div>
          </div>

          <div className="grid max-w-2xl grid-cols-3 gap-3 pt-2">
            {[["8", "ML models"], ["0", "accounts required"], ["1", "guided workspace"]].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-border/60 bg-card/35 p-3 backdrop-blur-xl sm:p-4">
                <div className="text-2xl font-bold text-foreground sm:text-3xl">{value}</div>
                <div className="mt-1 text-[11px] leading-4 text-muted-foreground sm:text-xs">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-8 -z-10 rounded-full bg-primary/10 blur-3xl" />
          <div className="overflow-hidden rounded-[2rem] border border-border/70 bg-card/55 p-4 shadow-2xl backdrop-blur-2xl sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><p className="text-xs font-medium uppercase tracking-[0.22em] text-primary">One clean flow</p><h2 className="mt-1 text-xl font-semibold sm:text-2xl">From file to useful output</h2></div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10"><BrainCircuit className="h-5 w-5 text-primary" /></div>
            </div>
            <div className="space-y-2.5">
              {workflow.map(([step, detail], index) => (
                <div key={step} className="group flex items-center gap-3 rounded-2xl border border-border/55 bg-background/45 p-3.5 transition-all hover:border-primary/30 hover:bg-primary/[0.04]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">{String(index + 1).padStart(2, "0")}</div>
                  <div className="min-w-0 flex-1"><div className="font-medium">{step}</div><div className="text-xs text-muted-foreground">{detail}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/20">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8 lg:py-20">
          {[
            [Upload, "Temporary uploads", "Files live only inside the active temporary workspace."],
            [BarChart3, "EDA before training", "Understand data quality and relationships before choosing a model."],
            [WandSparkles, "Smart configuration", "Get task, target, feature and model guidance while keeping control."],
            [Download, "Export your work", "Download analysis, metrics, models, predictions and a full session bundle."],
          ].map(([Icon, title, description]) => {
            const FeatureIcon = Icon as typeof Upload;
            return <article key={String(title)} className="rounded-3xl border border-border/60 bg-background/40 p-5 backdrop-blur-xl sm:p-6"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10"><FeatureIcon className="h-5 w-5 text-primary" /></div><h3 className="text-lg font-semibold">{String(title)}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{String(description)}</p></article>;
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card/70 to-primary-purple/[0.08] p-6 sm:p-10 lg:p-12">
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl"><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Bring the dataset. Leave with the results.</h2><p className="mt-4 leading-7 text-muted-foreground">No account lifecycle, no saved-project clutter and no permanent visitor database. Download what you need before the temporary session ends.</p></div>
            <Button asChild size="lg" className="h-12 shrink-0 rounded-xl px-6"><Link to="/workspace">Open NoCodeML <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Home;
