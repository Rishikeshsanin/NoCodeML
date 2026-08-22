import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { workspaceDatasetAPI } from "@/services/workspaceService";

interface DatasetRenameModalProps {
  dataset: { id: string; name: string; description?: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenameSuccess: () => void;
}

const DatasetRenameModal = ({ dataset, open, onOpenChange, onRenameSuccess }: DatasetRenameModalProps) => {
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setNewName(dataset?.name || "");
  }, [open, dataset]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim() || !dataset) {
      toast.error("Please enter a valid name");
      return;
    }

    setSubmitting(true);
    try {
      await workspaceDatasetAPI.update(dataset.id, {
        name: newName.trim(),
        description: dataset.description ?? null,
      });
      toast.success("Dataset renamed");
      onRenameSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to rename dataset");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename dataset</DialogTitle>
            <DialogDescription>
              This only changes the display name inside your temporary session.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label htmlFor="newName">Dataset name</Label>
            <Input
              id="newName"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={dataset?.name}
              disabled={submitting}
              maxLength={200}
              className="mt-2"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !newName.trim() || newName.trim() === dataset?.name}>
              {submitting ? "Renaming…" : "Save name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DatasetRenameModal;
