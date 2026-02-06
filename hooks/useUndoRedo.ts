import { useState, useCallback } from 'react';

const DEFAULT_MAX_HISTORY = 50;

/**
 * Undo/redo state for a single value (e.g. SongData).
 * Pushes a new state on each setState; undo/redo move through history.
 */
export function useUndoRedo<T>(
  initial: T,
  maxHistory: number = DEFAULT_MAX_HISTORY
): {
  state: T;
  setState: (value: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;
} {
  const [{ history, index }, setHistoryAndIndex] = useState<{
    history: T[];
    index: number;
  }>({ history: [initial], index: 0 });

  const current = history[index] as T;
  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  const setState = useCallback(
    (value: T | ((prev: T) => T)) => {
      const next = typeof value === 'function' ? (value as (prev: T) => T)(current) : value;
      setHistoryAndIndex((prev) => {
        const trimmed = prev.history.slice(0, prev.index + 1);
        const nextHistory = [...trimmed, next].slice(-maxHistory);
        return { history: nextHistory, index: nextHistory.length - 1 };
      });
    },
    [maxHistory, current]
  );

  const undo = useCallback(() => {
    setHistoryAndIndex((prev) =>
      prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev
    );
  }, []);

  const redo = useCallback(() => {
    setHistoryAndIndex((prev) =>
      prev.index < prev.history.length - 1 ? { ...prev, index: prev.index + 1 } : prev
    );
  }, []);

  const clearHistory = useCallback(() => {
    setHistoryAndIndex({ history: [current], index: 0 });
  }, [current]);

  return {
    state: current,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
  };
}
