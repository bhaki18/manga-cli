#!/usr/bin/env node

const path = require('path');
const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { spawn } = require('child_process');

const { ProviderManager } = require('./providers');

const MangaViewer = require('./viewer/reader');
const AnimePlayer = require('./viewer/player');

const { LANGUAGES, getLanguageName, getLanguageFlag } = require('./utils/languages');
const {
  isChapterRead,
  markChapterRead,
  getLastReadManga,
  getNextChapterToRead,
  isEpisodeWatched,
  markEpisodeWatched,
  getLastWatchedAnime,
  getNextEpisodeToWatch,
  clearHistory,
  getAllHistory,
  findHistoryKey,
  removeHistoryEntry,
  setMangaProgress,
  setAnimeProgress,
  unmarkChapter,
  unmarkEpisode,
  markAllMangaChaptersUpTo,
  markAllAnimeEpisodesUpTo,
  extractNumber,
  loadHistory
} = require('./utils/history');

const {
  downloadMangaChapter,
  downloadAnimeEpisode
} = require('./utils/downloader');

// Register autocomplete prompt in inquirer
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

const program = new Command();
const providerManager = new ProviderManager();

const mangaViewer = new MangaViewer();
const animePlayer = new AnimePlayer();

program
  .name('manga-cli')
  .description('Universal Terminal CLI to read Manga and stream Anime with instant playback, downloading, and RAM caching')
  .version('2.1.0')
  .argument('[query...]', 'Search manga or anime by title (or subcommand: watch, read, download, history, random, sources, info)')
  // Target mode
  .option('-a, --anime', 'Watch anime stream')
  .option('-m, --manga', 'Read manga chapters')
  .option('-s, --source <id>', 'Filter search or selection to a specific source/provider ID (e.g. mangadex, onepiecepower, mangapill)')
  .option('-l, --lang <language>', 'Filter by scan/catalog language code (e.g. it, en, es, fr, ja)', null)
  .option('--dub', 'Prefer Italian dubbed audio (ITA) for anime')
  .option('--sub', 'Prefer Italian subtitled audio (SUB ITA) for anime')
  // Direct selection
  .option('-e, --episode <number>', 'Direct episode number to stream or download')
  .option('-C, --chapter <number>', 'Direct chapter number to read or download')
  // Actions
  .option('-d, --download [dir]', 'Download chapter pages or anime episode .mp4 for offline viewing')
  .option('-g, --get-url', 'Print direct streaming URL or page URLs to stdout and exit (script-friendly)')
  .option('-H, --history', 'Display read/watched history with interactive resume')
  .option('-r, --random', 'Pick and open a random manga or anime title')
  .option('-i, --info', 'Display title metadata and total chapters/episodes without opening player')
  .option('--list', 'List all matching titles from catalog and exit')
  .option('--catalog', 'Display catalog of titles (supports --anime, --manga, --source, --lang)')
  .option('--catalog-anime', 'Display full anime catalog (or for a specific source with --source)')
  .option('--catalog-manga', 'Display full manga catalog (or for a specific source with --source)')
  // History editing & management
  .option('--set-chapter <number>', 'Set last read manga chapter progress directly')
  .option('--set-episode <number>', 'Set last watched anime episode progress directly')
  .option('--unmark <number>', 'Unmark/remove specific chapter or episode from history (e.g. --unmark 10)')
  .option('--remove-history', 'Remove specified title from reading/watch history')
  .option('--edit-history', 'Open interactive history editor and progress manager')
  // Player & Viewer options
  .option('-p, --player <name>', 'Force specific media player (e.g. mpv, vlc, ffplay, xdg-open)')
  .option('-v, --viewer <name>', 'Force specific image viewer (e.g. feh, sxiv, imv, mpv, loupe)')
  .option('-f, --fullscreen', 'Launch player or viewer in fullscreen mode')
  // State
  .option('-c, --continue', 'Automatically continue reading / watching from next unread chapter or episode')
  .option('-D, --delete', 'Clear read chapters and watched anime history')

  .action(async (queryArgs, options) => {
    try {
      // 0. Subcommand alias resolution
      const parts = Array.isArray(queryArgs) ? queryArgs : (queryArgs ? [queryArgs] : []);
      const firstArg = (parts[0] || '').toLowerCase().trim();
      let subQuery = parts.slice(1).join(' ') || null;
      let query = parts.join(' ') || null;

      if (firstArg === 'history' || firstArg === 'hist') {
        options.history = true;
        query = null;
      } else if (firstArg === 'edit-history' || firstArg === 'edit') {
        options.editHistory = true;
        query = subQuery;
      } else if (firstArg === 'random' || firstArg === 'rand') {
        options.random = true;
        query = null;
      } else if (firstArg === 'watch' || firstArg === 'anime') {
        options.anime = true;
        query = subQuery;
      } else if (firstArg === 'read' || firstArg === 'manga') {
        options.manga = true;
        query = subQuery;
      } else if (firstArg === 'download' || firstArg === 'dl') {
        options.download = true;
        query = subQuery;
      } else if (firstArg === 'info') {
        options.info = true;
        query = subQuery;
      } else if (firstArg === 'sources' || firstArg === 'source' || firstArg === 'providers' || firstArg === 'provider') {
        const sourceAction = parts[1] || 'list';
        const extraArgs = parts.slice(2);
        await handleSourcesCommand(sourceAction, extraArgs, options);
        return;
      } else if (firstArg === 'catalog' || firstArg === 'catalogo') {
        options.catalog = true;
        const sub = (parts[1] || '').toLowerCase().trim();
        if (sub === 'anime' || sub === '-a') {
          options.anime = true;
        } else if (sub === 'manga' || sub === '-m') {
          options.manga = true;
        }
      }

      // Catalog handling (full, manga, anime, or filtered by source)
      if (options.catalogAnime) {
        options.catalog = true;
        options.anime = true;
      }
      if (options.catalogManga) {
        options.catalog = true;
        options.manga = true;
      }
      if (options.catalog) {
        await handleCatalogCommand(options);
        return;
      }

      // Direct command to remove title from history
      if (options.removeHistory) {
        const target = query || process.argv[3];
        if (!target) {
          console.log(chalk.red('❌ Please specify a title to remove from history (e.g. manga-cli "berserk" --remove-history)'));
          process.exit(1);
        }
        const mediaType = options.anime ? 'anime' : (options.manga ? 'manga' : null);
        const removed = removeHistoryEntry(target, mediaType);
        if (removed) {
          console.log(chalk.green(`✔ Successfully removed "${target}" from history.`));
        } else {
          console.log(chalk.yellow(`ℹ️ Title "${target}" was not found in history.`));
        }
        process.exit(0);
      }

      // Direct command to set manga chapter progress
      if (options.setChapter) {
        const target = query || process.argv[3];
        if (!target) {
          console.log(chalk.red('❌ Please specify a manga title (e.g. manga-cli "one piece" -m --set-chapter 1050)'));
          process.exit(1);
        }
        const chNum = parseFloat(options.setChapter);
        if (isNaN(chNum) || chNum <= 0) {
          console.log(chalk.red('❌ Please provide a valid chapter number'));
          process.exit(1);
        }

        const existingKey = findHistoryKey(target, 'manga');
        if (!existingKey) {
          const spin = ora(`Searching catalog for "${target}"...`).start();
          const results = await providerManager.searchManga(target, options.lang || 'it');
          spin.stop();
          if (results && results.length > 0) {
            setMangaProgress(results[0].url, results[0].title, chNum, results[0]);
            console.log(chalk.green(`✔ Manga progress updated: "${results[0].title}" set to Chapter ${chNum}!`));
            process.exit(0);
          }
        }

        setMangaProgress(target, target, chNum);
        console.log(chalk.green(`✔ Manga progress updated: "${target}" set to Chapter ${chNum}!`));
        process.exit(0);
      }

      // Direct command to set anime episode progress
      if (options.setEpisode) {
        const target = query || process.argv[3];
        if (!target) {
          console.log(chalk.red('❌ Please specify an anime title (e.g. anime-cli "one piece" --set-episode 1071)'));
          process.exit(1);
        }
        const epNum = parseInt(options.setEpisode, 10);
        if (isNaN(epNum) || epNum <= 0) {
          console.log(chalk.red('❌ Please provide a valid episode number'));
          process.exit(1);
        }

        const existingKey = findHistoryKey(target, 'anime');
        if (!existingKey) {
          const spin = ora(`Searching catalog for "${target}"...`).start();
          const results = await providerManager.searchAnime(target, options.lang);
          spin.stop();
          if (results && results.length > 0) {
            setAnimeProgress(results[0].url, results[0].title, epNum, results[0]);
            console.log(chalk.green(`✔ Anime progress updated: "${results[0].title}" set to Episode ${epNum}!`));
            process.exit(0);
          }
        }

        setAnimeProgress(target, target, epNum);
        console.log(chalk.green(`✔ Anime progress updated: "${target}" set to Episode ${epNum}!`));
        process.exit(0);
      }

      // Direct command to unmark chapter or episode
      if (options.unmark) {
        const target = query || process.argv[3];
        if (!target) {
          console.log(chalk.red('❌ Please specify a title to unmark from (e.g. anime-cli "dr. stone" --unmark 10)'));
          process.exit(1);
        }
        const isAnimeBinary = path.basename(process.argv[1] || '').includes('anime');
        const isAnimeTarget = options.anime || isAnimeBinary;
        let count = 0;
        if (isAnimeTarget) {
          count = unmarkEpisode(target, options.unmark);
          if (count > 0) {
            console.log(chalk.green(`✔ Unmarked episode ${options.unmark} from "${target}".`));
          } else {
            console.log(chalk.yellow(`ℹ️ Episode ${options.unmark} not found in history for "${target}".`));
          }
        } else {
          count = unmarkChapter(target, options.unmark);
          if (count > 0) {
            console.log(chalk.green(`✔ Unmarked chapter ${options.unmark} from "${target}".`));
          } else {
            console.log(chalk.yellow(`ℹ️ Chapter ${options.unmark} not found in history for "${target}".`));
          }
        }
        process.exit(0);
      }

      // 1. History view or edit command
      if (options.history || options.editHistory) {
        await handleHistoryFlow(options);
        process.exit(0);
      }

      // 2. Handle deletion of history
      if (options.delete) {
        if (options.anime) {
          clearHistory('anime');
          console.log(chalk.green('✔ Watched anime history deleted successfully.'));
        } else if (options.manga) {
          clearHistory('manga');
          console.log(chalk.green('✔ Read manga history deleted successfully.'));
        } else {
          const deleteChoice = await inquirer.prompt([
            {
              type: 'list',
              name: 'target',
              message: '🗑️ Which history would you like to delete?',
              choices: [
                { name: '🔥 All History (Manga & Anime)', value: 'all' },
                { name: '📖 Read Manga chapters only', value: 'manga' },
                { name: '🎬 Watched Anime episodes only', value: 'anime' },
                { name: '❌ Cancel', value: 'cancel' }
              ]
            }
          ]);
          if (deleteChoice.target !== 'cancel') {
            clearHistory(deleteChoice.target);
            console.log(chalk.green('✔ History cleared successfully.'));
          }
        }
        process.exit(0);
      }

      // Banner (suppressed in script-friendly get-url mode)
      if (!options.getUrl) {
        console.log(chalk.bold.cyan('\n  📖 MANGA-CLI 2.0 - Universal Terminal Manga & Anime Hub 🎬\n'));
      }

      // Check if invoked via 'anime-cli' symlink
      const isAnimeBinary = path.basename(process.argv[1] || '').includes('anime');
      let mode = null;

      if (options.anime || isAnimeBinary) {
        mode = 'anime';
      } else if (options.manga) {
        mode = 'manga';
      }

      // If user typed `-c` / `--continue` with no mode specified, auto-detect from recent activity
      if (!mode && options.continue) {
        const lastManga = getLastReadManga();
        const lastAnime = getLastWatchedAnime();

        if (lastManga && lastAnime) {
          const mangaTime = new Date(lastManga.lastReadAt || 0).getTime();
          const animeTime = new Date(lastAnime.lastWatchedAt || 0).getTime();
          mode = animeTime >= mangaTime ? 'anime' : 'manga';
        } else if (lastAnime) {
          mode = 'anime';
        } else if (lastManga) {
          mode = 'manga';
        }
      }

      // If still no mode determined, prompt interactively (or check options)
      if (!mode) {
        if (options.getUrl || options.info || options.list) {
          // Default to manga if not specified
          mode = 'manga';
        } else if (query) {
          const modePrompt = await inquirer.prompt([
            {
              type: 'list',
              name: 'mode',
              message: `Search "${query}" as:`,
              choices: [
                { name: '📖 Manga (Read online with RAM caching)', value: 'manga' },
                { name: '🎬 Anime (Stream directly in MPV player)', value: 'anime' }
              ]
            }
          ]);
          mode = modePrompt.mode;
        } else {
          const modePrompt = await inquirer.prompt([
            {
              type: 'list',
              name: 'mode',
              message: 'What would you like to do?',
              choices: [
                { name: '📖 Read Manga (Leggi Manga)', value: 'manga' },
                { name: '🎬 Watch Anime (Guarda Anime)', value: 'anime' },
                { name: '📜 View Reading / Watch History (Cronologia)', value: 'history' },
                { name: '🎲 Pick Random Manga or Anime (Casuale)', value: 'random' }
              ]
            }
          ]);

          if (modePrompt.mode === 'history') {
            await handleHistoryFlow(options);
            process.exit(0);
          } else if (modePrompt.mode === 'random') {
            options.random = true;
            mode = Math.random() > 0.5 ? 'anime' : 'manga';
          } else {
            mode = modePrompt.mode;
          }
        }
      }

      // Dispatch to corresponding flow
      if (mode === 'anime') {
        await handleAnimeFlow(query, options);
      } else {
        await handleMangaFlow(query, options);
      }

      if (!options.getUrl) {
        console.log(chalk.cyan('\nThank you for using manga-cli! See you next time. 👋'));
      }
    } catch (err) {
      if (err.name === 'ExitPromptError') {
        console.log(chalk.yellow('\nOperation cancelled.'));
      } else {
        console.error(chalk.red(`\nUnexpected error: ${err.message}`));
      }
      mangaViewer.cleanUp();
      animePlayer.kill();
      process.exit(0);
    }
  });

