"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Progress bar for route transitions
 * Shows a loading bar at the top when navigating between routes
 */
export function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  if (!isLoading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-muted">
      <div 
        className="h-full bg-primary origin-left" 
        style={{
          animation: "progress 0.5s ease-in-out",
          transform: "scaleX(1)",
        }}
      />
    </div>
  );
}

