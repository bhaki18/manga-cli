# 📖 Manga & Anime CLI 🎬

> A fast, lightweight, and powerful interactive terminal CLI to search and read **manga** online with RAM caching, stream **anime** episodes directly in high quality, and download chapters/episodes for offline viewing, inspired by `ani-cli`.

---

## ✨ Features

### 📖 Manga Reader
- 📚 **Multiple Free Sources**: Aggregates from **One Piece Power** (complete Italian & English archive), **Mangapill** (complete English catalog with thousands of titles), and **MangaDex** (official & community multi-language fan-translations).
- 🌐 **30+ Supported Languages**: Read scans in Italian, English, Spanish, French, German, Japanese, Portuguese, Russian, and 25+ more languages with native flag badges.
- ⚡ **Instant Real-Time Streaming**: Opens in less than a second on page 1 while subsequent pages stream directly into the viewer's playlist in the background.
- 🧠 **Zero Disk Writes (RAM Caching)**: Pages are downloaded straight into RAM (`/dev/shm` on Linux) and wiped instantly upon closing, keeping your disk clean and wear-free.
- 🖼️ **Multi-Viewer Support**: Seamless integration with your favourite graphical viewer (`mpv` via IPC socket, `feh` via inotify auto-reload, `sxiv`, `imv`, or `loupe`).
- ⏭️ **Continuous Reading**: Instantly jump to the next chapter at the press of a key once finished.
- 📥 **Offline Chapter Downloads**: Download full chapters to your disk with a single flag (`-d, --download`).
- 🔢 **Direct Chapter Jumps**: Jump straight to any chapter number with `-C, --chapter <num>`.

### 🎬 Anime Streaming
- 🍿 **200+ Anime Series & Movies**: Full streaming archive including *One Piece* (1,200+ episodes), *Attack on Titan*, *Bleach*, *Demon Slayer*, *Jujutsu Kaisen*, *Solo Leveling*, *Chainsaw Man*, *Dragon Ball*, *Naruto*, and hundreds more!
- 🇮🇹 / 🇯🇵 **Dual Audio Track Support**: Switch effortlessly between Italian Dubbed (**ITA**) and Japanese with Italian Subtitles (**SUB ITA**).
- ⚡ **Direct Fast CDN Streaming**: Direct 1080p MP4 stream playback with instant seeking via `mpv` (or `vlc` / `ffplay`).
- 📥 **Offline Episode Downloads**: Download full 1080p episodes with progress bar via `-d, --download`.
- 🔢 **Direct Episode Jumps**: Jump straight to any episode number with `-e, --episode <num>`.
- 🔗 **Direct Stream Extraction (`-g, --get-url`)**: Print pure stream URLs to stdout for scripting and piping into external tools.
- ⏭️ **Continuous Binge Watching**: Auto-advance to the next episode with a single keystroke when the current episode ends.
- 💾 **Resume Progress & State**: Remembers your playback position and marks watched episodes with `[✓]`.
- 📜 **Interactive History Explorer**: View your reading and watch history with `-H, --history` and resume instantly.
- 🎲 **Random Picker**: Pick a random manga or anime from the catalog with `-r, --random`.
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

## 🚀 Usage & Commands

### Interactive Hub
Simply run `manga-cli` with no arguments to pick between Manga, Anime, History, or Random:

```bash
manga-cli
```

---

### 🎬 Anime Streaming

```bash
# Launch interactive Anime mode
anime-cli
manga-cli -a

# Search and stream directly
anime-cli "demon slayer"
manga-cli "one piece" -a

# Jump directly to a specific episode without prompts
anime-cli "one piece" -e 1071
manga-cli "chainsaw man" -a -e 1

# Choose audio preference (ITA Dubbed vs SUB ITA)
manga-cli "attack on titan" -a --dub   # Italian Dub (Doppiato ITA)
manga-cli "attack on titan" -a --sub   # Japanese with Italian Subtitles (SUB ITA)

# Launch player directly in fullscreen
anime-cli "bleach" -e 1 -f

# Force a specific media player (mpv, vlc, ffplay)
anime-cli "naruto" -p vlc
```

---

### 📖 Manga Reading

