export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "th", label: "Thai" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "vi", label: "Vietnamese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "id", label: "Indonesian" },
] as const;

export function languageLabel(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
