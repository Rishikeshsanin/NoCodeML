import { useEffect, useMemo, useState } from "react";
import { Beaker, Plus, Search, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import CreateExperimentModal from "@/components/experiments/CreateExperimentModal";
import ExperimentCard from "@/components/experiments/ExperimentCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExperiment } from "@/contexts/ExperimentContext";
import { experimentAPI } from "@/services/apiService";

const Experiments = () => {
  const { experiments, fetchExperiments, deleteExperiment, createExperiment } = useExperiment();
  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void fetchExperiments();
    // The provider currently recreates this callback as state changes; load once on page entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (name: string, datasetId: string) => {
    const experiment = await createExperiment(name, datasetId);
    navigate(`/playground/${experiment.id}`);
  };

  const handleDuplicate = async (id: string) => {
    try {
      await experimentAPI.duplicate(id);
      await fetchExperiments();
    } catch {
      // The API/context layer surfaces request errors to the user.
    }
  };

  const filteredExperiments = useMemo(
    () =>
      experiments.filter((experiment) =>
        experiment.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      ),
    [experiments, searchQuery],
  );

  const completedCount = experiments.filter((experiment) => experiment.status === "completed").length;
  const activeCount = experiments.length - completedCount;

  return (
    <main className="min-h-[calc(100vh-4rem)] py-5 sm:py-8">
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
        <section className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-card/45 p-5 backdrop-blur-xl sm:p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary-purple/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Experiment studio
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Build, compare and <span className="gradient-text">learn</span>
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Every run keeps its configuration and results together so you can iterate without losing context.
              </p>
            </div>

            <Button
              onClick={() => setCreateModalOpen(true)}
              className="gradient-primary h-11 w-full gap-2 rounded-xl px-5 font-semibold text-background shadow-lg shadow-primary/10 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              New experiment
            </Button>
          </div>

          <div className="relative mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search experiments"
                placeholder="Search experiments…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-11 rounded-xl border-border/70 bg-background/55 pl-10 backdrop-blur"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
              <div className="min-w-[92px] rounded-xl border border-border/60 bg-background/35 px-3 py-2 text-center">
                <div className="text-sm font-semibold">{experiments.length}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
              </div>
              <div className="min-w-[92px] rounded-xl border border-border/60 bg-background/35 px-3 py-2 text-center">
                <div className="text-sm font-semibold text-warning">{activeCount}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Active</div>
              </div>
              <div className="min-w-[92px] rounded-xl border border-border/60 bg-background/35 px-3 py-2 text-center">
                <div className="text-sm font-semibold text-success">{completedCount}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Completed</div>
              </div>
            </div>
          </div>
        </section>

        {filteredExperiments.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-border/70 bg-card/30 px-5 py-14 text-center backdrop-blur-xl sm:px-8 sm:py-20">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Beaker className="h-7 w-7 text-primary" />
            </div>
            <h2 className="mt-5 text-xl font-semibold">
              {searchQuery ? "No matching experiments" : "Start your first ML experiment"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {searchQuery
                ? "Try a different search term or clear the filter."
                : "Pick a dataset, configure the problem, train multiple models and compare the results in one guided workspace."}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => setCreateModalOpen(true)}
                className="gradient-primary mt-6 gap-2 rounded-xl text-background"
              >
                <Plus className="h-4 w-4" />
                Create experiment
              </Button>
            )}
          </section>
        ) : (
          <section className="space-y-3 sm:space-y-4">
            {filteredExperiments.map((experiment) => (
              <ExperimentCard
                key={experiment.id}
                experiment={experiment}
                onDelete={deleteExperiment}
                onDuplicate={handleDuplicate}
              />
            ))}
          </section>
        )}
      </div>

      <CreateExperimentModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onCreate={handleCreate}
      />
    </main>
  );
};

export default Experiments;
