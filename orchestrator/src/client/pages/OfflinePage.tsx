import { WifiOff } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function OfflinePage() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleOnline = () => {
      navigate("/", { replace: true });
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="flex w-full max-w-md flex-col items-center gap-6 rounded-lg border border-border bg-card p-8 text-center shadow-sm sm:p-10">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
          <WifiOff className="h-8 w-8" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
            You seem offline
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Check your internet connection and try again.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            This page will automatically redirect when your connection is
            restored.
          </p>
        </div>
        <Button type="button" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </section>
    </main>
  );
}