```bash
# Launch interactive Manga mode
manga-cli -m

# Search manga with language filters
manga-cli "one piece" --lang it      # Italian scans
manga-cli "berserk" --lang en        # English scans

# Jump directly to a specific chapter
manga-cli "one piece" -m -C 1000

# Force a specific image viewer (feh, sxiv, imv, mpv, loupe)
manga-cli "berserk" -v feh -f
```

---

### 📥 Offline Downloads (`-d, --download`)

Download full manga chapters or anime episodes directly to `~/Downloads/`:

```bash
# Download an anime episode
anime-cli "chainsaw man" -e 1 -d
# Download to a custom destination directory
anime-cli "one piece" -e 1050 -d "/path/to/downloads"

# Download a manga chapter
manga-cli "one piece" -m -C 1000 -d
```

---

### 🔗 Scripting & Pure Stream Extraction (`-g, --get-url`)

Print pure stream URLs or image URLs to stdout without opening any GUI players (great for piping):

```bash
# Get direct MP4 video stream URL
anime-cli "one piece" -e 1071 -g

# Pipe directly into MPV or aria2c
mpv (anime-cli "one piece" -e 1071 -g)
aria2c (anime-cli "chainsaw man" -e 1 -g)

# Get direct manga chapter image URLs
manga-cli "one piece" -m -C 1 -g
```

---

### 📜 History Explorer & Progress Manager (`-H`, `--edit-history`)

Manage and edit your reading and watching progress directly from your terminal:

```bash
# Open interactive history manager and editor
manga-cli -H
manga-cli edit
manga-cli --edit-history

# Auto-resume from next unread chapter or watched episode
manga-cli -c
anime-cli -c
manga-cli -m -c

# Directly set manga chapter progress
manga-cli "one piece" -m --set-chapter 1050

# Directly set anime episode progress
anime-cli "one piece" --set-episode 1071
manga-cli "dr. stone" -a --set-episode 15

# Directly unmark a chapter or episode
anime-cli "dr. stone" --unmark 10
manga-cli "berserk" -m --unmark 92

# Remove a specific title from history
manga-cli "berserk" --remove-history
anime-cli "one piece" --remove-history
```

#### 🛠️ Interactive History Actions Menu:
When you open `manga-cli -H` and pick a title, you can:
- ▶️ **Resume reading / watching** from your saved position.
- ✏️ **Set last episode/chapter number manually** to update your progress.
- ✅ **Mark all episodes/chapters up to number N as read/watched** in one step.
- ❌ **Unmark specific episodes/chapters**:
  - ⏪ *Unmark only latest* (removes the latest watched/read item in 1 click)
  - 🔢 *Enter number(s) directly* (e.g. `10` or `5, 8, 12` to remove instantly)
  - 📋 *Select from checklist* (sorted newest first with spacebar selection)
- 🗑️ **Remove this title from history**.


---

### 🎲 Random Title Picker (`-r, --random`)

```bash
# Pick and open a random title
manga-cli -r            # Random Manga or Anime
anime-cli -r            # Random Anime from catalog
manga-cli -m -r         # Random Manga from catalog
```

---

### ℹ️ Info & Catalog Listing (`-i`, `--list`)

```bash
# View metadata, genres, and total episodes/chapters without opening viewer
anime-cli "demon slayer" -i
manga-cli "one piece" -m -i

# List all matching titles in catalog
anime-cli --list "dragon ball"
manga-cli -m --list "jojos"
```

---

### 🗑️ History Deletion (`-D, --delete`)

```bash
manga-cli -D         # Interactive deletion menu
manga-cli -a -D      # Delete only watched anime history
manga-cli -m -D      # Delete only read manga history
```

### 🧩 Custom Sources & Community Store (`manga-cli sources`)

Extend `manga-cli` with community extensions or custom plugins for Manga and Anime without touching the core codebase!

```bash
# Sfoglia lo store grafico interattivo (seleziona e installa con spazio e invio)
manga-cli sources explore

# Installa direttamente una fonte comunitaria per nome (es. AnimeWorld)
manga-cli sources install animeworld

# Aggiorna tutte le fonti comunitarie installate
manga-cli sources update

# Visualizza tutte le fonti attive (built-in e plugin installati)
manga-cli sources list

# Filtra ricerche ed esecuzioni su una fonte specifica
manga-cli "berserk" -m --source mangadex
manga-cli "solo leveling" -a --source animeworld

# Per sviluppatori: crea un nuovo template pronto da compilare
manga-cli sources new "mia-fonte"           # Template Manga
manga-cli sources new "mio-anime" --anime   # Template Anime

# Rimuovi una fonte installata
manga-cli sources remove animeworld
```

