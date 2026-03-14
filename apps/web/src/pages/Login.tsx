import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Monitor, Lock, User, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get the page they were trying to visit, or default to "/"
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsSubmitting(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      // Error is handled by context
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/30 font-sans antialiased">
      <div className="w-full max-w-md px-4 space-y-8">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="bg-primary rounded-xl p-3 shadow-lg ring-4 ring-primary/10">
            <Monitor className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Team Soundwave</h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium">Mission Control Access Portal</p>
          </div>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Authentication Required</CardTitle>
            <CardDescription>Enter your credentials to access system telemetry.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1" htmlFor="username">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="username"
                    className="pl-10 h-11"
                    placeholder="Enter operator ID" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="password">
                    Secure Key
                  </label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="password"
                    type="password" 
                    className="pl-10 h-11"
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button className="w-full h-11 text-sm font-semibold gap-2" type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Initializing Secure Link...
                  </>
                ) : (
                  "Access Dashboard"
                )}
              </Button>
              <div className="text-[10px] text-center text-muted-foreground uppercase tracking-widest font-bold opacity-50 pt-2">
                Authorized Personnel Only
              </div>
            </CardFooter>
          </form>
        </Card>

        <div className="text-center text-[10px] text-muted-foreground font-mono">
          SECURE_NODE_IDENT: {import.meta.env.VITE_NODE_ID || "GCS-ALPHA-01"}
        </div>
      </div>
    </div>
  );
}