// ====================================================================
// HISTORY FLOW
// ====================================================================
async function handleHistoryFlow(options) {
  let inHistoryLoop = true;

  while (inHistoryLoop) {
    const allHistory = getAllHistory();

    console.log(chalk.bold.cyan('\n  📜 MANGA & ANIME HISTORY MANAGER\n'));

    if (allHistory.length === 0) {
      console.log(chalk.yellow('ℹ️ No reading or watch history found.\n'));
      return;
    }

    // Display summary table
    allHistory.slice(0, 15).forEach(item => {
      const isAnime = item.type === 'anime';
      const badge = isAnime ? chalk.bgMagenta.bold(' ANIME ') : chalk.bgBlue.bold(' MANGA ');
      const countLabel = isAnime ? `${item.count} eps watched` : `${item.count} chapters read`;
      const lastDate = item.lastAccessedAt ? new Date(item.lastAccessedAt).toLocaleDateString() : '';

      console.log(`${badge} ${chalk.bold(item.title)}`);
      console.log(`       ${chalk.dim(`Last: ${item.lastItem || 'N/A'}`)} | ${chalk.green(countLabel)} | ${chalk.dim(lastDate)}`);
    });

    console.log('');

    // Interactive menu
    const historyChoices = allHistory.map(item => {
      const icon = item.type === 'anime' ? '🎬' : '📖';
      return {
        name: `${icon} ${item.title} ${chalk.dim(`(Last: ${item.lastItem || 'N/A'})`)}`,
        value: item
      };
    });
    historyChoices.push(new inquirer.Separator('── Actions ──'));
    historyChoices.push({ name: '🗑️  Clear All History (Svuota tutta la cronologia)', value: '__clear_all__' });
    historyChoices.push({ name: '🚪 Exit (Esci)', value: '__exit__' });

    const choice = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'selected',
        message: 'Select a title to manage / resume (or exit):',
        pageSize: 12,
        source: async (answersSoFar, input) => {
          if (!input) return historyChoices;
          const clean = input.toLowerCase();
          return historyChoices.filter(c => c.name && c.name.toLowerCase().includes(clean));
        }
      }
    ]);

    if (!choice.selected || choice.selected === '__exit__') {
      inHistoryLoop = false;
      break;
    }

    if (choice.selected === '__clear_all__') {
      const confirmClear = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'yes',
          message: 'Are you sure you want to delete ALL reading and watch history?',
          default: false
        }
      ]);
      if (confirmClear.yes) {
        clearHistory('all');
        console.log(chalk.green('✔ All history deleted successfully.\n'));
      }
      continue;
    }

    // A specific title was selected!
    const item = choice.selected;
    const isAnime = item.type === 'anime';
    const mediaLabel = isAnime ? 'Anime' : 'Manga';

    console.log(chalk.cyan(`\nManaging: ${chalk.bold(item.title)} [${mediaLabel}]`));
    console.log(chalk.dim(`Current progress: ${item.lastItem || 'None'} (${item.count} recorded in history)`));

    const titleAction = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `What would you like to do with "${item.title}"?`,
        choices: [
          { name: `▶️  Resume ${isAnime ? 'watching' : 'reading'} (Riprendi)`, value: 'resume' },
          { name: `✏️  Set last ${isAnime ? 'episode' : 'chapter'} number (Imposta progresso)`, value: 'set_progress' },
          { name: `✅ Mark all ${isAnime ? 'episodes' : 'chapters'} up to number N as ${isAnime ? 'watched' : 'read'}`, value: 'mark_range' },
          { name: `❌ Unmark specific ${isAnime ? 'episodes' : 'chapters'} (Deseleziona singoli)`, value: 'unmark_items' },
          { name: `🗑️  Remove this title from history (Elimina dalla cronologia)`, value: 'remove_title' },
          { name: `↩️  Back to history list (Torna indietro)`, value: 'back' }
        ]
      }
    ]);

    if (titleAction.action === 'resume') {
      if (isAnime) {
        await handleAnimeFlow(null, { ...options, continue: true, resumeItem: item });
      } else {
        await handleMangaFlow(null, { ...options, continue: true, resumeItem: item });
      }
      inHistoryLoop = false;
    } else if (titleAction.action === 'set_progress') {
      const numAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'num',
          message: `Enter the ${isAnime ? 'episode' : 'chapter'} number you reached (e.g. 25, 1050):`,
          validate: val => {
            const n = parseFloat(val);
            return !isNaN(n) && n > 0 ? true : 'Please enter a valid positive number';
          }
        }
      ]);
      const targetNum = parseFloat(numAnswer.num);
      if (isAnime) {
        setAnimeProgress(item.storageKey || item.key, item.title, targetNum, { url: item.url, source: item.source, language: item.language });
      } else {
        setMangaProgress(item.storageKey || item.key, item.title, targetNum, { url: item.url, source: item.source, language: item.language });
      }
      console.log(chalk.green(`✔ Progress for "${item.title}" set to ${isAnime ? 'Episode' : 'Chapter'} ${targetNum}!\n`));
    } else if (titleAction.action === 'mark_range') {
      const rangeAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'num',
          message: `Mark all ${isAnime ? 'episodes' : 'chapters'} as ${isAnime ? 'watched' : 'read'} up to number:`,
          validate: val => {
            const n = parseFloat(val);
            return !isNaN(n) && n > 0 ? true : 'Please enter a valid positive number';
          }
        }
      ]);
      const targetNum = parseFloat(rangeAnswer.num);
      const spinner = ora(`Fetching ${isAnime ? 'episodes' : 'chapters'} list...`).start();

      let count = 0;
      try {
        if (isAnime) {
          if (!item.url || !item.url.startsWith('http')) {
            const searchRes = await providerManager.searchAnime(item.title);
            if (searchRes && searchRes.length > 0) {
              item.url = searchRes[0].url;
              item.source = searchRes[0].source;
            }
          }
          const animeProv = providerManager.getAnimeProvider(item.source);
          const eps = await animeProv.getEpisodes(item.url);
          spinner.stop();
          count = markAllAnimeEpisodesUpTo(item.storageKey || item.key, item.title, eps, targetNum, { url: item.url, source: item.source, language: item.language });
        } else {
          if (!item.url || !item.url.startsWith('http')) {
            const searchRes = await providerManager.searchManga(item.title, item.language || 'it');
            if (searchRes && searchRes.length > 0) {
              item.url = searchRes[0].url;
              item.source = searchRes[0].source;
            }
          }
          const mangaProv = providerManager.getMangaProvider(item.source);
          const chs = await mangaProv.getChapters(item.url, item.language);
          spinner.stop();
          count = markAllMangaChaptersUpTo(item.storageKey || item.key, item.title, chs, targetNum, { url: item.url, source: item.source, language: item.language });
        }
        console.log(chalk.green(`✔ Marked ${count} ${isAnime ? 'episodes' : 'chapters'} up to #${targetNum} as ${isAnime ? 'watched' : 'read'}!\n`));
      } catch (err) {
        if (spinner) spinner.stop();
        console.log(chalk.red(`❌ Could not fetch list to mark range: ${err.message}\n`));
      }
    } else if (titleAction.action === 'unmark_items') {
      const historyData = loadHistory();
      const currentEntry = historyData[item.storageKey] || historyData[item.key];
      const itemsList = isAnime
        ? (currentEntry ? currentEntry.watchedEpisodes || [] : [])
        : (currentEntry ? currentEntry.readChapters || [] : []);

      if (itemsList.length === 0) {
        console.log(chalk.yellow(`ℹ️ No ${isAnime ? 'episodes' : 'chapters'} recorded for this title.\n`));
        continue;
      }

      // Sort items descending so the latest are on top
      const sortedItems = [...itemsList].sort((a, b) => {
        const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
        const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
        return nB - nA;
      });

      const latestItem = sortedItems[0];
      const latestLabel = latestItem.title || (isAnime ? `Episodio ${latestItem.id}` : `Capitolo ${latestItem.id}`);

      const unmarkMethod = await inquirer.prompt([
        {
          type: 'list',
          name: 'mode',
          message: `How would you like to unmark ${isAnime ? 'episodes' : 'chapters'} from "${item.title}"?`,
          choices: [
            { name: `⏪ Unmark only latest (${latestLabel})`, value: 'latest' },
            { name: `🔢 Enter ${isAnime ? 'episode' : 'chapter'} number(s) directly (e.g. 10 or 5, 8, 12)`, value: 'by_number' },
            { name: `📋 Select from checklist (Spunta gli elementi da rimuovere)`, value: 'checklist' },
            { name: '↩️  Cancel (Annulla)', value: 'cancel' }
          ]
        }
      ]);

      if (unmarkMethod.mode === 'cancel') {
        continue;
      }

      let removedCount = 0;

      if (unmarkMethod.mode === 'latest') {
        if (isAnime) {
          removedCount = unmarkEpisode(item.storageKey || item.key, latestItem);
        } else {
          removedCount = unmarkChapter(item.storageKey || item.key, latestItem);
        }
        if (removedCount > 0) {
          console.log(chalk.green(`✔ Unmarked latest item: "${latestLabel}"!\n`));
        }
      } else if (unmarkMethod.mode === 'by_number') {
        const numPrompt = await inquirer.prompt([
          {
            type: 'input',
            name: 'nums',
            message: `Enter ${isAnime ? 'episode' : 'chapter'} number(s) to unmark (comma-separated, e.g. 10 or 5, 8, 12):`,
            validate: val => val.trim().length > 0 ? true : 'Please enter at least one number'
          }
        ]);
        const numParts = numPrompt.nums.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
        if (isAnime) {
          removedCount = unmarkEpisode(item.storageKey || item.key, numParts);
        } else {
          removedCount = unmarkChapter(item.storageKey || item.key, numParts);
        }
        console.log(chalk.green(`✔ Removed ${removedCount} ${isAnime ? 'episodes' : 'chapters'} from history.\n`));
      } else if (unmarkMethod.mode === 'checklist') {
        const unmarkChoices = sortedItems.map(e => ({
          name: e.title || (isAnime ? `Episodio ${e.id}` : `Capitolo ${e.id}`),
          value: e
        }));

        const unmarkPrompt = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'toRemove',
            message: `Select ${isAnime ? 'episodes' : 'chapters'} to remove from history (spacebar to select):`,
            choices: unmarkChoices,
            pageSize: 14
          }
        ]);

        if (unmarkPrompt.toRemove && unmarkPrompt.toRemove.length > 0) {
          if (isAnime) {
            removedCount = unmarkEpisode(item.storageKey || item.key, unmarkPrompt.toRemove);
          } else {
            removedCount = unmarkChapter(item.storageKey || item.key, unmarkPrompt.toRemove);
          }
          console.log(chalk.green(`✔ Removed ${removedCount} ${isAnime ? 'episodes' : 'chapters'} from history.\n`));
        }
      }
    } else if (titleAction.action === 'remove_title') {
      const confirmRemove = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'yes',
          message: `Are you sure you want to remove "${item.title}" from history?`,
          default: true
        }
      ]);
      if (confirmRemove.yes) {
        removeHistoryEntry(item.storageKey);
        console.log(chalk.green(`✔ "${item.title}" removed from history.\n`));
      }
    }
  }
}

