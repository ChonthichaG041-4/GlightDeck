// A short, dependency-free "done" chime played via the Web Audio API - no
// audio file asset needed. Used to let the user know a slow background AI
// step (e.g. ImportBookWizard's "AI is Processing Your Document" step) has
// finished, so they don't have to keep staring at the screen while it runs.
let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  return sharedCtx;
}

function playTone(ctx: AudioContext, startTime: number, freq: number, duration: number, peakGain: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

/** Short two-note ascending chime (~0.4s) - plays once, fire-and-forget. */
export function playSuccessChime() {
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    playTone(ctx, now, 880, 0.18, 0.15); // A5
    playTone(ctx, now + 0.12, 1318.51, 0.28, 0.15); // E6
  } catch {
    // Non-fatal - a missing/blocked notification sound shouldn't break the flow.
  }
}
