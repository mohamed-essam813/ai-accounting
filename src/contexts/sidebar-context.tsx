"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

export type SidebarState = "expanded" | "collapsed" | "hidden";

interface SidebarContextType {
  state: SidebarState;
  setState: (state: SidebarState) => void;
  toggle: () => void;
  toggleFocus: () => void;
  isExpanded: boolean;
  isCollapsed: boolean;
  isHidden: boolean;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const STORAGE_KEY = "sidebar-state";

export function SidebarProvider({ children, defaultState = "expanded" }: { children: React.ReactNode; defaultState?: SidebarState }) {
  // CRITICAL FIX: Always start with defaultState to ensure server and client match
  // DO NOT read from localStorage in useState initializer - that causes hydration mismatch
  const [state, setStateInternal] = useState<SidebarState>(defaultState);
  const [isMounted, setIsMounted] = useState(false);

  // Load from localStorage ONLY after mount to avoid hydration mismatch
  // Check immediately on client side (synchronously) to respect auto-collapse
  // CRITICAL: Set isMounted to true immediately so toggle works right away
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Mark as mounted FIRST so state changes work immediately
    setIsMounted(true);
    
    // Then check localStorage to see if auto-collapse has set it
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as SidebarState | null;
      if (stored && ["expanded", "collapsed", "hidden"].includes(stored)) {
        // Update state from localStorage
        // This will be "collapsed" if auto-collapse ran, or whatever user set
        setStateInternal(stored);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []); // Empty deps - only run once on mount

  // During SSR, always use defaultState
  // On client: once mounted, always use state (which may have been updated by auto-collapse or toggle)
  // Before mount: use defaultState to match server render
  // CRITICAL: After any state change (toggle/setState), isMounted should be true, so use state
  const actualState = (typeof window !== "undefined" && isMounted) ? state : defaultState;

  const setState = useCallback((newState: SidebarState) => {
    setStateInternal(newState);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, newState);
      } catch {
        // Ignore localStorage errors
      }
    }
  }, []);

  const toggle = useCallback(() => {
    setStateInternal((current) => {
      let newState: SidebarState;
      if (current === "expanded") {
        newState = "collapsed";
      } else if (current === "collapsed") {
        newState = "expanded";
      } else {
        // If hidden, toggle to collapsed
        newState = "collapsed";
      }
      
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY, newState);
        } catch {
          // Ignore localStorage errors
        }
      }
      return newState;
    });
  }, []);

  const toggleFocus = useCallback(() => {
    setStateInternal((current) => {
      const newState = current === "hidden" ? "collapsed" : "hidden";
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY, newState);
        } catch {
          // Ignore localStorage errors
        }
      }
      return newState;
    });
  }, []);

  // Memoize context value to ensure proper re-renders
  const value: SidebarContextType = useMemo(() => {
    return {
      state: actualState,
      setState,
      toggle,
      toggleFocus,
      isExpanded: actualState === "expanded",
      isCollapsed: actualState === "collapsed",
      isHidden: actualState === "hidden",
    };
  }, [actualState, setState, toggle, toggleFocus]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
