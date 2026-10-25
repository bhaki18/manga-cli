# 🧩 Guida alla Gestione e Creazione delle Fonti per `manga-cli`

`manga-cli` include un'architettura modulare a **Plugin** che consente a chiunque di aggiungere le proprie fonti preferite per **Manga** e **Anime** senza dover modificare il codice sorgente dell'applicazione.

---

## 📑 Indice

1. [Panoramica e Dove Risiedono i Plugin](#1-panoramica)
2. [Comandi di Gestione (`manga-cli sources`)](#2-comandi-di-gestione)
3. [Visualizzare i Cataloghi (Anime & Manga)](#3-visualizzare-i-cataloghi)
4. [Filtrare per Fonte durante le Ricerche](#4-filtrare-per-fonte)
5. [Come Creare una Fonte Manga](#5-creare-una-fonte-manga)
6. [Come Creare una Fonte Anime](#6-creare-una-fonte-anime)
7. [Utility e Strumenti Inclusi nei Plugin](#7-utility-incluse)
8. [Test e Risoluzione Problemi](#8-test-e-risoluzione-problemi)

---

## 1. Panoramica

All'avvio, `manga-cli` carica:
- **Fonti Built-in** (già integrate nel programma, es. *One Piece Power*, *MangaDex*, *Mangapill*).
- **Fonti Personalizzate (Custom Plugins)**: qualsiasi file `.js` valido posizionato nella cartella plugin dell'utente.

### Cartella dei Plugin Utente:
* **Linux / macOS**: `~/.config/manga-cli/providers/`
* **Windows**: `%APPDATA%\manga-cli\providers\`

I plugin caricati da questa cartella vengono registrati automaticamente ed eseguiti in parallelo durante le ricerche. Se un plugin contiene errori di sintassi o fallisce una richiesta di rete, **la CLI non si blocca**: l'errore viene isolato e gli altri provider continuano a funzionare normalmente.

---

## 2. Comandi di Gestione

Non serve saper programmare per aggiungere nuove fonti a `manga-cli`: puoi sfogliare il **Community Store** e installare con un semplice clic da terminale!

### 🌟 Per Tutti gli Utenti (No-Code: Store ed Estensioni Pronte)

#### 🛒 1. Sfogliare e installare dallo Store interattivo (`explore`)
```bash
manga-cli sources explore
```
Apre un menu interattivo con l'elenco di tutte le estensioni comunitarie disponibili. Usa le **frecce** e la **barra spaziatrice** per selezionare una o più fonti (es. AnimeWorld) e premi **Invio** per installarle immediatamente.

#### ⚡ 2. Installazione rapida diretta con nome (`install`)
Se conosci già l'ID della fonte (ad esempio `animeworld`), puoi installarla direttamente con un comando:
```bash
manga-cli sources install animeworld
```

#### 🔄 3. Aggiornare tutte le fonti installate (`update`)
```bash
manga-cli sources update
```
Controlla e scarica automaticamente le versioni più recenti di tutte le estensioni comunitarie installate.

#### 📋 4. Visualizzare tutte le fonti attive (`list`)
```bash
manga-cli sources list
# oppure semplicemente
manga-cli sources
```
Mostra la lista completa dei provider per Manga e Anime, evidenziando se sono **[Built-in]** o **[Custom Plugin]**, con gli ID, le lingue supportate e l'eventuale percorso del file.

#### 🗑️ 5. Rimuovere una Fonte Personalizzata (`remove`)
```bash
manga-cli sources remove animeworld
# oppure
manga-cli sources rm animeworld
```

---

### 🛠️ Per Sviluppatori e Utenti Avanzati (Creare o importare fonti)

#### 📝 Generare un nuovo Template pronto all'uso (`new`)
Crea uno scheletro di codice precompilato con commenti, spiegazioni e strutture pronte da completare:

* **Per un Manga**:
  ```bash
  manga-cli sources new nome-fonte
  ```

* **Per un Anime**:
  ```bash
  manga-cli sources new nome-fonte --anime
  ```

Il file verrà creato automaticamente in `~/.config/manga-cli/providers/<nome-fonte>.js`.

#### 📥 Aggiungere un Plugin da file locale o da URL (`add`)
Se hai scritto un tuo script o vuoi scaricare un plugin condiviso da un amico o da GitHub:
```bash
# Da file locale
manga-cli sources add ./mio-plugin.js

# Da URL remoto
manga-cli sources add https://raw.githubusercontent.com/utente/repo/main/fonte.js
```

#### 📂 Mostrare il percorso della cartella Plugin (`path`)
```bash
manga-cli sources path
```

---

## 3. Visualizzare i Cataloghi (Anime & Manga)

`manga-cli` include opzioni dedicate per mostrare a terminale l'intero catalogo dei titoli disponibili, raggruppati ordinatamente per fonte, completi di conteggio titoli, lingue e audio supportati:

### 🎬 1. Mostrare l'intero catalogo Anime (tutte le fonti)
```bash
manga-cli --catalog-anime
# oppure con sottocomando o flag combinato
manga-cli catalog anime
manga-cli -a --catalog
```

### 📖 2. Mostrare l'intero catalogo Manga (tutte le fonti)
```bash
manga-cli --catalog-manga
# oppure con sottocomando o flag combinato
manga-cli catalog manga
manga-cli -m --catalog
```

### 🎯 3. Mostrare il catalogo (Anime o Manga) di una SPECIFICA fonte
Aggiungi semplicemente `--source <id>` (o `-s <id>`):
```bash
# Catalogo anime di AnimeWorld
manga-cli --catalog-anime --source animeworld
# oppure
manga-cli catalog anime --source animeworld

# Catalogo manga di One Piece Power
manga-cli --catalog-manga --source onepiecepower

# Catalogo manga di Mangapill
manga-cli --catalog-manga --source mangapill
```

### 📦 4. Mostrare il catalogo (sia Anime che Manga) di una SPECIFICA fonte
Se la fonte ha sia anime che manga (o vuoi consultare tutto ciò che offre quel provider):
```bash
manga-cli --catalog --source onepiecepower
manga-cli catalog --source animeworld
```

### 🌐 5. Mostrare l'intero catalogo Anime E Manga di TUTTE le fonti
Stampa la panoramica completa aggregata di tutti i provider attivi:
```bash
manga-cli --catalog
# oppure
manga-cli catalog
```

---

## 4. Filtrare per Fonte durante le Ricerche

Quando effettui ricerche o avvii la lettura/visione, puoi specificare la fonte con l'opzione `-s` / `--source`:

```bash
# Cerca solo su MangaDex
manga-cli "berserk" -m -l it --source mangadex

# Cerca solo su Mangapill (in inglese)
manga-cli "naruto" -m -l en --source mangapill

# Cerca usando la tua nuova fonte personalizzata
manga-cli "bleach" -m --source mia-fonte-manga

# Guarda un anime usando la tua fonte personalizzata
manga-cli "attack on titan" -a --source mia-fonte-anime
```

Se non specifichi `--source`, `manga-cli` interroga **tutti** i provider attivi compatibili con la lingua selezionata ed unisce i risultati.

---

## 5. Creare una Fonte Manga

Ogni fonte manga esporta una funzione che riceve la classe base e le utility:

```javascript
/**
 * File: ~/.config/manga-cli/providers/mia-fonte.js
 */
module.exports = ({ BaseMangaProvider, cheerio, fetchHtml, fetchJson }) => {
  return class MiaFonteManga extends BaseMangaProvider {
    constructor() {
      super('Mia Fonte Manga', 'https://miosito.com', {
        id: 'mia-fonte', // ID univoco per la CLI
        languages: ['it'], // Lingue supportate: 'it', 'en', 'es', 'all', ecc.
      });
    }

    /**
     * 1. Cerca il manga per titolo o parola chiave
     * @returns {Promise<Array<{ id: string, title: string, url: string, author?: string, genres?: string }>>}
     */
    async search(query, lang = null) {
      const searchUrl = `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
      const html = await this.fetchHtml(searchUrl);
      const $ = this.cheerio.load(html);
      const results = [];

      $('.manga-card').each((_, el) => {
        const link = $(el).find('a').attr('href');
        const title = $(el).find('.title').text().trim();
        if (link && title) {
          results.push({
            id: link,
            title: title,
            url: link.startsWith('http') ? link : `${this.baseUrl}${link}`,
            author: $(el).find('.author').text().trim() || 'N/A'
          });
        }
      });

      return results;
    }

    /**
     * 2. Estrai la lista di tutti i capitoli del manga
     * @returns {Promise<Array<{ id: string, title: string, url: string, number?: number|string }>>}
     */
    async getChapters(mangaUrl, lang = null) {
      const html = await this.fetchHtml(mangaUrl);
      const $ = this.cheerio.load(html);
      const chapters = [];

      $('.chapter-row a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (href) {
          chapters.push({
            id: href,
            title: text || 'Capitolo',
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`
          });
        }
      });

      // Ordina i capitoli in ordine crescente (es. 1, 2, 3...)
      return chapters.reverse();
    }

    /**
     * 3. Estrai gli URL delle immagini per le pagine del capitolo
     * @returns {Promise<{ title?: string, pages: Array<string> }>}
     */
    async getChapterPages(chapterUrl) {
      const html = await this.fetchHtml(chapterUrl);
      const $ = this.cheerio.load(html);
      const pages = [];

      $('.reader-images img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src) {
          pages.push(src.startsWith('http') ? src : `${this.baseUrl}${src}`);
        }
      });

      return {
        pages
      };
    }
  };
};
```

---

## 6. Creare una Fonte Anime

Per una fonte Anime, estendi `BaseAnimeProvider` e implementi la risoluzione dello stream video (`.mp4`, `.m3u8` HLS, ecc.):

```javascript
/**
 * File: ~/.config/manga-cli/providers/mio-anime.js
 */
module.exports = ({ BaseAnimeProvider, cheerio, fetchHtml, fetchJson }) => {
  return class MioAnimeProvider extends BaseAnimeProvider {
    constructor() {
      super('Mio Anime Stream', 'https://anime-streaming.example', {
        id: 'mio-anime',
        languages: ['it'],
      });
    }

    /**
     * 1. Cerca l'anime nel catalogo
     * @returns {Promise<Array<{ id: string, title: string, url: string, audio?: 'ita'|'subita'|'both' }>>}
     */
    async search(query, lang = null) {
      const html = await this.fetchHtml(`${this.baseUrl}/cerca?q=${encodeURIComponent(query)}`);
      const $ = this.cheerio.load(html);
      const results = [];

      $('.anime-item').each((_, el) => {
        const a = $(el).find('a');
        results.push({
          id: a.attr('href'),
          title: $(el).find('.title').text().trim(),
          url: a.attr('href'),
          audio: 'subita' // 'ita', 'subita' o 'both'
        });
      });

      return results;
    }

    /**
     * 2. Estrai la lista di tutti gli episodi
     * @returns {Promise<Array<{ id: string, title: string, url: string }>>}
     */
    async getEpisodes(animeUrl) {
      const html = await this.fetchHtml(animeUrl);
      const $ = this.cheerio.load(html);
      const episodes = [];

      $('.episode-list a').each((_, el) => {
        const num = $(el).attr('data-number') || $(el).text().trim();
        episodes.push({
          id: num,
          title: `Episodio ${num}`,
          url: $(el).attr('href')
        });
      });

      return episodes;
    }

    /**
     * 3. Risolvi il link diretto al video (.mp4, HLS m3u8 o stream)
     * @returns {Promise<{ streamUrl: string|null, availableAudios?: string[] }>}
     */
    async getEpisodeStream(episodeUrl, preferredAudio = 'subita') {
      const html = await this.fetchHtml(episodeUrl);
      const $ = this.cheerio.load(html);

      // Cerca il tag video o l'iframe dell'embed
      const videoSrc = $('video source').attr('src') || $('video').attr('src');

      return {
        streamUrl: videoSrc || null,
        availableAudios: ['subita']
      };
    }
  };
};
```

---

## 7. Utility Incluse

I plugin hanno accesso a metodi ereditati dalla classe base:

| Metodo | Descrizione |
|---|---|
| `this.fetchHtml(url, referer)` | Scarica il codice HTML usando cURL con **DoH (DNS over HTTPS Cloudflare 1.1.1.1)** per evitare blocchi ISP e filtri regionali. |
| `this.fetchJson(url, referer)` | Scarica e parsa automaticamente una risposta JSON da API REST. |
| `this.checkUrlExists(url)` | Invia una richiesta `HEAD` veloce per verificare se un link è attivo (HTTP 200). |
| `this.cheerio` | Istanza integrata della libreria `cheerio` (sintassi jQuery) per fare scraping di selettori CSS. |
| `this.getCatalog(lang)` | (Opzionale) Restituisce la lista/catalogo completo di titoli offerti dalla fonte. Se non definito, effettua una ricerca a vuoto. |
| `this.baseUrl` | L'URL base configurato nel costruttore. |

---

## 8. Test e Risoluzione Problemi

1. **Verificare se il plugin viene caricato**:
   ```bash
   manga-cli sources list
   ```
   Se nel file è presente un errore di sintassi, il comando elencherà il problema in rosso con il messaggio d'errore preciso.

2. **Testare la ricerca senza aprire lettori o player**:
   ```bash
   manga-cli --list -m --source tuo-id "titolo"
   ```

3. **Verificare solo il link di streaming (estrazione URL)**:
   ```bash
   manga-cli "one piece" -a -e 1 -g --source tuo-id
   ```
   L'opzione `-g` stampa direttamente il link del video a video e termina, utile per debug.
