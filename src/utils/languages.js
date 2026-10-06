/**
 * Comprehensive language map supporting 30+ popular languages for manga reading
 */
const LANGUAGES = [
  { code: 'it', name: 'Italian (Italiano)', flag: '🇮🇹' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ja', name: 'Japanese (日本語)', flag: '🇯🇵' },
  { code: 'es', name: 'Spanish (Español)', flag: '🇪🇸' },
  { code: 'es-la', name: 'Spanish Latin (Latinoamérica)', flag: '🇲🇽' },
  { code: 'fr', name: 'French (Français)', flag: '🇫🇷' },
  { code: 'de', name: 'German (Deutsch)', flag: '🇩🇪' },
  { code: 'pt-br', name: 'Portuguese (Brasil)', flag: '🇧🇷' },
  { code: 'pt', name: 'Portuguese (Portugal)', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian (Русский)', flag: '🇷🇺' },
  { code: 'ar', name: 'Arabic (العربية)', flag: '🇸🇦' },
  { code: 'id', name: 'Indonesian (Bahasa Indonesia)', flag: '🇮🇩' },
  { code: 'vi', name: 'Vietnamese (Tiếng Việt)', flag: '🇻🇳' },
  { code: 'tr', name: 'Turkish (Türkçe)', flag: '🇹🇷' },
  { code: 'pl', name: 'Polish (Polski)', flag: '🇵🇱' },
  { code: 'uk', name: 'Ukrainian (Українська)', flag: '🇺🇦' },
  { code: 'zh', name: 'Chinese Simplified (简体中文)', flag: '🇨🇳' },
  { code: 'zh-hk', name: 'Chinese Traditional (繁體中文)', flag: '🇭🇰' },
  { code: 'ko', name: 'Korean (한국어)', flag: '🇰🇷' },
  { code: 'th', name: 'Thai (ไทย)', flag: '🇹🇭' },
  { code: 'hi', name: 'Hindi (हिन्दी)', flag: '🇮🇳' },
  { code: 'nl', name: 'Dutch (Nederlands)', flag: '🇳🇱' },
  { code: 'el', name: 'Greek (Ελληνικά)', flag: '🇬🇷' },
  { code: 'ro', name: 'Romanian (Română)', flag: '🇷🇴' },
  { code: 'hu', name: 'Hungarian (Magyar)', flag: '🇭🇺' },
  { code: 'cs', name: 'Czech (Čeština)', flag: '🇨🇿' },
  { code: 'sv', name: 'Swedish (Svenska)', flag: '🇸🇪' },
  { code: 'fa', name: 'Persian (فارسی)', flag: '🇮🇷' },
  { code: 'he', name: 'Hebrew (עברית)', flag: '🇮🇱' },
  { code: 'bg', name: 'Bulgarian (Български)', flag: '🇧🇬' },
  { code: 'ms', name: 'Malay (Bahasa Melayu)', flag: '🇲🇾' },
  { code: 'tl', name: 'Tagalog / Filipino', flag: '🇵🇭' }
];

function getLanguageName(code) {
  if (!code) return 'Unknown';
  const found = LANGUAGES.find(l => l.code === code.toLowerCase());
  return found ? `${found.flag} ${found.name}` : code.toUpperCase();
}

function getLanguageFlag(code) {
  if (!code) return '🌍';
  const found = LANGUAGES.find(l => l.code === code.toLowerCase());
  return found ? found.flag : '🌍';
}

module.exports = {
  LANGUAGES,
  getLanguageName,
  getLanguageFlag
};