// ====================================================================
// CATALOG FLOW
// ====================================================================
async function handleCatalogCommand(options) {
  let type = 'all';
  if (options.anime && !options.manga) type = 'anime';
  else if (options.manga && !options.anime) type = 'manga';

  let typeDesc = 'completo (Manga & Anime)';
  if (type === 'anime') typeDesc = 'Anime';
  if (type === 'manga') typeDesc = 'Manga';

  const sourceDesc = options.source ? ` [Fonte: ${options.source}]` : ' [Tutte le fonti]';
  const langDesc = options.lang ? ` [Lingua: ${options.lang.toUpperCase()}]` : '';

  const spinner = ora(`Caricamento catalogo ${typeDesc}${sourceDesc}${langDesc}...`).start();

  try {
    const catalog = await providerManager.getFullCatalog({
      type,
      source: options.source,
      lang: options.lang
    });
    spinner.stop();

    console.log(chalk.bold.cyan('\n📦 MANGA-CLI 2.0 - CATALOGO'));
    if (options.source) {
      console.log(chalk.gray(`Filtro fonte: ${options.source}`));
    }
    if (options.lang) {
      console.log(chalk.gray(`Filtro lingua: ${options.lang}`));
    }
    console.log();

    const mangaList = catalog.manga || [];
    const animeList = catalog.anime || [];

    // Manga section
    if (type === 'all' || type === 'manga') {
      console.log(chalk.bold.magenta(`═══════════════════════════════════════════════════════════`));
      console.log(chalk.bold.magenta(`📖 CATALOGO MANGA (${mangaList.length} titoli)`));
      console.log(chalk.bold.magenta(`═══════════════════════════════════════════════════════════`));

      if (mangaList.length === 0) {
        console.log(chalk.yellow('  (Nessun manga trovato per i filtri selezionati)\n'));
      } else {
        const grouped = {};
        for (const item of mangaList) {
          const src = item.sourceName || item.source || 'Built-in';
          if (!grouped[src]) grouped[src] = [];
          grouped[src].push(item);
        }

        for (const [srcName, items] of Object.entries(grouped)) {
          console.log(chalk.bold.yellow(`\n  📂 [${srcName}] • ${items.length} titoli:`));
          items.forEach((item, idx) => {
            const langBadge = item.language ? chalk.dim(`[${item.language.toUpperCase()}]`) : '';
            const genres = item.genres ? chalk.gray(`(${item.genres.slice(0, 45)})`) : '';
            console.log(`    ${chalk.dim(String(idx + 1).padStart(4, ' '))}. ${chalk.bold(item.title)} ${langBadge} ${genres}`);
          });
        }
        console.log();
      }
    }

    // Anime section
    if (type === 'all' || type === 'anime') {
      console.log(chalk.bold.cyan(`═══════════════════════════════════════════════════════════`));
      console.log(chalk.bold.cyan(`🎬 CATALOGO ANIME (${animeList.length} titoli)`));
      console.log(chalk.bold.cyan(`═══════════════════════════════════════════════════════════`));

      if (animeList.length === 0) {
        console.log(chalk.yellow('  (Nessun anime trovato per i filtri selezionati)\n'));
      } else {
        const grouped = {};
        for (const item of animeList) {
          const src = item.sourceName || item.source || 'Built-in';
          if (!grouped[src]) grouped[src] = [];
          grouped[src].push(item);
        }

        for (const [srcName, items] of Object.entries(grouped)) {
          console.log(chalk.bold.yellow(`\n  📂 [${srcName}] • ${items.length} titoli:`));
          items.forEach((item, idx) => {
            let audioBadge = '';
            if (item.audio === 'both') audioBadge = chalk.yellow('[ITA/SUB]');
            else if (item.audio === 'ita') audioBadge = chalk.green('[ITA]');
            else if (item.audio === 'subita' || item.audio === 'sub') audioBadge = chalk.blue('[SUB ITA]');
            console.log(`    ${chalk.dim(String(idx + 1).padStart(4, ' '))}. ${chalk.bold(item.title)} ${audioBadge}`);
          });
        }
        console.log();
      }
    }

    // Summary
    console.log(chalk.green(`✔ Totale elementi catalogo: ${mangaList.length} manga, ${animeList.length} anime.\n`));
  } catch (err) {
    spinner.fail(`Errore durante il recupero del catalogo: ${err.message}`);
  }
}

