#!/usr/bin/env node

const path = require('path');
const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { spawn } = require('child_process');

const OnePiecePowerProvider = require('./providers/onepiecepower');
const MangaDexProvider = require('./providers/mangadex');
const MangapillProvider = require('./providers/mangapill');
const OnePiecePowerAnimeProvider = require('./providers/onepiecepower-anime');

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
  getAllHistory
} = require('./utils/history');

const {
  downloadMangaChapter,
  downloadAnimeEpisode
} = require('./utils/downloader');

// Register autocomplete prompt in inquirer
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

const program = new Command();
const oppProvider = new OnePiecePowerProvider();
const mdProvider = new MangaDexProvider();
const mpProvider = new MangapillProvider();
const oppAnimeProvider = new OnePiecePowerAnimeProvider();

const mangaViewer = new MangaViewer();
const animePlayer = new AnimePlayer();

program
  .name('manga-cli')
  .description('Universal Terminal CLI to read Manga and stream Anime with instant playback, downloading, and RAM caching')
  .version('2.0.0')
  .argument('[query]', 'Search manga or anime by title (or subcommand: watch, read, download, history, random, info)')
  // Target mode
  .option('-a, --anime', 'Watch anime stream')
  .option('-m, --manga', 'Read manga chapters')
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
  // Player & Viewer options
  .option('-p, --player <name>', 'Force specific media player (e.g. mpv, vlc, ffplay, xdg-open)')
  .option('-v, --viewer <name>', 'Force specific image viewer (e.g. feh, sxiv, imv, mpv, loupe)')
  .option('-f, --fullscreen', 'Launch player or viewer in fullscreen mode')
  // State
  .option('-c, --continue', 'Automatically continue reading / watching from next unread chapter or episode')
  .option('-D, --delete', 'Clear read chapters and watched anime history')

  .action(async (query, options) => {
    try {
      // 0. Subcommand alias resolution
      const firstArg = (query || '').toLowerCase().trim();
      let subQuery = process.argv[3] && !process.argv[3].startsWith('-') ? process.argv[3] : null;

      if (firstArg === 'history' || firstArg === 'hist') {
        options.history = true;
        query = null;
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
      }

      // 1. History view command
      if (options.history) {
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
  const allHistory = getAllHistory();

  console.log(chalk.bold.cyan('\n  📜 MANGA & ANIME HISTORY\n'));

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

  // Interactive resume from history
  const historyChoices = allHistory.map(item => {
    const icon = item.type === 'anime' ? '🎬' : '📖';
    return {
      name: `${icon} ${item.title} ${chalk.dim(`(Last: ${item.lastItem || 'N/A'})`)}`,
      value: item
    };
  });
  historyChoices.push(new inquirer.Separator());
  historyChoices.push({ name: '🚪 Exit', value: null });

  const choice = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'selected',
      message: 'Select a title to resume reading/watching (or exit):',
      pageSize: 10,
      source: async (answersSoFar, input) => {
        if (!input) return historyChoices;
        const clean = input.toLowerCase();
        return historyChoices.filter(c => c.name && c.name.toLowerCase().includes(clean));
      }
    }
  ]);

  if (!choice.selected) return;

  const item = choice.selected;
  if (item.type === 'anime') {
    await handleAnimeFlow(item.title, { ...options, continue: true });
  } else {
    await handleMangaFlow(item.title, { ...options, continue: true });
  }
}

