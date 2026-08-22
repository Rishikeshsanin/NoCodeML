import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Database,
  Gauge,
  GitCompareArrows,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

const Home = () => {
  const features = [
    {
      icon: Upload,
      title: 'Bring your dataset',
      description: 'Upload CSV, Excel or Parquet data and get structured metadata, previews and validation.',
    },
    {
      icon: BarChart3,
      title: 'Understand it first',
      description: 'Explore distributions, missing values, outliers, correlations and feature behaviour before training.',
    },
    {
      icon: WandSparkles,
      title: 'Configure without code',
      description: 'Choose targets, features, preprocessing and model presets through a guided experiment workflow.',
    },
    {
      icon: BrainCircuit,
      title: 'Train real ML models',
      description: 'Run classification and regression experiments with scikit-learn, XGBoost and LightGBM.',
    },
    {
      icon: GitCompareArrows,
      title: 'Compare what matters',
      description: 'Review metrics, feature importance and model performance instead of trusting a single score.',
    },
    {
      icon: Bot,
      title: 'Ask the experiment',
      description: 'Use the grounded Data Science Assistant to interpret the current dataset, configuration and results.',
    },
  ];

  const workflow = ['Upload', 'Explore', 'Configure', 'Train', 'Compare', 'Predict'];

  return (
    <main className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_15%,hsl(var(--primary)/0.11),transparent_30%),radial-gradient(circle_at_85%_10%,hsl(var(--primary-purple)/0.12),transparent_28%),radial-gradient(circle_at_55%_72%,hsl(var(--primary-blue)/0.08),transparent_35%)]" />

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:py-24">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary shadow-[0_0_30px_hsl(var(--primary)/0.08)]">
            <Sparkles className="h-3.5 w-3.5" />
            No-code experimentation. Real machine learning.
          </div>

          <div className="space-y-5">
            <h1 className="max-w-4xl text-4xl font-black tracking-[-0.04em] sm:text-5xl md:text-6xl lg:text-7xl">
              Turn raw data into a model you can <span className="gradient-text">understand.</span>
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              NoCodeML is a guided AutoML workspace for exploring datasets, training multiple models, comparing results and making predictions—without hiding the reasoning behind the workflow.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-xl px-6 font-semibold shadow-[0_0_30px_hsl(var(--primary)/0.18)]">
              <Link to="/experiments">
                Open experiments <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-border/80 bg-card/40 px-6">
              <Link to="/datasets">Manage datasets</Link>
            </Button>
          </div>

          <div className="grid max-w-2xl grid-cols-3 gap-3 pt-2">
            {[
              ['8', 'ML models'],
              ['6', 'workflow stages'],
              ['1', 'guided workspace'],
            ].map(([value, label]) => (
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
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary">Experiment flow</p>
                <h2 className="mt-1 text-xl font-semibold sm:text-2xl">From file to prediction</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                <Gauge className="h-5 w-5 text-primary" />
              </div>
            </div>

            <div className="space-y-2.5">
              {workflow.map((step, index) => (
                <div key={step} className="group flex items-center gap-3 rounded-2xl border border-border/55 bg-background/45 p-3.5 transition-all hover:border-primary/30 hover:bg-primary/[0.04]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{step}</div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        'Ingest and validate your data',
                        'See quality, distributions and relationships',
                        'Select targets, features and models',
                        'Run asynchronous model training',
                        'Inspect metrics and model behaviour',
                        'Use the selected model on new data',
                      ][index]}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/55 bg-card/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mb-10 max-w-2xl">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.22em] text-primary">What is inside</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A real ML workflow, not a demo form.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Every stage is connected to the same experiment so the platform can carry context from exploration through training, comparison and prediction.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="group rounded-3xl border border-border/60 bg-background/40 p-5 backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_18px_55px_hsl(var(--primary)/0.08)] sm:p-6">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card/70 to-primary-purple/[0.08] p-6 sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute right-0 top-0 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-background/50">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Start with the data you already have.</h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                Upload a dataset, inspect it before training, then build an experiment you can explain—not just an accuracy number you cannot defend.
              </p>
            </div>
            <Button asChild size="lg" className="h-12 shrink-0 rounded-xl px-6">
              <Link to="/datasets">
                Upload a dataset <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Home;
