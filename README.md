# MANGA CLI

`manga-cli` è una CLI interattiva per terminale ispirata ad `ani-cli`, pensata per cercare e leggere manga online in italiano con fonte **One Piece Power**.

## ✨ Caratteristiche
- **Zero scrittura su disco**: Le pagine vengono scaricate direttamente in RAM (`/dev/shm` su Linux) e rimosse all'uscita o al cambio capitolo.
- **Provider Modulare**: Architettura a plugin estensibile ad altre fonti in futuro.
- **Supporto viewer flessibile**: Compatibile con `mpv`, `feh`, `sxiv`, `imv`.
- **Interfaccia Interattiva**: Ricerca e navigazione rapida con autocompletamento.

## 🚀 Requisiti
- **Node.js** (v18+)
- **cURL**
- Un visualizzatore di immagini (consigliati `feh`, `sxiv`, oppure `mpv`)

## 📦 Installazione e Uso

```bash
# Installa le dipendenze
npm install

# Avvia la CLI in modalità interattiva
node src/cli.js

# Oppure cerca direttamente un titolo
node src/cli.js "one piece"
node src/cli.js "berserk"
```

Per installarlo globalmente nel sistema:
```bash
npm link
# Da quel momento puoi usare direttamente:
manga-cli "one piece"
```

## 🐳 Test con Docker (Arch Linux)

Puoi testare l'applicazione in un container pulito basato su **Arch Linux**:

```bash
# Costruisci l'immagine Arch Linux
docker build -t manga-cli:arch-test .

# Esegui la CLI nel container
docker run --rm -it -v /dev/shm:/dev/shm manga-cli:arch-test

# Oppure test con ricerca diretta
docker run --rm -it -v /dev/shm:/dev/shm manga-cli:arch-test "one piece"
```

## 📦 Pubblicazione su AUR (Arch User Repository)

È presente il file [`PKGBUILD`](file:///home/adp/Desktop/manga-cli/PKGBUILD) pronto per `manga-cli-git`:

1. Assicurati di aver fatto il commit e push del tuo repo su GitHub (`https://github.com/bhaki18/manga-cli`).
2. Testa la creazione del pacchetto con `makepkg -si`.
3. Crea il repository su AUR:
   ```bash
   git clone ssh://aur@aur.archlinux.org/manga-cli-git.git
   cd manga-cli-git
   cp /home/adp/Desktop/manga-cli/PKGBUILD .
   makepkg --printsrcinfo > .SRCINFO
   git add PKGBUILD .SRCINFO
   git commit -m "Initial commit for manga-cli-git"
   git push origin master
   ```