// ====================================================================
// ANIME FLOW
// ====================================================================
async function handleAnimeFlow(query, options) {
  let selectedAnime = null;
  let selectedLang = options.lang ? options.lang.toLowerCase() : null;

  // 1. Random anime mode
  if (options.random) {
    const spinner = ora('Picking a random anime from catalog...').start();
    selectedAnime = await oppAnimeProvider.getRandomAnime(selectedLang);
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
        source: lastAnime.source || 'onepiecepower',
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

    const spinner = !options.getUrl ? ora(`Searching anime catalog for "${searchQuery}"...`).start() : null;
    const results = await oppAnimeProvider.search(searchQuery, selectedLang);
    if (spinner) spinner.stop();

    if (results.length === 0) {
      console.log(chalk.red(`❌ No anime found matching "${searchQuery}".`));
      process.exit(0);
    }

    // List mode: print and exit
    if (options.list) {
      console.log(chalk.bold(`\nFound ${results.length} matching anime titles:`));
      results.forEach(r => console.log(` - ${r.title} [${r.audio.toUpperCase()}]`));
      return;
    }

    if (options.getUrl || options.info || options.episode) {
      // Pick exact or first result if non-interactive
      selectedAnime = results[0];
    } else {
      const animeChoices = results.slice(0, 50).map(a => {
        let badge = chalk.magenta('[OPPower]');
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
  } else if (!options.getUrl && !options.info && (selectedAnime.audio === 'both' || selectedAnime.title.includes('ITA/SUB ITA') || selectedAnime.title.includes('ITA / SUB ITA'))) {
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
  const episodes = await oppAnimeProvider.getEpisodes(selectedAnime.url);
  if (spinner) spinner.stop();

  if (episodes.length === 0) {
    console.log(chalk.red('❌ No episodes available for this anime series.'));
    process.exit(0);
  }

  // Info mode: print details and exit
  if (options.info) {
    console.log(chalk.bold.green(`\n📺 ${selectedAnime.title}`));
    console.log(`   Source: One Piece Power`);
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

    const streamData = await oppAnimeProvider.getEpisodeStream(foundEp.url, preferredAudio);
    if (!streamData || !streamData.streamUrl) {
      console.log(chalk.red(`❌ Unable to extract video stream for episode ${targetNum}.`));
      process.exit(1);
    }

    if (options.getUrl) {
      console.log(streamData.streamUrl);
      process.exit(0);
    }

    if (options.download) {
      const destDir = typeof options.download === 'string' ? options.download : null;
      await downloadAnimeEpisode(streamData.streamUrl, selectedAnime.title, foundEp.title, 'https://onepiecepower.com/', destDir);
      process.exit(0);
    }

    console.log(chalk.blue(`\n🚀 Launching Episode ${targetNum} in player...`));
    await animePlayer.play(streamData.streamUrl, selectedAnime.title, foundEp.title, 'https://onepiecepower.com/', {
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
    const streamData = await oppAnimeProvider.getEpisodeStream(selectedEpisode.url, preferredAudio);
    spin.stop();

    if (!streamData || !streamData.streamUrl) {
      console.log(chalk.red(`❌ Unable to extract video stream for this episode.`));
      continue;
    }

    if (options.getUrl) {
      console.log(streamData.streamUrl);
      process.exit(0);
    }

    // Download mode
    if (options.download) {
      const destDir = typeof options.download === 'string' ? options.download : null;
      await downloadAnimeEpisode(streamData.streamUrl, selectedAnime.title, selectedEpisode.title, 'https://onepiecepower.com/', destDir);
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
      'https://onepiecepower.com/',
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
        const nextStream = await oppAnimeProvider.getEpisodeStream(nextEp.url, preferredAudio);
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
          'https://onepiecepower.com/',
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
  let selectedManga = null;
  let chosenProvider = oppProvider;

  // 1. Random manga mode
  if (options.random) {
    const spinner = ora('Picking a random manga from catalog...').start();
    selectedManga = await oppProvider.getRandomManga(selectedLang);
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
    const spinner = !options.getUrl ? ora(`Searching manga for "${searchQuery}" [${langLabel}]...`).start() : null;

    let results = [];
    if (selectedLang === 'it') {
      results = await oppProvider.search(searchQuery, 'it');
    } else {
      const promises = [
        mdProvider.search(searchQuery, selectedLang),
        (selectedLang === 'en' || selectedLang === 'all') ? mpProvider.search(searchQuery, selectedLang) : Promise.resolve([]),
        (selectedLang === 'en' || selectedLang === 'all') ? oppProvider.search(searchQuery, selectedLang) : Promise.resolve([])
      ];
      const [mdResults, pillResults, oppResults] = await Promise.all(promises);
      results = [...pillResults, ...oppResults, ...mdResults];
    }
    if (spinner) spinner.stop();

    if (results.length === 0) {
      console.log(chalk.red(`❌ No manga found for "${searchQuery}" in language [${selectedLang}].`));
      process.exit(0);
    }

    // List mode
    if (options.list) {
      console.log(chalk.bold(`\nFound ${results.length} matching manga titles:`));
      results.forEach(r => console.log(` - ${r.title} [${r.source || 'OPPower'}]`));
      return;
    }

    if (options.getUrl || options.info || options.chapter) {
      selectedManga = results[0];
    } else {
      const mangaChoices = results.slice(0, 50).map(m => {
        const flag = getLanguageFlag(m.language || selectedLang);
        let sourceLabel = chalk.magenta('[MangaDex]');
        if (m.source === 'mangapill') {
          sourceLabel = chalk.yellow('[Mangapill]');
        } else if (m.source === 'onepiecepower' || !m.source) {
          sourceLabel = chalk.blue('[OPPower]');
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

  const mangaKey = (selectedManga.url || selectedManga.id || selectedManga.title).toLowerCase().trim();

  if (selectedManga.source === 'mangadex') {
    chosenProvider = mdProvider;
  } else if (selectedManga.source === 'mangapill') {
    chosenProvider = mpProvider;
  } else {
    chosenProvider = oppProvider;
  }

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
    console.log(`   Source: ${selectedManga.source || 'One Piece Power'}`);
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
