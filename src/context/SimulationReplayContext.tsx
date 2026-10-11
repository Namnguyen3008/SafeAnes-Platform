"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createFullCase, createSafeAnesSimulationState, SimulationEngine } from "@/simulation";
import type { SafeAnesSimulationState } from "@/simulation/core/simulationState";
import type { SimulationSnapshot } from "@/simulation";

export interface SafeAnesSimulationContextValue {
  engine: SimulationEngine;
  snapshot: SimulationSnapshot;
  simulation: SafeAnesSimulationState;
}

const SafeAnesSimulationContext = createContext<SafeAnesSimulationContextValue | null>(null);

/** Owns the one case engine and keeps it mounted across every case route. */
export function SafeAnesSimulationProvider({ children }: { children: React.ReactNode }) {
  const [engine] = useState(() => {
    const sharedEngine = new SimulationEngine(createFullCase());
    sharedEngine.seek(0);
    return sharedEngine;
  });
  const [snapshot, setSnapshot] = useState(() => engine.getSnapshot());

  useEffect(() => {
    setSnapshot(engine.getSnapshot());
    return engine.subscribe(setSnapshot);
  }, [engine]);

  // The ticker belongs to the persistent case provider, so playback continues
  // while a clinician changes workspaces or language.
  useEffect(() => {
    if (snapshot.status !== "PLAYING") return;
    let previousTime = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      engine.advanceRealTime(now - previousTime);
      previousTime = now;
    }, 50);
    return () => window.clearInterval(timer);
  }, [engine, snapshot.status]);

  const value = useMemo<SafeAnesSimulationContextValue>(() => ({
    engine,
    snapshot,
    simulation: createSafeAnesSimulationState(engine, snapshot),
  }), [engine, snapshot]);

  return (
    <SafeAnesSimulationContext.Provider value={value}>
      {children}
    </SafeAnesSimulationContext.Provider>
  );
}

export function useSafeAnesSimulation(): SafeAnesSimulationState {
  const context = useContext(SafeAnesSimulationContext);
  if (!context) throw new Error("useSafeAnesSimulation must be used within SafeAnesSimulationProvider");
  return context.simulation;
}

export function useSimulationReplay(): SafeAnesSimulationContextValue {
  const context = useContext(SafeAnesSimulationContext);
  if (!context) throw new Error("useSimulationReplay must be used within SafeAnesSimulationProvider");
  return context;
}

/** Backward-compatible name retained while all consumers share the canonical provider. */
export const SimulationReplayProvider = SafeAnesSimulationProvider;