// ====================================================================
// SOURCES MANAGEMENT FLOW
// ====================================================================
async function handleSourcesCommand(subAction, rawArgs, options) {
  const customDir = providerManager.getUserProvidersDir();
  const act = (subAction || 'list').toLowerCase();

  if (act === 'list' || act === 'ls') {
    console.log(chalk.bold.cyan('\n📦 manga-cli Sources & Providers\n'));

    console.log(chalk.bold.yellow('📖 Manga Providers:'));
    const mangaProv = providerManager.getMangaProviders();
    mangaProv.forEach(p => {
      const typeBadge = p.isCustom ? chalk.magenta('[Custom Plugin]') : chalk.blue('[Built-in]');
      const langs = (p.languages || ['all']).map(l => l.toUpperCase()).join(', ');
      console.log(`  • ${chalk.bold(p.name)} ${typeBadge}`);
      console.log(`    ${chalk.dim('ID:')} ${chalk.green(p.id)}  ${chalk.dim('|')}  ${chalk.dim('Languages:')} ${langs}  ${chalk.dim('|')}  ${chalk.dim('URL:')} ${p.baseUrl}`);
      if (p.isCustom && p.filePath) {
        console.log(`    ${chalk.dim('File:')} ${p.filePath}`);
      }
    });

    console.log(chalk.bold.yellow('\n📺 Anime Providers:'));
    const animeProv = providerManager.getAnimeProviders();
    animeProv.forEach(p => {
      const typeBadge = p.isCustom ? chalk.magenta('[Custom Plugin]') : chalk.blue('[Built-in]');
      const langs = (p.languages || ['all']).map(l => l.toUpperCase()).join(', ');
      console.log(`  • ${chalk.bold(p.name)} ${typeBadge}`);
      console.log(`    ${chalk.dim('ID:')} ${chalk.green(p.id)}  ${chalk.dim('|')}  ${chalk.dim('Languages:')} ${langs}  ${chalk.dim('|')}  ${chalk.dim('URL:')} ${p.baseUrl}`);
      if (p.isCustom && p.filePath) {
        console.log(`    ${chalk.dim('File:')} ${p.filePath}`);
      }
    });

    if (providerManager.errors.length > 0) {
      console.log(chalk.bold.red('\n⚠️ Errors loading custom plugins:'));
      providerManager.errors.forEach(e => {
        console.log(chalk.red(`  • ${e.file}: ${e.error}`));
      });
    }

    console.log(chalk.dim(`\n📁 Custom plugins directory: ${customDir}`));
    console.log(chalk.dim(`   Run 'manga-cli sources new <name>' to create a new source template.\n`));
    process.exit(0);
  }

  if (act === 'new' || act === 'create') {
    let name = rawArgs && rawArgs[0] ? rawArgs[0] : null;
    let type = options.anime ? 'anime' : (options.manga ? 'manga' : null);

    if (!name) {
      const ans = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Source display name (e.g. "My Anime Stream"):',
          validate: v => v.trim().length > 0 ? true : 'Please enter a name'
        },
        {
          type: 'list',
          name: 'type',
          message: 'What type of source is this?',
          choices: [
            { name: '📖 Manga (Chapters & Pages)', value: 'manga' },
            { name: '📺 Anime (Episodes & Video Stream)', value: 'anime' }
          ]
        }
      ]);
      name = ans.name;
      type = ans.type;
    } else if (!type) {
      type = 'manga';
    }

    try {
      const { targetPath, filename } = providerManager.createTemplate(name, type);
      console.log(chalk.green(`\n✔ Created new ${type} source template: ${chalk.bold(filename)}`));
      console.log(chalk.cyan(`📄 File path: ${targetPath}`));
      console.log(chalk.dim('\nYou can now edit this file with your favorite editor to add scraping logic!\n'));
    } catch (err) {
      console.log(chalk.red(`\n❌ Could not create template: ${err.message}\n`));
    }
    process.exit(0);
  }

  if (act === 'explore' || act === 'browse' || act === 'store') {
    const catalog = providerManager.getCommunityCatalog();
    if (catalog.length === 0) {
      console.log(chalk.yellow('\nℹ️ Nessuna estensione disponibile nel catalogo community al momento.\n'));
      process.exit(0);
    }

    console.log(chalk.bold.cyan('\n🏪 Community Sources Store'));
    console.log(chalk.dim('Seleziona le fonti che desideri installare con la barra spaziatrice e premi Invio:\n'));

    const choices = catalog.map(item => {
      const flag = item.languages.includes('it') ? '🇮🇹' : '🌍';
      const typeBadge = item.type === 'anime' ? chalk.magenta('[Anime]') : chalk.blue('[Manga]');
      const statusBadge = item.isInstalled ? chalk.green(' (Installato ✓)') : '';

      return {
        name: `${flag} ${typeBadge} ${chalk.bold(item.name)} - ${chalk.dim(item.description)}${statusBadge}`,
        value: item.id,
        checked: item.isInstalled
      };
    });

    const answer = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: 'Fonti disponibili:',
        choices
      }
    ]);

    if (!answer.selected || answer.selected.length === 0) {
      console.log(chalk.yellow('\nNessuna fonte selezionata.\n'));
      process.exit(0);
    }

    console.log('');
    for (const id of answer.selected) {
      try {
        const res = providerManager.installCommunitySource(id);
        console.log(chalk.green(`✔ Installata con successo: ${chalk.bold(res.entry.name)} (${res.entry.id})`));
      } catch (err) {
        console.log(chalk.red(`❌ Errore durante l'installazione di ${id}: ${err.message}`));
      }
    }
    console.log(chalk.cyan(`\n✨ Fonti pronte all'uso! Prova una ricerca con: manga-cli "titolo"\n`));
    process.exit(0);
  }

  if (act === 'install') {
    const target = rawArgs && rawArgs[0] ? rawArgs[0] : null;
    if (!target) {
      return handleSourcesCommand('explore', [], options);
    }

    // Se è un file locale o un URL web
    if (target.endsWith('.js') || target.startsWith('http://') || target.startsWith('https://') || target.includes('/') || target.includes('\\')) {
      try {
        const { targetPath, filename } = providerManager.addProviderFromFileOrUrl(target);
        console.log(chalk.green(`\n✔ Fonte installata con successo: ${chalk.bold(filename)}`));
        console.log(chalk.dim(`   Posizione: ${targetPath}\n`));
      } catch (err) {
        console.log(chalk.red(`\n❌ Impossibile installare la fonte: ${err.message}\n`));
      }
      process.exit(0);
    }

    // Altrimenti cerca per ID o nome nel catalogo community
    try {
      const res = providerManager.installCommunitySource(target);
      console.log(chalk.green(`\n✔ Fonte community installata con successo: ${chalk.bold(res.entry.name)}`));
      console.log(chalk.cyan(`   ID: ${res.entry.id} | Tipo: ${res.entry.type.toUpperCase()} | Lingue: ${res.entry.languages.join(', ').toUpperCase()}`));
      console.log(chalk.dim(`   ${res.entry.description}\n`));
    } catch (err) {
      console.log(chalk.red(`\n❌ Fonte "${target}" non trovata nel catalogo community.`));
      console.log(chalk.dim(`   Usa 'manga-cli sources explore' per sfogliare tutte le fonti disponibili.\n`));
    }
    process.exit(0);
  }

  if (act === 'update') {
    console.log(chalk.cyan('\n🔄 Verifica aggiornamenti fonti community...'));
    const updated = providerManager.updateCommunitySources();
    if (updated.length > 0) {
      console.log(chalk.green(`✔ Aggiornate ${updated.length} fonti all'ultima versione:`));
      updated.forEach(u => console.log(`  • ${chalk.bold(u.name)} (v${u.version})`));
    } else {
      console.log(chalk.green('✔ Tutte le fonti installate sono già aggiornate all\'ultima versione.'));
    }
    console.log('');
    process.exit(0);
  }

  if (act === 'add') {
    const target = rawArgs && rawArgs[0] ? rawArgs[0] : null;
    if (!target) {
      console.log(chalk.red('\n❌ Please specify a file path or URL to add (e.g. manga-cli sources add ./my-plugin.js)\n'));
      process.exit(1);
    }
    try {
      const { targetPath, filename } = providerManager.addProviderFromFileOrUrl(target);
      console.log(chalk.green(`\n✔ Successfully installed source: ${chalk.bold(filename)}`));
      console.log(chalk.dim(`   Location: ${targetPath}\n`));
    } catch (err) {
      console.log(chalk.red(`\n❌ Failed to add source: ${err.message}\n`));
    }
    process.exit(0);
  }

  if (act === 'remove' || act === 'rm' || act === 'delete') {
    const target = rawArgs && rawArgs[0] ? rawArgs[0] : null;
    if (!target) {
      console.log(chalk.red('\n❌ Please specify the ID or filename to remove (e.g. manga-cli sources remove my-source)\n'));
      process.exit(1);
    }
    const res = providerManager.removeProvider(target);
    if (res.success) {
      console.log(chalk.green(`\n✔ Removed source "${res.file}".\n`));
    } else {
      console.log(chalk.yellow(`\nℹ️ Custom source "${target}" was not found in ${customDir}.\n`));
    }
    process.exit(0);
  }

  if (act === 'path' || act === 'dir') {
    console.log(customDir);
    process.exit(0);
  }

  console.log(chalk.yellow(`Unknown sources command: ${act}`));
  console.log('Available commands: explore, install, update, list, new, add, remove, path');
  process.exit(1);
}

