import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Columns3,
  Database,
  Edit2,
  Eye,
  HardDrive,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  ShieldCheck,
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
import { useSession } from "@/contexts/SessionContext";
import { workspaceDatasetAPI, type WorkspaceDataset } from "@/services/workspaceService";

const toDate = (value: number | string) => {
  if (typeof value === "number") return new Date(value < 1_000_000_000_000 ? value * 1000 : value);
  return new Date(value);
};

const formatDataset = (dataset: WorkspaceDataset) => ({
  ...dataset,
  rows: dataset.row_count,
  columns: dataset.column_count,
  size: dataset.file_size_bytes
    ? `${(dataset.file_size_bytes / (1024 * 1024)).toFixed(2)} MB`
    : "N/A",
  uploaded: dataset.created_at
    ? toDate(dataset.created_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "This session",
});

type DisplayDataset = ReturnType<typeof formatDataset>;

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
      {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-muted/70" />)}
    </div>
  </div>
);

const Datasets = () => {
  const { status: sessionStatus, token, error: sessionError, restartSession } = useSession();
  const [datasets, setDatasets] = useState<DisplayDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<DisplayDataset | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadDatasets = useCallback(async () => {
    if (sessionStatus !== "active") return;
    setLoading(true);
    try {
      const response = await workspaceDatasetAPI.list();
      setDatasets(response.map(formatDataset));
    } catch (error: any) {
      toast.error(error.message || "Failed to load your temporary datasets");
    } finally {
      setLoading(false);
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "active" && token) void loadDatasets();
    if (sessionStatus === "initializing") setLoading(true);
  }, [sessionStatus, token, loadDatasets]);

  const filteredDatasets = useMemo(
    () => datasets.filter((dataset) => dataset.name.toLowerCase().includes(searchQuery.trim().toLowerCase())),
    [datasets, searchQuery],
  );

  const handleDelete = async () => {
    if (!selectedDataset) return;
    try {
      await workspaceDatasetAPI.delete(selectedDataset.id);
      toast.success("Dataset removed from this session");
      setDeleteDialogOpen(false);
      setSelectedDataset(null);
      await loadDatasets();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete dataset");
    }
  };

  const handleClearSession = async () => {
    setClearing(true);
    try {
      await restartSession();
      setDatasets([]);
      setSelectedDataset(null);
      setSearchQuery("");
      setClearDialogOpen(false);
      toast.success("Temporary session cleared. A fresh workspace is ready.");
    } catch (error: any) {
      toast.error(error.message || "Couldn't reset the temporary session");
    } finally {
      setClearing(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] py-5 sm:py-8">
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
        <section className="relative mb-5 overflow-hidden rounded-3xl border border-border/60 bg-card/45 p-5 backdrop-blur-xl sm:p-7">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                <Database className="h-3.5 w-3.5" /> Temporary data workspace
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Bring data in. <span className="gradient-text">Take results out.</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Upload CSV, Excel or Parquet data. NoCodeML keeps it only inside this temporary browser session while you analyze, train and export.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button variant="outline" onClick={() => setClearDialogOpen(true)} className="h-11 gap-2 rounded-xl">
                <RotateCcw className="h-4 w-4" /> Clear session
              </Button>
              <Button
                onClick={() => setUploadModalOpen(true)}
                disabled={sessionStatus !== "active"}
                className="gradient-primary h-11 gap-2 rounded-xl px-5 font-semibold text-background shadow-lg shadow-primary/10"
              >
                <UploadCloud className="h-4 w-4" /> Upload dataset
              </Button>
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">No permanent dataset storage</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Dataset files in this workspace are temporary and are deleted when you clear the session or after the session expires.
              </p>
            </div>
          </div>
          <div className="flex gap-3 rounded-2xl border border-border/60 bg-card/40 p-4">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Download before you leave</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Analysis, chart, model and prediction exports are being added to the final workspace flow so you can keep what matters.
              </p>
            </div>
          </div>
        </section>

        {sessionStatus === "error" && (
          <div className="mb-5 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">Temporary workspace unavailable</p>
            <p className="mt-1 text-muted-foreground">{sessionError || "Please retry the session."}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void restartSession()}>Retry workspace</Button>
          </div>
        )}

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search temporary datasets"
              placeholder="Search this session…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-11 rounded-xl border-border/70 bg-background/55 pl-10 backdrop-blur"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {loading ? "Loading session…" : `${filteredDatasets.length} dataset${filteredDatasets.length === 1 ? "" : "s"} in this session`}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => <DatasetSkeleton key={item} />)}
          </div>
        ) : filteredDatasets.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-border/70 bg-card/30 px-5 py-14 text-center backdrop-blur-xl sm:px-8 sm:py-20">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Database className="h-7 w-7 text-primary" />
            </div>
            <h2 className="mt-5 text-xl font-semibold">{searchQuery ? "No matching datasets" : "Your temporary ML lab is ready"}</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {searchQuery
                ? "Try another search term or clear the filter."
                : "Upload a dataset to inspect it now. Nothing needs to be saved to an account or permanent project database."}
            </p>
            {!searchQuery && (
              <Button onClick={() => setUploadModalOpen(true)} disabled={sessionStatus !== "active"} className="gradient-primary mt-6 gap-2 rounded-xl text-background">
                <Plus className="h-4 w-4" /> Upload your first dataset
              </Button>
            )}
          </section>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredDatasets.map((dataset) => (
              <article key={dataset.id} className="group rounded-3xl border border-border/60 bg-card/45 p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/60 hover:shadow-xl hover:shadow-primary/5 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                    <Database className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold sm:text-lg">{dataset.name}</h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{dataset.original_filename}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Added {dataset.uploaded}</p>
                  </div>
                </div>

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
                  <Button variant="outline" size="sm" className="h-10 flex-1 rounded-xl border-border/70 bg-background/30" onClick={() => { setSelectedDataset(dataset); setPreviewModalOpen(true); }}>
                    <Eye className="mr-2 h-4 w-4" /> Preview
                  </Button>
                  <Button aria-label={`Rename ${dataset.name}`} variant="outline" size="icon" className="h-10 w-10 rounded-xl" onClick={() => { setSelectedDataset(dataset); setRenameModalOpen(true); }}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button aria-label={`Delete ${dataset.name}`} variant="outline" size="icon" className="h-10 w-10 rounded-xl hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive" onClick={() => { setSelectedDataset(dataset); setDeleteDialogOpen(true); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <DatasetUploadModal open={uploadModalOpen} onOpenChange={setUploadModalOpen} onUploadSuccess={loadDatasets} />
      <DatasetPreviewModal datasetId={selectedDataset?.id || null} datasetName={selectedDataset?.name || ""} open={previewModalOpen} onOpenChange={setPreviewModalOpen} />
      <DatasetRenameModal dataset={selectedDataset} open={renameModalOpen} onOpenChange={setRenameModalOpen} onRenameSuccess={loadDatasets} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this temporary dataset?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-foreground">{selectedDataset?.name}</strong> and its uploaded file will be removed from this session. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove dataset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the entire session?</AlertDialogTitle>
            <AlertDialogDescription>
              All temporary datasets and any temporary workspace artifacts already created in this session will be deleted. Download anything you need before clearing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Keep session</AlertDialogCancel>
            <AlertDialogAction disabled={clearing} onClick={() => void handleClearSession()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {clearing ? "Clearing…" : "Clear and start fresh"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default Datasets;
