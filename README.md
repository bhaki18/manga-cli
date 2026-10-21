# 📖 Manga & Anime CLI 🎬

> A fast and lightweight interactive terminal CLI to search and read **manga** online with RAM caching and stream **anime** episodes directly in high quality, inspired by `ani-cli`.

---

## ✨ Features

### 📖 Manga Reader
- 📚 **Multiple Free Sources**: Aggregates from **One Piece Power** (complete Italian & English archive), **Mangapill** (complete English catalog with thousands of titles), and **MangaDex** (official & community multi-language fan-translations).
- 🌐 **30+ Supported Languages**: Read scans in Italian, English, Spanish, French, German, Japanese, Portuguese, Russian, and 25+ more languages with native flag badges.
- ⚡ **Instant Real-Time Streaming**: Opens in less than a second on page 1 while subsequent pages stream directly into the viewer's playlist in the background.
- 🧠 **Zero Disk Writes (RAM Caching)**: Pages are downloaded straight into RAM (`/dev/shm` on Linux) and wiped instantly upon closing, keeping your disk clean and wear-free.
- 🖼️ **Multi-Viewer Support**: Seamless integration with your favourite graphical viewer (`mpv` via IPC socket, `feh` via inotify auto-reload, `sxiv`, `imv`, or `loupe`).
- ⏭️ **Continuous Reading**: Instantly jump to the next chapter at the press of a key once finished.
- ✅ **Read Chapters Tracker**: Displays a green `[✓]` mark beside chapters you have already read.

### 🎬 Anime Streaming *(New in v2.0)*
- 🍿 **200+ Anime Series & Movies**: Full streaming archive including *One Piece* (1,200+ episodes), *Attack on Titan*, *Bleach*, *Demon Slayer*, *Jujutsu Kaisen*, *Solo Leveling*, *Chainsaw Man*, *Dragon Ball*, *Naruto*, and hundreds more!
- 🇮🇹 / 🇯🇵 **Dual Audio Track Support**: Switch effortlessly between Italian Dubbed (**ITA**) and Japanese with Italian Subtitles (**SUB ITA**).
- ⚡ **Direct Fast CDN Streaming**: Direct 1080p stream playback with instant seeking via `mpv` (or `vlc` / `ffplay`).
- ⏭️ **Continuous Binge Watching**: Auto-advance to the next episode with a single keystroke when the current episode ends.
- 💾 **Resume Progress & State**: Remembers your playback position and marks watched episodes with `[✓]`.
- 🔗 **Dual CLI Alias**: Launch as `manga-cli` or `anime-cli`.

---

## 📥 Installation

### Arch Linux (Custom Repository)

Add the repository to `/etc/pacman.conf`:

```ini
[manga-cli]
SigLevel = Optional TrustAll
Server = https://bhaki18.github.io/manga-cli/$arch
```

Then install with `pacman`:

```bash
sudo pacman -Sy manga-cli
```

### Arch Linux (Manual via makepkg)

```bash
git clone https://github.com/bhaki18/manga-cli.git
cd manga-cli
makepkg -si
```

### Other Linux / Generic Install

Requires **Node.js** (v18+) and **cURL**:

```bash
git clone https://github.com/bhaki18/manga-cli.git
cd manga-cli
npm install
sudo npm link
```

---

## 🚀 Usage

### Interactive Hub
Simply run `manga-cli` with no arguments to pick between Manga and Anime:

```bash
manga-cli
```

### 🎬 Watch Anime

```bash
# Launch directly in Anime mode
manga-cli -a
# or use the anime-cli alias
anime-cli

# Search anime title directly
manga-cli "one piece" -a
anime-cli "demon slayer"
manga-cli anime "jujutsu kaisen"

# Choose audio preference
manga-cli "attack on titan" -a --dub   # Italian Dub (Doppiato ITA)
manga-cli "attack on titan" -a --sub   # Japanese Audio with Italian Subtitles (SUB ITA)

# Resume next unread/unwatched episode or chapter
manga-cli -c
manga-cli -a -c
```

### 📖 Read Manga

```bash
# Launch directly in Manga mode
manga-cli -m

# Search manga directly with language flags
manga-cli "one piece" --lang it      # Italian scans
manga-cli "one piece" --lang en      # English scans
manga-cli "berserk"                  # Global search (shows [ITA] and [ENG] badges)

# Resume next unread chapter
manga-cli -m -c
```

### 🗑️ History Management

```bash
# Interactively clear history or specify target
manga-cli -D
manga-cli -a -D     # Clear anime watch history
manga-cli -m -D     # Clear manga read history
```

---

## 👁️ Supported Players & Viewers

- **Anime Streaming**: `mpv` (recommended, with keyboard shortcuts, volume, seeking, and resume), `vlc`, `ffplay`.
- **Manga Reader**: `feh`, `mpv`, `sxiv`, `imv`, `loupe`.

---

## 📜 License

Released under the [MIT](LICENSE) License.