// ====================================================================
// ANIME FLOW
// ====================================================================
async function handleAnimeFlow(query, options) {
  let selectedAnime = options.resumeItem ? { ...options.resumeItem } : null;
  let selectedLang = options.lang ? options.lang.toLowerCase() : null;
  let chosenAnimeProvider = providerManager.getAnimeProvider(options.source);

  if (selectedAnime && selectedAnime.language && !selectedLang) {
    selectedLang = selectedAnime.language;
  }

  // 1. Random anime mode
  if (options.random) {
    const spinner = ora('Picking a random anime from catalog...').start();
    const randProv = (chosenAnimeProvider && typeof chosenAnimeProvider.getRandomAnime === 'function')
      ? chosenAnimeProvider
      : providerManager.getAnimeProvider('onepiecepower-anime');
    selectedAnime = await randProv.getRandomAnime(selectedLang);
    spinner.stop();
    if (!selectedAnime) {
      console.log(chalk.red('❌ Could not find an anime from the catalog.'));
      return;
    }
    console.log(chalk.green(`🎲 Random Anime picked: ${chalk.bold(selectedAnime.title)}!\n`));
  }

  // 2. Check auto-resume
  if (!selectedAnime && !query && options.continue) {
    const lastAnime = getLastWatchedAnime();
    const animeUrl = lastAnime ? (lastAnime.url || lastAnime.animeKey) : null;
    if (lastAnime && animeUrl) {
      if (!options.getUrl) {
        console.log(chalk.cyan(`🎬 [Auto-Resume] Found last watched anime: ${chalk.bold(lastAnime.title)}`));
      }
      selectedAnime = {
        title: lastAnime.title,
        url: animeUrl,
        source: lastAnime.source || 'onepiecepower-anime',
        language: lastAnime.language || 'it',
        audio: lastAnime.audio || 'both'
      };
    } else if (!options.getUrl) {
      console.log(chalk.yellow('ℹ️ No previous anime found in history to resume from.\n'));
    }
  }

  // 3. Search anime if not resuming or random
  if (!selectedAnime) {
    let searchQuery = query;
    if (!searchQuery) {
      const inputAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'query',
          message: '🔍 What anime do you want to watch?',
          validate: value => value.trim().length > 0 ? true : 'Please enter an anime title to search'
        }
      ]);
      searchQuery = inputAnswer.query;
    }

    const sourceLabel = options.source ? ` [${options.source}]` : '';
    const spinner = !options.getUrl ? ora(`Searching anime catalog for "${searchQuery}"${sourceLabel}...`).start() : null;
    const results = await providerManager.searchAnime(searchQuery, selectedLang, options.source);
    if (spinner) spinner.stop();

    if (results.length === 0) {
      console.log(chalk.red(`❌ No anime found matching "${searchQuery}".`));
      process.exit(0);
    }

    // List mode: print and exit
    if (options.list) {
      console.log(chalk.bold(`\nFound ${results.length} matching anime titles:`));
      results.forEach(r => console.log(` - ${r.title} [${(r.audio || 'STREAM').toUpperCase()}] [${r.sourceName || r.source}]`));
      return;
    }

    if (options.getUrl || options.info || options.episode) {
      // Pick exact or first result if non-interactive
      selectedAnime = results[0];
    } else {
      const animeChoices = results.slice(0, 50).map(a => {
        let badge = chalk.cyan(`[${a.sourceName || a.source || 'Anime'}]`);
        let audioBadge = '';
        if (a.audio === 'both') audioBadge = chalk.yellow('[ITA/SUB]');
        else if (a.audio === 'ita') audioBadge = chalk.green('[ITA]');
        else if (a.audio === 'subita' || a.audio === 'sub') audioBadge = chalk.blue('[SUB ITA]');

        return {
          name: `${badge} ${audioBadge} ${chalk.bold(a.title)}`,
          value: a
        };
      });

      const animeAnswer = await inquirer.prompt([
        {
          type: 'autocomplete',
          name: 'anime',
          message: 'Select anime to watch (type to filter):',
          pageSize: 10,
          source: async (answersSoFar, input) => {
            if (!input) return animeChoices;
            const clean = input.toLowerCase();
            return animeChoices.filter(c => c.name && c.name.toLowerCase().includes(clean));
          }
        }
      ]);

      selectedAnime = animeAnswer.anime;
    }
  }

  // Ensure valid URL
  if (!selectedAnime.url || !selectedAnime.url.startsWith('http')) {
    const searchRes = await providerManager.searchAnime(selectedAnime.title || selectedAnime.url, selectedLang);
    if (searchRes && searchRes.length > 0) {
      selectedAnime.url = searchRes[0].url;
      selectedAnime.title = searchRes[0].title;
      selectedAnime.source = searchRes[0].source;
    }
  }

  chosenAnimeProvider = providerManager.getAnimeProvider(selectedAnime.source);
  const animeKey = (selectedAnime.url || selectedAnime.title).toLowerCase().trim();

  // 4. Audio track selection
  let preferredAudio = 'subita';
  if (options.dub) {
    preferredAudio = 'ita';
  } else if (options.sub) {
    preferredAudio = 'subita';
  } else if (selectedAnime.audio === 'ita') {
    preferredAudio = 'ita';
  } else if (selectedAnime.audio === 'subita' || selectedAnime.audio === 'sub') {
    preferredAudio = 'subita';
  } else if (options.resumeItem && selectedAnime.audio) {
    preferredAudio = selectedAnime.audio;
  } else if (!options.getUrl && !options.info && !options.resumeItem && (selectedAnime.audio === 'both' || selectedAnime.title.includes('ITA/SUB ITA') || selectedAnime.title.includes('ITA / SUB ITA'))) {
    const audioAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'audio',
        message: 'Select audio track / language:',
        choices: [
          { name: '🇯🇵 Japanese Audio with Italian Subtitles (SUB ITA)', value: 'subita' },
          { name: '🇮🇹 Italian Dubbed Audio (ITA)', value: 'ita' }
        ]
      }
    ]);
    preferredAudio = audioAnswer.audio;
  }

  // 5. Fetch episodes
  const spinner = !options.getUrl ? ora(`Loading episodes for ${selectedAnime.title}...`).start() : null;
  const episodes = await chosenAnimeProvider.getEpisodes(selectedAnime.url);
  if (spinner) spinner.stop();

  if (episodes.length === 0) {
    console.log(chalk.red('❌ No episodes available for this anime series.'));
    process.exit(0);
  }

  // Info mode: print details and exit
  if (options.info) {
    console.log(chalk.bold.green(`\n📺 ${selectedAnime.title}`));
    console.log(`   Source: ${selectedAnime.sourceName || selectedAnime.source || chosenAnimeProvider.name}`);
    console.log(`   Language: ${selectedAnime.language || 'it'} (Audio: ${selectedAnime.audio})`);
    console.log(`   Total episodes: ${episodes.length}`);
    console.log(`   URL: ${selectedAnime.url}\n`);
    return;
  }

  if (!options.getUrl) {
    console.log(chalk.green(`✔ Found ${episodes.length} episodes!\n`));
  }

  // 6. Direct episode selection via -e / --episode
  if (options.episode) {
    const targetNum = String(options.episode).trim();
    const foundEp = episodes.find(e => {
      const eNum = String(e.id || '').trim();
      return eNum === targetNum || e.title.startsWith(targetNum) || e.title.includes(` ${targetNum} `) || e.title.startsWith(`0${targetNum}`) || e.title.startsWith(`00${targetNum}`);
    });

    if (!foundEp) {
      console.log(chalk.red(`❌ Episode "${targetNum}" not found for this anime.`));
      process.exit(1);
    }

    const streamData = await chosenAnimeProvider.getEpisodeStream(foundEp.url, preferredAudio);
    if (!streamData || !streamData.streamUrl) {
      console.log(chalk.red(`❌ Unable to extract video stream for episode ${targetNum}.`));
      process.exit(1);
    }

    if (options.getUrl) {
      console.log(streamData.streamUrl);
      process.exit(0);
    }

    const animeReferer = (chosenAnimeProvider && chosenAnimeProvider.baseUrl) ? `${chosenAnimeProvider.baseUrl}/` : 'https://onepiecepower.com/';

    if (options.download) {
      const destDir = typeof options.download === 'string' ? options.download : null;
      await downloadAnimeEpisode(streamData.streamUrl, selectedAnime.title, foundEp.title, animeReferer, destDir);
      process.exit(0);
    }

    console.log(chalk.blue(`\n🚀 Launching Episode ${targetNum} in player...`));
    await animePlayer.play(streamData.streamUrl, selectedAnime.title, foundEp.title, animeReferer, {
      player: options.player,
      fullscreen: options.fullscreen
    });
    markEpisodeWatched(animeKey, selectedAnime.title, foundEp, selectedAnime);
    process.exit(0);
  }

  // 7. Interactive episode playback loop
  let keepWatching = true;
  let isFirstIteration = true;
  let currentEpisodes = episodes;

  while (keepWatching) {
    let selectedEpisode = null;

    if (isFirstIteration && options.continue) {
      const resumeResult = getNextEpisodeToWatch(animeKey, currentEpisodes);
      if (resumeResult) {
        selectedEpisode = resumeResult.episode;
        if (resumeResult.isNext) {
          console.log(chalk.cyan(`⏩ [Auto-Continue] Resuming from next episode: ${chalk.bold(selectedEpisode.title)}`));
          if (resumeResult.prevEpisode) {
            console.log(chalk.dim(`   (Previous watched: ${resumeResult.prevEpisode.title})\n`));
          }
        } else {
          console.log(chalk.yellow(`ℹ️ [Auto-Continue] Already at latest watched episode. Reopening: ${chalk.bold(selectedEpisode.title)}\n`));
        }
      } else {
        console.log(chalk.yellow('ℹ️ No watching history found for this anime. Please select an episode:\n'));
      }
    }

    isFirstIteration = false;

    if (!selectedEpisode) {
      const epChoices = currentEpisodes.map(e => {
        const isWatched = isEpisodeWatched(animeKey, e.id, e.url);
        const badge = isWatched ? chalk.green(' [✓]') : '';
        return {
          name: `${e.title}${badge}`,
          value: e
        };
      });

      const epAnswer = await inquirer.prompt([
        {
          type: 'autocomplete',
          name: 'episode',
          message: 'Select episode to stream (type to search):',
          pageSize: 10,
          source: async (answersSoFar, input) => {
            if (!input) return epChoices;
            const clean = input.toLowerCase();
            return epChoices.filter(c => c.name && c.name.toLowerCase().includes(clean));
          }
        }
      ]);

      selectedEpisode = epAnswer.episode;
    }

    // 8. Resolve video stream
    const spin = ora(`Resolving video stream for "${selectedEpisode.title}"...`).start();
    const streamData = await chosenAnimeProvider.getEpisodeStream(selectedEpisode.url, preferredAudio);
    spin.stop();

    if (!streamData || !streamData.streamUrl) {
      console.log(chalk.red(`❌ Unable to extract video stream for this episode.`));
      continue;
    }

    if (options.getUrl) {
      console.log(streamData.streamUrl);
      process.exit(0);
    }

    const animeReferer = (chosenAnimeProvider && chosenAnimeProvider.baseUrl) ? `${chosenAnimeProvider.baseUrl}/` : 'https://onepiecepower.com/';

    // Download mode
    if (options.download) {
      const destDir = typeof options.download === 'string' ? options.download : null;
      await downloadAnimeEpisode(streamData.streamUrl, selectedAnime.title, selectedEpisode.title, animeReferer, destDir);
      process.exit(0);
    }

    console.log(chalk.blue(`\n🚀 Launching video stream in player...`));
    console.log(chalk.dim(`   Title: ${selectedAnime.title} - ${selectedEpisode.title}`));
    console.log(chalk.dim(`   Stream: ${streamData.streamUrl}\n`));

    // Play video stream with player & fullscreen options
    await animePlayer.play(
      streamData.streamUrl,
      selectedAnime.title,
      selectedEpisode.title,
      animeReferer,
      {
        player: options.player,
        fullscreen: options.fullscreen
      }
    );

    markEpisodeWatched(animeKey, selectedAnime.title, selectedEpisode, selectedAnime);
    console.log(chalk.green(`✔ Marked "${selectedEpisode.title}" as watched.\n`));

    // Continuous watching prompt
    let inSubLoop = true;
    while (inSubLoop) {
      const currentIndex = currentEpisodes.findIndex(e => e.url === selectedEpisode.url);
      const nextEp = currentIndex + 1 < currentEpisodes.length ? currentEpisodes[currentIndex + 1] : null;

      const nextActionChoices = [
        ...(nextEp ? [{ name: `⏩ Watch next episode (${nextEp.title})`, value: 'next' }] : []),
        { name: '📥 Download this episode for offline', value: 'download' },
        { name: '📑 Choose another episode', value: 'choose' },
        { name: '🚪 Exit', value: 'exit' }
      ];

      const nextActionAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do next?',
          choices: nextActionChoices
        }
      ]);

      if (nextActionAnswer.action === 'next' && nextEp) {
        spin.start(`Resolving video stream for "${nextEp.title}"...`);
        const nextStream = await chosenAnimeProvider.getEpisodeStream(nextEp.url, preferredAudio);
        spin.stop();

        if (!nextStream || !nextStream.streamUrl) {
          console.log(chalk.red(`❌ Unable to extract video stream for next episode.`));
          selectedEpisode = nextEp;
          continue;
        }

        console.log(chalk.blue(`\n🚀 Streaming next episode in player...`));
        await animePlayer.play(
          nextStream.streamUrl,
          selectedAnime.title,
          nextEp.title,
          animeReferer,
          {
            player: options.player,
            fullscreen: options.fullscreen
          }
        );

        markEpisodeWatched(animeKey, selectedAnime.title, nextEp, selectedAnime);
        console.log(chalk.green(`✔ Marked "${nextEp.title}" as watched.\n`));
        selectedEpisode = nextEp;
      } else if (nextActionAnswer.action === 'download') {
        await downloadAnimeEpisode(streamData.streamUrl, selectedAnime.title, selectedEpisode.title, 'https://onepiecepower.com/');
      } else if (nextActionAnswer.action === 'choose') {
        inSubLoop = false;
      } else {
        inSubLoop = false;
        keepWatching = false;
      }
    }
  }
}

