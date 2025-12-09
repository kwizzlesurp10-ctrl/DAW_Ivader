# DOOM DAW Testing Guide

We have configured `vitest` for automated testing.

## Running Tests

To run the automated test suite, execute:

```bash
npm test
```

This will run all files ending in `.test.tsx` or `.spec.ts`.

## Test Setup

- **Runner**: Vitest (Fast, Vite-native)
- **Environment**: jsdom (Simulates browser DOM)
- **Utilities**: @testing-library/react (Component testing)
- **Setup File**: `setupTests.ts` (Includes Web Audio API mocks)

## Example Test

See `App.test.tsx` for an example of how to test React components.

## Mocks

The `AudioContext` is mocked in `setupTests.ts` because the real Web Audio API is not available in the Node.js/JSDOM test environment. If you need to test specific audio scheduling logic, you may need to expand the mock in `setupTests.ts`.
