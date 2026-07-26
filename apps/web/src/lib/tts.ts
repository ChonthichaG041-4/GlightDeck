/**
 * Thin wrapper around the Web Speech API for quick single-word/short-phrase
 * pronunciation (Vocabulary/Flashcards/Quiz/Reading's dictionary popup). This
 * is NOT used by Listening anymore - full listening passages are synthesized
 * server-side (Kokoro/Edge Neural TTS, see api/hooks.ts's useGenerateAudio and
 * components/listening/ListeningWorkspace.tsx) so playback is real audio
 * instead of the browser's often-robotic/inconsistent built-in voices. This
 * file stays for the short one-off pronunciations elsewhere, where a
 * network round trip per word would be overkill and the Web Speech API is a
 * perfectly fine fit.
 */
export function speak(text: string, lang = "en-US") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}
