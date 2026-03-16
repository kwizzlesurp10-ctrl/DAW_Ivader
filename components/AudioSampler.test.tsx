import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudioSampler } from './AudioSampler';

describe('AudioSampler', () => {
  it('renders the audio sampler component', () => {
    const mockOnAudioLoaded = vi.fn();
    render(<AudioSampler onAudioLoaded={mockOnAudioLoaded} />);
    
    expect(screen.getByText(/ADVANCED_SAMPLER/i)).toBeDefined();
  });

  it('displays drag and drop area', () => {
    const mockOnAudioLoaded = vi.fn();
    render(<AudioSampler onAudioLoaded={mockOnAudioLoaded} />);
    
    expect(screen.getByText(/Drop audio or click to browse/i)).toBeDefined();
  });

  it('displays record audio button', () => {
    const mockOnAudioLoaded = vi.fn();
    render(<AudioSampler onAudioLoaded={mockOnAudioLoaded} />);
    
    expect(screen.getByText(/RECORD/i)).toBeDefined();
  });
});