### 📚 Cataloghi Completi (`--catalog`, `--catalog-anime`, `--catalog-manga`)

Visualizza a terminale l'intero catalogo dei titoli disponibili con conteggi, lingue e audio, aggregati o divisi per fonte:

```bash
# Mostra l'intero catalogo Anime di tutte le fonti
manga-cli --catalog-anime
# oppure: manga-cli catalog anime

# Mostra l'intero catalogo Manga di tutte le fonti
manga-cli --catalog-manga
# oppure: manga-cli catalog manga

# Mostra il catalogo anime o manga di una SPECIFICA fonte
manga-cli --catalog-anime --source animeworld
manga-cli --catalog-manga --source onepiecepower

# Mostra il catalogo (anime e/o manga) di una specifica fonte
manga-cli --catalog --source animeworld

# Mostra l'intero catalogo globale (sia Anime che Manga di TUTTE le fonti)
manga-cli --catalog
# oppure: manga-cli catalog
```

📖 **Guida Completa**: Consulta [GUIDE.md](GUIDE.md) per tutti i dettagli su come sfogliare lo store, visualizzare i cataloghi o creare nuovi provider personalizzati.

---

## 📋 Full Command-Line Options Reference

| Option | Description |
| :--- | :--- |
| `-a, --anime` | Watch anime stream |
| `-m, --manga` | Read manga chapters |
| `-s, --source <id\>` | Filter search/playback to a specific source ID |
| `-l, --lang <code\>` | Filter by scan/catalog language (e.g. `it`, `en`, `es`, `fr`, `ja`) |
| `--catalog` | Display catalog of titles (supports `--anime`, `--manga`, `--source`, `--lang`) |
| `--catalog-anime` | Display full anime catalog (or for a specific source with `--source`) |
| `--catalog-manga` | Display full manga catalog (or for a specific source with `--source`) |
| `--dub` | Prefer Italian dubbed audio (ITA) for anime |
| `--sub` | Prefer Japanese audio with Italian subtitles (SUB ITA) |
| `-e, --episode <num\>` | Jump directly to episode number |
| `-C, --chapter <num\>` | Jump directly to chapter number |
| `-d, --download [dir]` | Download chapter pages or anime episode `.mp4` for offline viewing |
| `-g, --get-url` | Print direct streaming/image URLs to stdout and exit |
| `-H, --history` | Display read/watched history with interactive resume |
| `--edit-history` | Open interactive history manager & progress editor |
| `--set-chapter <num\>` | Directly set last read manga chapter progress |
| `--set-episode <num\>` | Directly set last watched anime episode progress |
| `--unmark <num\>` | Unmark/remove specific chapter or episode from history |
| `--remove-history` | Remove specified title from reading/watching history |
| `-r, --random` | Pick and open a random manga or anime title |
| `-i, --info` | Display title metadata and total chapters/episodes without opening player |
| `--list` | List all matching titles from catalog and exit |
| `-p, --player <name\>` | Force media player (`mpv`, `vlc`, `ffplay`, `xdg-open`) |
| `-v, --viewer <name\>` | Force image viewer (`feh`, `sxiv`, `imv`, `mpv`, `loupe`) |
| `-f, --fullscreen` | Launch player or viewer in fullscreen mode |
| `-c, --continue` | Auto-resume next unread chapter or watched episode |
| `-D, --delete` | Clear read chapters and watched anime history |
| `-V, --version` | Output version number |
| `-h, --help` | Display command-line help |

---

## 👁️ Supported Players & Viewers

- **Anime Streaming**: `mpv` (recommended: keyboard shortcuts, volume, seeking, and resume), `vlc`, `ffplay`.
- **Manga Reader**: `feh`, `mpv`, `sxiv`, `imv`, `loupe`.

---

## 📜 License

Released under the [MIT](LICENSE) License.
