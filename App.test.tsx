import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('DOOM DAW App', () => {
    it('renders the main title', () => {
        render(<App />);
        // "DOOM DAW" is in the start screen
        expect(screen.getByText('DOOM DAW')).toBeInTheDocument();
    });

    it('initializes system on click', async () => {
        render(<App />);
        const initButton = screen.getByText('[ Initialize System ]');
        fireEvent.click(initButton);

        // Wait for the main UI to load (look for PLAY button text or similar if accessible, or check for absence of start screen)
        // The "PLAY" button has a title="PLAY", let's look for that or the header text
        expect(await screen.findByTitle('PLAY')).toBeInTheDocument();
    });
});
