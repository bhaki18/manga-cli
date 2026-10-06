# 📖 Manga CLI

> A fast and lightweight interactive terminal CLI to search and read manga online with RAM caching and instant streaming, inspired by `ani-cli`.

---

## ✨ Features

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
# Launch interactive search menu
manga-cli

# Or search directly for a manga title
manga-cli "one piece"
manga-cli "berserk"
manga-cli "bleach"
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
