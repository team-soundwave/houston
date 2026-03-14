import { Outlet, Link, useLocation } from "react-router-dom";
import { Monitor, LayoutDashboard, Server, Database, Bell, SlidersHorizontal, LogOut } from "lucide-react";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { useTelemetry } from "../contexts/TelemetryContext";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";

export default function Layout() {
  const location = useLocation();
  const { socketConnected, devices } = useTelemetry();
  const { user, logout } = useAuth();
  const onlineDevices = devices.filter((device) => device.connected).length;

  const navItems = [
    { name: "Overview", path: "/", icon: LayoutDashboard },
    { name: "Devices", path: "/devices", icon: Server },
    { name: "Captures", path: "/captures", icon: Database },
    { name: "Events", path: "/events", icon: Bell },
    { name: "Settings", path: "/settings", icon: SlidersHorizontal },
  ];

  return (
    <div className="flex h-screen bg-background font-sans antialiased text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/30 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-6 border-b">
          <span className="font-bold text-sm tracking-tight">System Dashboard</span>
        </div>
        
        <ScrollArea className="flex-1 py-4">
          <nav className="px-3 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Button 
                  key={item.path}
                  variant={isActive ? "secondary" : "ghost"} 
                  className={cn(
                    "w-full justify-start gap-3 h-9 px-3 text-sm font-medium",
                    !isActive && "text-muted-foreground hover:text-foreground"
                  )}
                  asChild
                >
                  <Link to={item.path}>
                    <item.icon className="w-4 h-4 opacity-70" /> 
                    {item.name}
                  </Link>
                </Button>
              );
            })}
          </nav>
          
          <div className="mt-8 px-6">
            <h4 className="mb-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Status</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Ground Link</span>
                <span className={cn("font-medium", socketConnected ? "text-emerald-600" : "text-destructive")}>
                  {socketConnected ? "Online" : "Offline"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Active Nodes</span>
                <span className="font-medium">{onlineDevices}</span>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
              <span className="text-[10px] font-bold text-primary">{user?.username.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold truncate">{user?.username}</span>
              <span className="text-[10px] text-muted-foreground truncate uppercase font-bold tracking-tight">{user?.role}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={logout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <header className="h-14 border-b flex items-center justify-between px-8 shrink-0">
          <h2 className="text-sm font-semibold text-foreground/90">
            {navItems.find(i => i.path === location.pathname)?.name || "Page"}
          </h2>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-6 h-full w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
