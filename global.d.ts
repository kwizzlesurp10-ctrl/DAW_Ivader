/** Legacy Safari; AudioContext is the standard. */
interface Window {
  webkitAudioContext?: typeof AudioContext;
}
