import { Link, useLocation, useNavigate } from "react-router-dom";
import { Activity, Download, Menu, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/contexts/SessionContext";
import { workspaceExportAPI } from "@/services/workspaceService";

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, restartSession } = useSession();

  const clearSession = async () => {
    if (!window.confirm("Clear this temporary session? Download anything you need first.")) return;
    try {
      await restartSession();
      toast.success("Fresh temporary workspace ready");
      navigate("/workspace");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't restart the workspace");
    }
  };

  const downloadSession = async () => {
    try {
      await workspaceExportAPI.downloadSession();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nothing is ready to download yet");
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="group flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 shadow-[0_0_28px_hsl(var(--primary)/0.12)]">
            <Activity className="h-5 w-5 text-primary transition-transform duration-300 group-hover:scale-110" />
          </div>
          <div className="min-w-0 leading-none">
            <div className="truncate text-lg font-bold tracking-tight sm:text-xl">NoCode<span className="text-primary">ML</span></div>
            <div className="mt-1 hidden text-[9px] font-medium uppercase tracking-[0.26em] text-muted-foreground sm:block">Temporary AutoML Studio</div>
          </div>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 rounded-xl border border-border/60 bg-card/45 p-1 md:flex">
          <Link to="/" className={`rounded-lg px-3 py-2 text-sm transition-all ${location.pathname === "/" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>Home</Link>
          <Link to="/workspace" className={`rounded-lg px-3 py-2 text-sm transition-all ${location.pathname.startsWith("/workspace") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>Workspace</Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 lg:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">{status === "active" ? "Temporary session active" : "Preparing session"}</span>
          </div>

          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" onClick={() => void downloadSession()} disabled={status !== "active"}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" onClick={() => void clearSession()} disabled={status !== "active"}>
            <RefreshCw className="mr-2 h-4 w-4" /> Clear
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-xl border-border/70 bg-card/50 sm:hidden" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Temporary workspace</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/">Home</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/workspace">Workspace</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void downloadSession()}><Download className="mr-2 h-4 w-4" /> Download session</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void clearSession()}><RefreshCw className="mr-2 h-4 w-4" /> Clear & restart</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Header;
