// app/dashboard/loading.tsx
import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background font-sans">
      {/* Main loading container */}
      <div className="flex flex-col items-center justify-center space-y-4">
        {/* Logo placeholder */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-100 to-sky-50 flex items-center justify-center shadow-lg">
          <div className="w-6 h-6 bg-primary rounded-lg" />
        </div>

        {/* Loading spinner */}
        <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
        
        {/* Loading text */}
        <div className="flex flex-col items-center">
          <h3 className="text-base font-medium text-foreground">
            Loading your workspace
          </h3>
          <p className="text-sm text-muted-foreground">
            This may take a few moments
          </p>
        </div>
      </div>

      {/* Optional loading facts/tips */}
      <div className="absolute bottom-8 text-center max-w-sm mx-auto px-4">
        <p className="text-xs text-muted-foreground/60">
          Did you know? Our workspace uses AI to help organize your research efficiently.
        </p>
      </div>
    </div>
  );
}