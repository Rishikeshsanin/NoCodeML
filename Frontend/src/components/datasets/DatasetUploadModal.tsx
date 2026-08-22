import { useCallback, useState } from "react";
import { FileUp, ShieldCheck, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { workspaceDatasetAPI } from "@/services/workspaceService";

interface DatasetUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess: () => void;
}

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".parquet"];

const DatasetUploadModal = ({ open, onOpenChange, onUploadSuccess }: DatasetUploadModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const validateFile = (selectedFile: File): string | null => {
    const maxSize = 100 * 1024 * 1024;
    const lowerName = selectedFile.name.toLowerCase();

    if (!ALLOWED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      return "Use a CSV, Excel or Parquet dataset.";
    }
    if (selectedFile.size > maxSize) return "File size must be 100 MB or less.";
    if (selectedFile.size === 0) return "This file is empty.";
    return null;
  };

  const handleFileSelect = (selectedFile: File) => {
    const error = validateFile(selectedFile);
    if (error) {
      toast.error(error);
      return;
    }
    setFile(selectedFile);
  };

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fileName = file.name.replace(/\.[^/.]+$/, "");
      await workspaceDatasetAPI.upload(file, fileName);
      toast.success("Dataset added to your temporary workspace");
      setFile(null);
      onUploadSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to upload dataset");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setFile(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Upload a dataset</DialogTitle>
          <DialogDescription>
            CSV, Excel and Parquet files are supported up to 100 MB.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>Your upload stays in this temporary NoCodeML session and is removed when the session is cleared or expires.</p>
          </div>
        </div>

        <div className="space-y-4 py-3">
          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                isDragging
                  ? "scale-[1.01] border-primary bg-primary/10"
                  : "border-border hover:border-primary/50 hover:bg-card/50"
              }`}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="mb-1 text-lg font-semibold">Drop your dataset here</p>
                  <p className="mb-4 text-sm text-muted-foreground">or choose a file from your device</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("dataset-file-input")?.click()}
                    disabled={uploading}
                  >
                    <FileUp className="mr-2 h-4 w-4" />
                    Choose file
                  </Button>
                  <input
                    id="dataset-file-input"
                    type="file"
                    accept=".csv,.xlsx,.xls,.parquet"
                    onChange={(event) => {
                      const selectedFile = event.target.files?.[0];
                      if (selectedFile) handleFileSelect(selectedFile);
                      event.currentTarget.value = "";
                    }}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                    <FileUp className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>
                {!uploading && (
                  <Button variant="ghost" size="sm" onClick={() => setFile(null)} aria-label="Remove selected file">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!file || uploading} className="gradient-primary text-background">
            {uploading ? "Uploading…" : "Upload dataset"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DatasetUploadModal;
