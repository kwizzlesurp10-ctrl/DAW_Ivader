import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DrumPadGrid } from './DrumPadGrid';
import { createEmptyDrumPads } from '../types';

describe('DrumPadGrid', () => {
  const noop = (): void => {};

  it('renders one pad control per slot', () => {
    render(
      <DrumPadGrid
        drumPads={createEmptyDrumPads()}
        stepsPerPattern={16}
        bpm={128}
        currentStep={-1}
        isPlaying={false}
        onAssignLoop={noop}
        onClearPad={noop}
        onToggleMute={noop}
        onTriggerPad={noop}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(16);
  });
});
