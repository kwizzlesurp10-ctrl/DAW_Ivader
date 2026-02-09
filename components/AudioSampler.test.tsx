import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudioSampler } from './AudioSampler';

describe('AudioSampler', () => {
  it('renders the audio sampler component', () => {
    const mockOnAudioLoaded = vi.fn();
    render(<AudioSampler onAudioLoaded={mockOnAudioLoaded} />);
    
    expect(screen.getByText(/AUDIO_SAMPLER/i)).toBeDefined();
  });

  it('displays drag and drop area', () => {
    const mockOnAudioLoaded = vi.fn();
    render(<AudioSampler onAudioLoaded={mockOnAudioLoaded} />);
    
    expect(screen.getByText(/Drop audio file or click to browse/i)).toBeDefined();
  });

  it('displays record audio button', () => {
    const mockOnAudioLoaded = vi.fn();
    render(<AudioSampler onAudioLoaded={mockOnAudioLoaded} />);
    
    expect(screen.getByText(/RECORD AUDIO/i)).toBeDefined();
  });

  it('shows supported audio formats', () => {
    const mockOnAudioLoaded = vi.fn();
    render(<AudioSampler onAudioLoaded={mockOnAudioLoaded} />);
    
    expect(screen.getByText(/Supports: MP3, WAV, OGG, WEBM/i)).toBeDefined();
  });
});
