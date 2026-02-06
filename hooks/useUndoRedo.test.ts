import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoRedo } from './useUndoRedo';

describe('useUndoRedo', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useUndoRedo(42));
    expect(result.current.state).toBe(42);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('updates state and enables undo', () => {
    const { result } = renderHook(() => useUndoRedo(0));
    act(() => result.current.setState(1));
    expect(result.current.state).toBe(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo restores previous state', () => {
    const { result } = renderHook(() => useUndoRedo(0));
    act(() => result.current.setState(1));
    act(() => result.current.undo());
    expect(result.current.state).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redo re-applies state', () => {
    const { result } = renderHook(() => useUndoRedo(0));
    act(() => result.current.setState(1));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.state).toBe(1);
    expect(result.current.canRedo).toBe(false);
  });

  it('setState with function receives previous state', () => {
    const { result } = renderHook(() => useUndoRedo(10));
    act(() => result.current.setState((prev) => prev + 5));
    expect(result.current.state).toBe(15);
  });

  it('clearHistory resets to single current state', () => {
    const { result } = renderHook(() => useUndoRedo(0));
    act(() => result.current.setState(1));
    act(() => result.current.setState(2));
    act(() => result.current.clearHistory());
    expect(result.current.state).toBe(2);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
