import { useState, useMemo } from "react";
import { Terminal, Search, Play, Pause, Activity } from "lucide-react";
import { Card, CardHeader, CardTitle } from "../components/ui/card";
import { ScrollArea } from "../components/ui/scroll-area";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useTelemetry } from "../contexts/TelemetryContext";
import { cn } from "../lib/utils";

function EventRow({ event }: { event: any }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-b last:border-0 border-border/40">
      <div 
        className={cn(
          "flex items-start gap-4 p-3 cursor-pointer hover:bg-muted/30 transition-colors group",
          isExpanded && "bg-muted/20"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold font-mono text-muted-foreground/60 w-20 shrink-0">
              {new Date(event.emitted_at).toLocaleTimeString([], { hour12: false })}
            </span>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-mono uppercase bg-muted/50 border-border/50">
              {event.topic}
            </Badge>
            <div className="flex-1 truncate text-xs font-medium text-foreground/80">
              {typeof (event.data || event.payload) === 'string' 
                ? (event.data || event.payload) 
                : JSON.stringify(event.data || event.payload)
              }
            </div>
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="ml-24 p-4 rounded-lg bg-slate-950 border border-white/5 font-mono text-[11px] text-emerald-500/90 overflow-auto max-h-96 shadow-inner leading-relaxed">
            <pre>{JSON.stringify(event.data || event.payload, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Events() {
  const { events } = useTelemetry();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedEvents, setPausedEvents] = useState(events);

  useMemo(() => {
    if (!isPaused) {
      setPausedEvents(events);
    }
  }, [events, isPaused]);

  const topics = useMemo(() => {
    const ts = new Set(events.map(e => e.topic));
    return Array.from(ts);
  }, [events]);

  const filteredEvents = useMemo(() => {
    return pausedEvents.filter(e => {
      const matchesTopic = activeTopic ? e.topic === activeTopic : true;
      const searchString = searchTerm.toLowerCase();
      const payloadString = JSON.stringify(e.data || e.payload).toLowerCase();
      const matchesSearch = 
        e.topic.toLowerCase().includes(searchString) || 
        payloadString.includes(searchString);
      return matchesTopic && matchesSearch;
    });
  }, [pausedEvents, activeTopic, searchTerm]);

  return (
    <div className="flex flex-col h-full gap-6 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Events</h1>
          <p className="text-sm text-muted-foreground">Real-time log of ground-to-edge transmissions and sensor heartbeats.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground/50" />
            <Input 
              placeholder="Search payloads..." 
              className="pl-9 h-9 text-xs shadow-none border-border/60" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button 
            variant={isPaused ? "secondary" : "outline"}
            size="sm"
            className="h-9 px-4 gap-2 text-xs font-medium"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isPaused ? "Resume" : "Pause"}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex gap-1.5 shrink-0 overflow-x-auto pb-4 scrollbar-none">
          <Button
            variant={activeTopic === null ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTopic(null)}
            className="h-7 px-3 text-[10px] font-bold uppercase tracking-widest"
          >
            All Logs
          </Button>
          {topics.map(t => (
            <Button
              key={t}
              variant={activeTopic === t ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTopic(t)}
              className="h-7 px-3 text-[10px] font-bold uppercase tracking-widest"
            >
              {t}
            </Button>
          ))}
        </div>

        <Card className="flex-1 min-h-0 flex flex-col shadow-none border-border/60 overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 shrink-0">
            <div className="flex items-center gap-8">
              <span className="w-20">Timestamp</span>
              <span>Topic / Payload Summary</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3" /> {filteredEvents.length} Items
            </div>
          </div>
          <ScrollArea className="flex-1 divide-y">
            <div className="flex flex-col">
              {filteredEvents.map((event, i) => (
                <EventRow key={i} event={event} />
              ))}
              {filteredEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center py-32 text-muted-foreground/40 gap-4">
                  <Terminal className="h-8 w-8 opacity-20" />
                  <p className="text-sm font-medium italic">Empty log buffer</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
