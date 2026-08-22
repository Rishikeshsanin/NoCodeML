import { useEffect, useMemo, useState } from "react";
import {
  Columns3,
  Database,
  Edit2,
  Eye,
  HardDrive,
  Plus,
  Rows3,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import DatasetPreviewModal from "@/components/datasets/DatasetPreviewModal";
import DatasetRenameModal from "@/components/datasets/DatasetRenameModal";
import DatasetUploadModal from "@/components/datasets/DatasetUploadModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { datasetAPI } from "@/services/apiService";

const formatDataset = (dataset: any) => ({
  ...dataset,
  rows: dataset.row_count,
  columns: dataset.column_count,
  size: dataset.file_size_bytes
    ? `${(dataset.file_size_bytes / (1024 * 1024)).toFixed(2)} MB`
    : "N/A",
  uploaded: dataset.created_at
    ? new Date(dataset.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "N/A",
});

const DatasetSkeleton = () => (
  <div className="rounded-3xl border border-border/60 bg-card/45 p-5 backdrop-blur-xl sm:p-6">
    <div className="flex animate-pulse items-start gap-3">
      <div className="h-11 w-11 rounded-2xl bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-5 w-2/3 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
      </div>
    </div>
    <div className="mt-5 grid grid-cols-3 gap-2">
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-2xl bg-muted/70" />
      ))}
    </div>
    <div className="mt-5 h-10 animate-pulse rounded-xl bg-muted" />
  </div>
);

const Datasets = () => {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [deleteError, setDeleteError] = useState<{
    message: string;
    dependencies: any[];
  } | null>(null);

  const loadDatasets = async () => {
    setLoading(true);
    try {
      const response = await datasetAPI.list();
      setDatasets((response || []).map(formatDataset));
    } catch (error: any) {
      toast.error(error.message || "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDatasets();
  }, []);

  const filteredDatasets = useMemo(
    () =>
      datasets.filter((dataset) =>
        dataset.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      ),
    [datasets, searchQuery],
  );

  const handleDelete = async () => {
    if (!selectedDataset) return;

    try {
      await datasetAPI.delete(selectedDataset.id);
      toast.success("Dataset deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedDataset(null);
      setDeleteError(null);
      await loadDatasets();
    } catch (error: any) {
      if (error.statusCode === 409 && error.dependencies) {
        setDeleteError({
          message: error.message,
          dependencies: error.dependencies,
        });
        return;
      }
      toast.error(error.message || "Failed to delete dataset");
      setDeleteDialogOpen(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] py-5 sm:py-8">
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
        <section className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-card/45 p-5 backdrop-blur-xl sm:p-7">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-primary-purple/10 blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                <Database className="h-3.5 w-3.5" />
                Data workspace
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Your <span className="gradient-text">datasets</span>
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Upload, inspect and manage the data that powers your machine-learning experiments.
              </p>
            </div>

            <Button
              onClick={() => setUploadModalOpen(true)}
              className="gradient-primary h-11 w-full gap-2 rounded-xl px-5 font-semibold text-background shadow-lg shadow-primary/10 sm:w-auto"
            >
              <UploadCloud className="h-4 w-4" />
              Upload dataset
            </Button>
          </div>

          <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search datasets"
                placeholder="Search datasets…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-11 rounded-xl border-border/70 bg-background/55 pl-10 backdrop-blur"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {loading ? "Loading datasets…" : `${filteredDatasets.length} of ${datasets.length} dataset${datasets.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <DatasetSkeleton key={item} />
            ))}
          </div>
        ) : filteredDatasets.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-border/70 bg-card/30 px-5 py-14 text-center backdrop-blur-xl sm:px-8 sm:py-20">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Database className="h-7 w-7 text-primary" />
            </div>
            <h2 className="mt-5 text-xl font-semibold">
              {searchQuery ? "No matching datasets" : "Your data lab is ready"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {searchQuery
                ? "Try a different search term or clear the filter."
                : "Upload a CSV, Excel or Parquet file and NoCodeML will profile it before you build an experiment."}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => setUploadModalOpen(true)}
                className="gradient-primary mt-6 gap-2 rounded-xl text-background"
              >
                <Plus className="h-4 w-4" />
                Upload your first dataset
              </Button>
            )}
          </section>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredDatasets.map((dataset) => (
              <article
                key={dataset.id}
                className="group rounded-3xl border border-border/60 bg-card/45 p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/60 hover:shadow-xl hover:shadow-primary/5 sm:p-6"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 transition group-hover:bg-primary/15">
                    <Database className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold sm:text-lg">{dataset.name}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Uploaded {dataset.uploaded}</p>
                  </div>
                </div>

                {dataset.description && (
                  <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {dataset.description}
                  </p>
                )}

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    { icon: Rows3, label: "Rows", value: dataset.rows?.toLocaleString() ?? "—" },
                    { icon: Columns3, label: "Columns", value: dataset.columns ?? "—" },
                    { icon: HardDrive, label: "Size", value: dataset.size },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="rounded-2xl border border-border/50 bg-background/35 p-2.5 text-center sm:p-3">
                      <Icon className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                      <div className="mt-1.5 truncate text-sm font-semibold">{value}</div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 flex-1 rounded-xl border-border/70 bg-background/30"
                    onClick={() => {
                      setSelectedDataset(dataset);
                      setPreviewModalOpen(true);
                    }}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                  </Button>
                  <Button
                    aria-label={`Rename ${dataset.name}`}
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl border-border/70 bg-background/30"
                    onClick={() => {
                      setSelectedDataset(dataset);
                      setRenameModalOpen(true);
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label={`Delete ${dataset.name}`}
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl border-border/70 bg-background/30 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      setSelectedDataset(dataset);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <DatasetUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUploadSuccess={loadDatasets}
      />

      <DatasetPreviewModal
        datasetId={selectedDataset?.id}
        datasetName={selectedDataset?.name || ""}
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
      />

      <DatasetRenameModal
        dataset={selectedDataset}
        open={renameModalOpen}
        onOpenChange={setRenameModalOpen}
        onRenameSuccess={loadDatasets}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteError(null);
        }}
      >
        <AlertDialogContent className="max-w-lg rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dataset</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {deleteError ? (
                  <div className="space-y-3">
                    <p className="font-medium text-destructive">{deleteError.message}</p>
                    <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
                      <p className="mb-2 text-sm font-medium text-foreground">Dependent experiments</p>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {deleteError.dependencies.map((dependency: any) => (
                          <li key={dependency.id}>• {dependency.name}</li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Delete or reassign those experiments before removing this dataset.
                    </p>
                  </div>
                ) : (
                  <p>
                    Are you sure you want to delete <strong className="text-foreground">{selectedDataset?.name}</strong>? This action cannot be undone.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteError(null)}>
              {deleteError ? "Close" : "Cancel"}
            </AlertDialogCancel>
            {!deleteError && (
              <AlertDialogAction
                onClick={() => void handleDelete()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete dataset
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default Datasets;
