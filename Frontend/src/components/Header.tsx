import { Link, useLocation } from 'react-router-dom';
import { Activity, FlaskConical, LogOut, Menu, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';

const Header = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Datasets', path: '/datasets' },
    { name: 'Experiments', path: '/experiments' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/experiments' && location.pathname.startsWith('/playground/')) return true;
    return location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="group flex min-w-0 items-center gap-2.5">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/25 bg-primary/10 shadow-[0_0_28px_hsl(var(--primary)/0.12)]">
            <Activity className="h-5 w-5 text-primary transition-transform duration-300 group-hover:scale-110" />
          </div>
          <div className="min-w-0 leading-none">
            <div className="truncate text-lg font-bold tracking-tight sm:text-xl">NoCode<span className="text-primary">ML</span></div>
            <div className="mt-1 hidden text-[9px] font-medium uppercase tracking-[0.26em] text-muted-foreground sm:block">AutoML Studio</div>
          </div>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 rounded-xl border border-border/60 bg-card/45 p-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`rounded-lg px-3 py-2 text-sm transition-all ${
                isActive(item.path)
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
              }`}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 lg:flex">
            <FlaskConical className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">V3 revival</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild className="md:hidden">
              <Button variant="outline" size="icon" className="rounded-xl border-border/70 bg-card/50">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 md:hidden">
              <DropdownMenuLabel>Navigate</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {navItems.map((item) => (
                <DropdownMenuItem key={item.path} asChild>
                  <Link to={item.path} className={isActive(item.path) ? 'text-primary' : ''}>{item.name}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-xl border-border/70 bg-card/50">
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <div className="space-y-1">
                  <p className="text-sm font-medium">NoCodeML account</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Header;
