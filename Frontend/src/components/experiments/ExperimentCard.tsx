import {
  Beaker,
  Calendar,
  Copy,
  Database,
  FolderOpen,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExperimentCardProps {
  experiment: {
    id: string;
    name: string;
    datasetName?: string;
    status: "in_progress" | "completed";
    updatedAt: string;
    config?: {
      taskType?: string;
    };
  };
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

const ExperimentCard = ({ experiment, onDelete, onDuplicate }: ExperimentCardProps) => {
  const navigate = useNavigate();

  const formattedDate = new Date(experiment.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/45 p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/60 hover:shadow-xl hover:shadow-primary/5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-primary/5 blur-3xl transition group-hover:bg-primary/10" />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
          <div className="gradient-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-lg shadow-primary/10 sm:h-12 sm:w-12">
            <Beaker className="h-5 w-5 text-background sm:h-6 sm:w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-2">
              <h2 className="min-w-0 flex-1 truncate text-lg font-semibold sm:text-xl">{experiment.name}</h2>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  experiment.status === "completed"
                    ? "border-success/25 bg-success/10 text-success"
                    : "border-warning/25 bg-warning/10 text-warning"
                }`}
              >
                {experiment.status === "completed" ? "Completed" : "In progress"}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:text-sm">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formattedDate}
              </span>
              {experiment.datasetName && (
                <span className="flex max-w-full items-center gap-1.5 truncate">
                  <Database className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{experiment.datasetName}</span>
                </span>
              )}
              {experiment.config?.taskType && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium capitalize text-primary">
                  {experiment.config.taskType}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="relative flex shrink-0 items-center gap-2 sm:ml-3">
          <Button
            variant="outline"
            onClick={() => navigate(`/playground/${experiment.id}`)}
            className="h-10 flex-1 gap-2 rounded-xl border-border/70 bg-background/35 sm:flex-none"
          >
            <FolderOpen className="h-4 w-4" />
            Open workspace
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={`More actions for ${experiment.name}`}
                className="h-10 w-10 rounded-xl border-border/70 bg-background/35"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onDuplicate(experiment.id)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(experiment.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
};

export default ExperimentCard;
