# DOOM DAW Manual Test Plan

## Audio Engine Stability Test

**Objective**: Verify the fix for the scheduler race condition on Stop/Play.

### Test Case 1: Rapid Play/Stop

1. **Initialize System**: Click the main start button.
2. **Start Playback**: Click the play button (Step sequence should start).
3. **Stop**: Click the stop button (Sequence resets to 0, audio stops).
4. **Immediate Restart**: Click Play again within 500ms.
5. **Expected Result**: Audio starts cleanly from step 0. No "burst" of sound. No console errors.

### Test Case 2: Filter Resonance Scheduling

1. **Setup**: Select a Synth track (e.g., LEAD).
2. **Modify**: Set Filter Resonance (RES) to max (20).
3. **Play**: Listen to the notes.
4. **Expected Result**: Each note should have the high resonance applied *at the start* of the note (attack), not drifting in or applying to the previous note's tail.

## AI Generation Test (Gemini)

1. **Input**: Type "Cyberpunk industrial noise".
2. **Generate**: Click Generate.
3. **Expected**:
    - Loader appears.
    - Track patterns update.
    - Sounds change (waveforms/params update).
    - No "Irken System Error" alert.
