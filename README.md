# 📖 Manga CLI

> A fast and lightweight interactive terminal CLI to search and read manga online with RAM caching and instant streaming, inspired by `ani-cli`.

---

## ✨ Features

- 📚 **Multiple Free Sources**: Aggregates from **One Piece Power** (complete Italian & English archive), **Mangapill** (complete English catalog with thousands of titles), and **MangaDex** (official & community multi-language fan-translations).
- 🌐 **30+ Supported Languages**: Read scans in Italian, English, Spanish, French, German, Japanese, Portuguese, Russian, and 25+ more languages with native flag badges.
- ⚡ **Instant Real-Time Streaming**: Opens in less than a second on page 1 while subsequent pages stream directly into the viewer's playlist in the background.
- 🧠 **Zero Disk Writes (RAM Caching)**: Pages are downloaded straight into RAM (`/dev/shm` on Linux) and wiped instantly upon closing, keeping your disk clean and wear-free.
- 🔍 **Interactive Search & Paged Navigation**: Fixed-viewport menu navigation (`pageSize: 10`) ensures your active selection is always clearly visible. Type to filter through 1,200+ chapters effortlessly.
- 🖼️ **Multi-Viewer Support**: Seamless integration with your favourite graphical viewer (`mpv` via IPC socket, `feh` via inotify auto-reload, `sxiv`, `imv`, or `loupe`).
- ⏭️ **Continuous Reading**: Instantly jump to the next chapter at the press of a key once finished.

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

### AUR (Once available)

```bash
yay -S manga-cli-git
# or
paru -S manga-cli-git
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

Once installed, simply run:

```bash
# Launch interactive mode (prompts for language & manga)
manga-cli

# Search directly with language flags
manga-cli "one piece" --lang it      # Italian scans
manga-cli "one piece" --lang en      # English scans
manga-cli "berserk"                  # Global search (shows [ITA] and [ENG] badges)
```

---

## 👁️ Supported Viewers

`manga-cli` automatically detects and picks the best available image viewer installed on your system:

1. **mpv**: `sudo pacman -S mpv` (uses real-time dynamic IPC socket streaming)
2. **feh** *(recommended for image galleries)*: `sudo pacman -S feh` (uses `--auto-reload` inotify)
3. **sxiv**: `sudo pacman -S sxiv`
4. **imv**: `sudo pacman -S imv`

---

## 📜 License

Released under the [MIT](LICENSE) License.
