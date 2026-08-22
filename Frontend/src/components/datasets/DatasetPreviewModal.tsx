import { useEffect, useState } from "react";
import { Database, Eye, Rows3 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { workspaceDatasetAPI, type WorkspaceDatasetPreview } from "@/services/workspaceService";

interface DatasetPreviewModalProps {
  datasetId: string | null;
  datasetName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DatasetPreviewModal = ({ datasetId, datasetName, open, onOpenChange }: DatasetPreviewModalProps) => {
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<WorkspaceDatasetPreview | null>(null);

  useEffect(() => {
    if (!open) {
      setPreviewData(null);
      return;
    }
    if (!datasetId) return;

    let cancelled = false;
    setLoading(true);
    workspaceDatasetAPI
      .preview(datasetId, 50)
      .then((preview) => {
        if (!cancelled) setPreviewData(preview);
      })
      .catch((error: any) => {
        if (!cancelled) toast.error(error.message || "Failed to load dataset preview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, datasetId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{datasetName}</DialogTitle>
          <DialogDescription>
            Temporary dataset preview. Only the first 50 rows are loaded into this view.
          </DialogDescription>
        </DialogHeader>

        {loading && !previewData ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full" />)}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : previewData ? (
          <div className="flex-1 space-y-5 overflow-auto pb-1">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { icon: Rows3, label: "Total rows", value: previewData.row_count.toLocaleString() },
                { icon: Database, label: "Columns", value: previewData.columns.length.toLocaleString() },
                { icon: Eye, label: "Preview rows", value: previewData.preview_rows.toLocaleString() },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-2xl border border-border/60 bg-card/50 p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </div>
                  <p className="mt-1 text-xl font-semibold sm:text-2xl">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold">Data preview</h3>
                <p className="text-xs text-muted-foreground">Showing {previewData.preview_rows} of {previewData.row_count.toLocaleString()}</p>
              </div>
              <div className="max-h-[50vh] overflow-auto rounded-xl border border-border">
                <table className="w-full min-w-max text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <tr>
                      {previewData.columns.map((column) => (
                        <th key={column} className="whitespace-nowrap border-b border-border px-4 py-3 text-left font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.data.map((row, rowIndex) => (
                      <tr key={rowIndex} className="transition-colors hover:bg-muted/20">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="max-w-[280px] truncate whitespace-nowrap border-b border-border px-4 py-3">
                            {cell !== null && cell !== undefined && cell !== "" ? String(cell) : (
                              <span className="italic text-muted-foreground">null</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">No preview is available for this dataset.</div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DatasetPreviewModal;
