# 📖 Manga CLI

> Una CLI interattiva e leggera per terminale ispirata ad `ani-cli`, progettata per cercare e leggere manga online in italiano con fonte **One Piece Power**.

---

## ✨ Caratteristiche

- ⚡ **Zero scrittura su disco**: Le immagini vengono caricate direttamente nella RAM (`/dev/shm` su Linux) e distrutte all'uscita o al cambio capitolo, garantendo velocità estrema e preservando il tuo disco.
- 🔍 **Ricerca Rapida & Autocompletamento**: Cerca per titolo, autore o genere e naviga tra i capitoli con comodi menu interattivi nel terminale.
- 🖼️ **Compatibilità Viewer**: Si integra nativamente con il visualizzatore d'immagini installato sul tuo sistema (`feh`, `sxiv`, `imv`, oppure `mpv`).
- ⏭️ **Lettura Continua**: Al termine di un capitolo puoi passare direttamente al capitolo successivo con un tasto senza dover rieseguire il comando.

---

## 📥 Installazione

### Su Arch Linux (AUR)

Puoi installarlo tramite il tuo gestore AUR preferito:

```bash
# Con yay
yay -S manga-cli-git

# Con paru
paru -S manga-cli-git
```

### Installazione Manuale / Altre Distribuzioni

Assicurati di avere installato **Node.js** (v18+) e **cURL**.

```bash
# Clona il repository
git clone https://github.com/bhaki18/manga-cli.git
cd manga-cli

# Installa le dipendenze
npm install

# Crea il comando globale di sistema
sudo npm link
```

---

## 🚀 Come si usa

Dopo l'installazione, il comando è subito disponibile ovunque nel tuo terminale.

### 1. Modalità Interattiva
Avvia la CLI per digitare o cercare qualsiasi titolo tramite menu:
```bash
manga-cli
```

### 2. Ricerca Diretta
Puoi passare direttamente il nome del manga che vuoi leggere:
```bash
manga-cli "one piece"
manga-cli "berserk"
manga-cli "bleach"
```

---

## 👁️ Visualizzatori supportati

`manga-cli` rileva e utilizza automaticamente il visualizzatore d'immagini presente sul tuo sistema in questo ordine di priorità:

1. **feh** *(consigliato)*: `sudo pacman -S feh`
2. **sxiv**: `sudo pacman -S sxiv`
3. **imv**: `sudo pacman -S imv`
4. **mpv**: `sudo pacman -S mpv`

---

## 📜 Licenza

Rilasciato sotto licenza [MIT](LICENSE).
