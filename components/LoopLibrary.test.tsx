import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoopLibrary, type MusicLoop } from './LoopLibrary';

describe('LoopLibrary', () => {
  const mockLoops: MusicLoop[] = [
    {
      id: 'loop1',
      name: 'Loop 1',
      url: 'https://example.com/loop1.mp3',
      duration: 8,
      prompt: 'Dark cyberpunk bassline',
      createdAt: Date.now(),
    },
    {
      id: 'loop2',
      name: 'Loop 2',
      url: 'https://example.com/loop2.mp3',
      duration: 8,
      prompt: 'Energetic drum pattern',
      createdAt: Date.now(),
    },
  ];

  it('renders empty state when no loops', () => {
    const onDeleteLoop = vi.fn();
    const onDragStart = vi.fn();
    render(<LoopLibrary loops={[]} onDeleteLoop={onDeleteLoop} onDragStart={onDragStart} />);
    
    expect(screen.getByText(/No loops generated yet/i)).toBeDefined();
  });

  it('renders loop list with correct count', () => {
    const onDeleteLoop = vi.fn();
    const onDragStart = vi.fn();
    render(<LoopLibrary loops={mockLoops} onDeleteLoop={onDeleteLoop} onDragStart={onDragStart} />);
    
    expect(screen.getByText('(2)')).toBeDefined();
    expect(screen.getByText('Loop 1')).toBeDefined();
    expect(screen.getByText('Loop 2')).toBeDefined();
  });

  it('displays loop metadata correctly', () => {
    const onDeleteLoop = vi.fn();
    const onDragStart = vi.fn();
    render(<LoopLibrary loops={mockLoops} onDeleteLoop={onDeleteLoop} onDragStart={onDragStart} />);
    
    expect(screen.getByText('Dark cyberpunk bassline')).toBeDefined();
    expect(screen.getByText('Energetic drum pattern')).toBeDefined();
  });

  it('calls onDeleteLoop when delete button is clicked', () => {
    const onDeleteLoop = vi.fn();
    const onDragStart = vi.fn();
    render(<LoopLibrary loops={mockLoops} onDeleteLoop={onDeleteLoop} onDragStart={onDragStart} />);
    
    const deleteButtons = screen.getAllByTitle('Delete loop');
    fireEvent.click(deleteButtons[0]);
    
    expect(onDeleteLoop).toHaveBeenCalledWith('loop1');
  });

  it('sets up drag handlers correctly', () => {
    const onDeleteLoop = vi.fn();
    const onDragStart = vi.fn();
    const { container } = render(
      <LoopLibrary loops={mockLoops} onDeleteLoop={onDeleteLoop} onDragStart={onDragStart} />
    );
    
    const draggableElements = container.querySelectorAll('[draggable="true"]');
    expect(draggableElements.length).toBe(2);
  });

  it('calls onDragStart with correct loop data', () => {
    const onDeleteLoop = vi.fn();
    const onDragStart = vi.fn();
    const { container } = render(
      <LoopLibrary loops={mockLoops} onDeleteLoop={onDeleteLoop} onDragStart={onDragStart} />
    );
    
    const draggableElements = container.querySelectorAll('[draggable="true"]');
    const mockDataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
    };
    
    fireEvent.dragStart(draggableElements[0], { dataTransfer: mockDataTransfer });
    
    expect(onDragStart).toHaveBeenCalledWith(mockLoops[0]);
    expect(mockDataTransfer.effectAllowed).toBe('copy');
    expect(mockDataTransfer.setData).toHaveBeenCalledWith(
      'application/json',
      JSON.stringify(mockLoops[0])
    );
  });

  it('renders help text for drag and drop', () => {
    const onDeleteLoop = vi.fn();
    const onDragStart = vi.fn();
    render(<LoopLibrary loops={mockLoops} onDeleteLoop={onDeleteLoop} onDragStart={onDragStart} />);
    
    expect(screen.getByText(/Drag onto drum pads or sequencer tracks/i)).toBeDefined();
  });
});