// ====================================================================
// MANGA FLOW
// ====================================================================
async function handleMangaFlow(query, options) {
  let selectedLang = options.lang ? options.lang.toLowerCase() : null;
  let selectedManga = options.resumeItem ? { ...options.resumeItem } : null;
  let chosenProvider = providerManager.getMangaProvider(options.source);

  if (selectedManga && selectedManga.language && !selectedLang) {
    selectedLang = selectedManga.language;
  }

  // 1. Random manga mode
  if (options.random) {
    const spinner = ora('Picking a random manga from catalog...').start();
    const randProv = (chosenProvider && typeof chosenProvider.getRandomManga === 'function')
      ? chosenProvider
      : providerManager.getMangaProvider('onepiecepower');
    selectedManga = await randProv.getRandomManga(selectedLang);
    spinner.stop();
    if (!selectedManga) {
      console.log(chalk.red('❌ Could not find a manga from the catalog.'));
      return;
    }
    console.log(chalk.green(`🎲 Random Manga picked: ${chalk.bold(selectedManga.title)}!\n`));
  }

  // 2. Resume directly from last read manga
  if (!selectedManga && !query && options.continue) {
    const lastManga = getLastReadManga();
    const mangaUrl = lastManga ? (lastManga.url || lastManga.mangaKey) : null;
    if (lastManga && mangaUrl) {
      if (!options.getUrl) {
        console.log(chalk.cyan(`📖 [Auto-Resume] Found last read manga: ${chalk.bold(lastManga.title)}`));
      }
      selectedManga = {
        title: lastManga.title,
        url: mangaUrl,
        source: lastManga.source || (mangaUrl.includes('mangadex') ? 'mangadex' : (mangaUrl.includes('mangapill') ? 'mangapill' : 'onepiecepower')),
        language: lastManga.language || selectedLang || 'it'
      };
      if (!selectedLang && lastManga.language) {
        selectedLang = lastManga.language;
      }
    } else if (!options.getUrl) {
      console.log(chalk.yellow('ℹ️ No previous manga found in history to resume from.\n'));
    }
  }

  // 3. Select language and manga if not resuming
  if (!selectedManga) {
    if (!selectedLang && !options.getUrl) {
      const langChoices = [
        { name: '🇮🇹 Italian (Italiano)', value: 'it' },
        { name: '🇬🇧 English', value: 'en' },
        { name: '🇪🇸 Spanish (Español)', value: 'es' },
        { name: '🇫🇷 French (Français)', value: 'fr' },
        { name: '🇩🇪 German (Deutsch)', value: 'de' },
        { name: '🇧🇷 Portuguese (Brasil)', value: 'pt-br' },
        { name: '🇷🇺 Russian (Русский)', value: 'ru' },
        { name: '🇯🇵 Japanese (日本語)', value: 'ja' },
        { name: '🌍 All Languages (Browse all)', value: 'all' },
        new inquirer.Separator('── More Languages ──'),
        ...LANGUAGES.filter(l => !['it', 'en', 'es', 'fr', 'de', 'pt-br', 'ru', 'ja'].includes(l.code)).map(l => ({
          name: `${l.flag} ${l.name}`,
          value: l.code
        }))
      ];

      const langAnswer = await inquirer.prompt([
        {
          type: 'autocomplete',
          name: 'language',
          message: '🌐 Select scanlation language (type to search among 30+ languages):',
          pageSize: 10,
          source: async (answersSoFar, input) => {
            if (!input) return langChoices;
            const clean = input.toLowerCase();
            return langChoices.filter(c => c.name && c.name.toLowerCase().includes(clean));
          }
        }
      ]);
      selectedLang = langAnswer.language;
    } else if (!selectedLang) {
      selectedLang = 'it';
    }

    let searchQuery = query;
    if (!searchQuery) {
      const inputAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'query',
          message: '🔍 What manga do you want to read?',
          validate: value => value.trim().length > 0 ? true : 'Please enter a title to search'
        }
      ]);
      searchQuery = inputAnswer.query;
    }

    const langLabel = (selectedLang || 'IT').toUpperCase();
    const sourceLabel = options.source ? ` [${options.source}]` : '';
    const spinner = !options.getUrl ? ora(`Searching manga for "${searchQuery}" [${langLabel}]${sourceLabel}...`).start() : null;

    let results = await providerManager.searchManga(searchQuery, selectedLang, options.source);
    if (spinner) spinner.stop();

    if (results.length === 0) {
      console.log(chalk.red(`❌ No manga found for "${searchQuery}" in language [${selectedLang}].`));
      process.exit(0);
    }

    // List mode
    if (options.list) {
      console.log(chalk.bold(`\nFound ${results.length} matching manga titles:`));
      results.forEach(r => console.log(` - ${r.title} [${r.sourceName || r.source || 'Manga'}]`));
      return;
    }

    if (options.getUrl || options.info || options.chapter) {
      selectedManga = results[0];
    } else {
      const mangaChoices = results.slice(0, 50).map(m => {
        const flag = getLanguageFlag(m.language || selectedLang);
        let sourceLabel = chalk.cyan(`[${m.sourceName || m.source || 'Manga'}]`);
        if (m.source === 'mangapill') {
          sourceLabel = chalk.yellow('[Mangapill]');
        } else if (m.source === 'onepiecepower') {
          sourceLabel = chalk.blue('[OPPower]');
        } else if (m.source === 'mangadex') {
          sourceLabel = chalk.magenta('[MangaDex]');
        }

        return {
          name: `${flag} ${sourceLabel} ${chalk.bold(m.title)} ${m.author ? chalk.dim(`(Author: ${m.author})`) : ''}`,
          value: m
        };
      });

      const mangaAnswer = await inquirer.prompt([
        {
          type: 'autocomplete',
          name: 'manga',
          message: 'Select a manga (type to filter):',
          pageSize: 10,
          source: async (answersSoFar, input) => {
            if (!input) return mangaChoices;
            const clean = input.toLowerCase();
            return mangaChoices.filter(c => c.name && c.name.toLowerCase().includes(clean));
          }
        }
      ]);

      selectedManga = mangaAnswer.manga;
    }
  }

  // Ensure valid URL
  if (!selectedManga.url || !selectedManga.url.startsWith('http')) {
    const searchRes = await providerManager.searchManga(selectedManga.title || selectedManga.url, selectedLang || 'it');
    if (searchRes && searchRes.length > 0) {
      selectedManga.url = searchRes[0].url;
      selectedManga.title = searchRes[0].title;
      selectedManga.source = searchRes[0].source || 'onepiecepower';
    }
  }

  const mangaKey = (selectedManga.url || selectedManga.id || selectedManga.title).toLowerCase().trim();
  chosenProvider = providerManager.getMangaProvider(selectedManga.source);

  // 4. Fetch chapters
  const spinner = !options.getUrl ? ora(`Loading chapters for ${selectedManga.title}...`).start() : null;
  const chapters = await chosenProvider.getChapters(selectedManga.url, selectedLang);
  if (spinner) spinner.stop();

  if (chapters.length === 0) {
    console.log(chalk.red('❌ No chapters available for this manga in the selected language.'));
    process.exit(0);
  }

  // Info mode
  if (options.info) {
    console.log(chalk.bold.green(`\n📖 ${selectedManga.title}`));
    console.log(`   Source: ${selectedManga.sourceName || selectedManga.source || chosenProvider.name}`);
    console.log(`   Author: ${selectedManga.author || 'Unknown'}`);
    console.log(`   Genres: ${selectedManga.genres || 'N/A'}`);
    console.log(`   Total chapters: ${chapters.length}`);
    console.log(`   URL: ${selectedManga.url}\n`);
    return;
  }

  if (!options.getUrl) {
    console.log(chalk.green(`✔ Found ${chapters.length} chapters!\n`));
  }

  // 5. Direct chapter selection via -C / --chapter
  if (options.chapter) {
    const targetCh = String(options.chapter).trim();
    const foundCh = chapters.find(c => {
      const cNum = String(c.number || c.id || '').trim();
      return cNum === targetCh || c.title.includes(` ${targetCh} `) || c.title.includes(`Capitolo ${targetCh}`) || c.title.includes(`Chapter ${targetCh}`);
    });

    if (!foundCh) {
      console.log(chalk.red(`❌ Chapter "${targetCh}" not found.`));
      process.exit(1);
    }

    const chapterData = await chosenProvider.getChapterPages(foundCh.url);
    const pagesList = chapterData.pages || (chapterData.page1 ? [chapterData.page1] : []);

    if (options.getUrl) {
      pagesList.forEach(p => console.log(p));
      process.exit(0);
    }

    if (options.download) {
      const destDir = typeof options.download === 'string' ? options.download : null;
      await downloadMangaChapter(pagesList, selectedManga.title, foundCh.title, foundCh.url, destDir);
      process.exit(0);
    }

    mangaViewer.prepareChapterDir(selectedManga.title, foundCh.id);
    await mangaViewer.streamAndRead(chapterData.pages || chapterData, foundCh.url, null, {
      viewer: options.viewer,
      fullscreen: options.fullscreen
    });
    markChapterRead(mangaKey, selectedManga.title, foundCh, selectedManga);
    process.exit(0);
  }

  // 6. Interactive chapter loop
  let currentChapters = chapters;
  let keepReading = true;
  let isFirstIteration = true;

  while (keepReading) {
    let selectedChapter = null;

    if (isFirstIteration && options.continue) {
      const resumeResult = getNextChapterToRead(mangaKey, currentChapters);
      if (resumeResult) {
        selectedChapter = resumeResult.chapter;
        if (resumeResult.isNext) {
          console.log(chalk.cyan(`⏩ [Auto-Continue] Resuming from next chapter: ${chalk.bold(selectedChapter.title)}`));
          if (resumeResult.prevChapter) {
            console.log(chalk.dim(`   (Previous read: ${resumeResult.prevChapter.title})\n`));
          }
        } else {
          console.log(chalk.yellow(`ℹ️ [Auto-Continue] Already at latest chapter. Reopening: ${chalk.bold(selectedChapter.title)}\n`));
        }
      } else {
        console.log(chalk.yellow('ℹ️ No reading history found for this manga. Please select a chapter:\n'));
      }
    }

    isFirstIteration = false;

    if (!selectedChapter) {
      const chapterChoices = currentChapters.map(c => {
        const isRead = isChapterRead(mangaKey, c.id, c.url);
        const badge = isRead ? chalk.green(' [✓]') : '';
        return {
          name: `${c.title}${badge}`,
          value: c
        };
      });

      const chapterAnswer = await inquirer.prompt([
        {
          type: 'autocomplete',
          name: 'chapter',
          message: 'Select chapter to read (type to search):',
          pageSize: 10,
          source: async (answersSoFar, input) => {
            if (!input) return chapterChoices;
            const clean = input.toLowerCase();
            return chapterChoices.filter(c => c.name && c.name.toLowerCase().includes(clean));
          }
        }
      ]);

      selectedChapter = chapterAnswer.chapter;
    }

    // 7. Extract pages
    const dlSpin = ora(`Discovering pages for "${selectedChapter.title}"...`).start();
    const chapterData = await chosenProvider.getChapterPages(selectedChapter.url);
    dlSpin.stop();

    if (chapterData.externalUrl) {
      console.log(chalk.yellow(`\nℹ️ This chapter is hosted externally on official publisher: MangaPlus`));
      const openAns = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'openWeb',
          message: `Open official chapter in your browser? (${chalk.cyan(chapterData.externalUrl)})`,
          default: true
        }
      ]);
      if (openAns.openWeb) {
        spawn('xdg-open', [chapterData.externalUrl], { stdio: 'ignore' });
        markChapterRead(mangaKey, selectedManga.title, selectedChapter, selectedManga);
        console.log(chalk.green('Opened in browser!'));
      }
      continue;
    }

    const hasPages = (chapterData.pages && chapterData.pages.length > 0) || chapterData.page1;
    if (!hasPages) {
      console.log(chalk.red('❌ Unable to find pages for this chapter.'));
      continue;
    }

    if (options.getUrl) {
      const pList = chapterData.pages || [chapterData.page1];
      pList.forEach(p => console.log(p));
      process.exit(0);
    }

    // Download mode
    if (options.download) {
      const destDir = typeof options.download === 'string' ? options.download : null;
      await downloadMangaChapter(chapterData.pages || chapterData, selectedManga.title, selectedChapter.title, selectedChapter.url, destDir);
      process.exit(0);
    }

    console.log(chalk.blue('⚡ Streaming chapter in real time into RAM (/dev/shm)...'));

    mangaViewer.prepareChapterDir(selectedManga.title, selectedChapter.id);
    const downloadSpinner = ora('Buffering page 1 (opening viewer)...').start();

    console.log(chalk.magenta('🚀 Reader opening instantly! (subsequent pages are being pushed live)'));
    await mangaViewer.streamAndRead(
      chapterData.pages || chapterData,
      selectedChapter.url,
      (done, total, isComplete) => {
        if (!isComplete) {
          downloadSpinner.text = `Live streaming to player: ${done}/${total} pages buffered`;
        } else {
          downloadSpinner.succeed(chalk.green(`All ${total} pages streamed into viewer!`));
        }
      },
      {
        viewer: options.viewer,
        fullscreen: options.fullscreen
      }
    );

    markChapterRead(mangaKey, selectedManga.title, selectedChapter, selectedManga);
    console.log(chalk.green('✔ Chapter finished and RAM cache cleared.\n'));

    // Continuous reading loop
    let inSubLoop = true;
    while (inSubLoop) {
      const currentIndex = currentChapters.findIndex(c => c.url === selectedChapter.url);
      const nextChapter = currentIndex + 1 < currentChapters.length ? currentChapters[currentIndex + 1] : null;

      const nextActionChoices = [
        ...(nextChapter ? [{ name: `⏩ Read next chapter (${nextChapter.title})`, value: 'next' }] : []),
        { name: '📥 Download this chapter for offline', value: 'download' },
        { name: '📑 Choose another chapter', value: 'choose' },
        { name: '🚪 Exit', value: 'exit' }
      ];

      const nextActionAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do next?',
          choices: nextActionChoices
        }
      ]);

      if (nextActionAnswer.action === 'next' && nextChapter) {
        dlSpin.start(`Discovering pages for "${nextChapter.title}"...`);
        const nextData = await chosenProvider.getChapterPages(nextChapter.url);
        dlSpin.stop();

        if (nextData.externalUrl) {
          spawn('xdg-open', [nextData.externalUrl], { stdio: 'ignore' });
          markChapterRead(mangaKey, selectedManga.title, nextChapter, selectedManga);
          selectedChapter = nextChapter;
          continue;
        }

        mangaViewer.prepareChapterDir(selectedManga.title, nextChapter.id);
        const spin2 = ora('Buffering page 1...').start();
        console.log(chalk.magenta('🚀 Opening next chapter instantly!'));
        await mangaViewer.streamAndRead(nextData.pages || nextData, nextChapter.url, (done, total, isComplete) => {
          if (isComplete) spin2.succeed(chalk.green(`All ${total} pages streamed into viewer!`));
        }, {
          viewer: options.viewer,
          fullscreen: options.fullscreen
        });

        markChapterRead(mangaKey, selectedManga.title, nextChapter, selectedManga);
        selectedChapter = nextChapter;
      } else if (nextActionAnswer.action === 'download') {
        await downloadMangaChapter(chapterData.pages || chapterData, selectedManga.title, selectedChapter.title, selectedChapter.url);
      } else if (nextActionAnswer.action === 'choose') {
        inSubLoop = false;
      } else {
        inSubLoop = false;
        keepReading = false;
      }
    }
  }
}

program.parse();
