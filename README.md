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

