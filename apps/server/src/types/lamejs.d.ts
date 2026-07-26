// @breezystack/lamejs (pure-JS MP3 encoder, used by KokoroProvider to encode
// Kokoro's raw PCM output to MP3) ships its own types, but this ambient
// fallback stays here in case type resolution ever fails for some reason -
// harmless either way (TS prefers the package's real .d.ts when present).
// NOTE: the original "lamejs" package (no scope) is broken under Node -
// its files assume a browser <script> environment where classes like
// MPEGMode attach to the global scope, which throws
// "ReferenceError: MPEGMode is not defined" the moment Mp3Encoder is
// constructed via require()/import in Node. Don't switch back to it.
declare module "@breezystack/lamejs";
