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
  clearHistory
} = require('./utils/history');

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
  .description('Universal Terminal CLI to read Manga and stream Anime with instant playback and RAM caching')
  .version('2.0.0')
  .argument('[query]', 'Search manga or anime by title')
  .option('-a, --anime', 'Watch anime stream')
  .option('-m, --manga', 'Read manga chapters')
  .option('-l, --lang <language>', 'Filter by language code (e.g. it, en, es, fr, ja)', null)
  .option('--dub', 'Prefer Italian dubbed audio (ITA) for anime')
  .option('--sub', 'Prefer Italian subtitled audio (SUB ITA) for anime')
  .option('-c, --continue', 'Automatically continue reading / watching from next unread chapter or episode')
  .option('-D, --delete', 'Clear read chapters and watched anime history')

  .action(async (query, options) => {
    try {
      // 1. Handle deletion of history
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

      console.log(chalk.bold.cyan('\n  📖 MANGA-CLI 2.0 - Universal Terminal Manga & Anime Hub 🎬\n'));

      // Check if invoked via 'anime-cli' symlink or with 'anime' / 'manga' subcommand
      const isAnimeBinary = path.basename(process.argv[1] || '').includes('anime');
      let mode = null;

      if (options.anime || isAnimeBinary) {
        mode = 'anime';
      } else if (options.manga) {
        mode = 'manga';
      } else if (query === 'anime') {
        mode = 'anime';
        query = process.argv[3] && !process.argv[3].startsWith('-') ? process.argv[3] : null;
      } else if (query === 'manga') {
        mode = 'manga';
        query = process.argv[3] && !process.argv[3].startsWith('-') ? process.argv[3] : null;
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

      // If still no mode determined, prompt interactively
      if (!mode) {
        if (query) {
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
                { name: '🎬 Watch Anime (Guarda Anime)', value: 'anime' }
              ]
            }
          ]);
          mode = modePrompt.mode;
        }
      }

      // Dispatch to corresponding flow
      if (mode === 'anime') {
        await handleAnimeFlow(query, options);
      } else {
        await handleMangaFlow(query, options);
      }

      console.log(chalk.cyan('\nThank you for using manga-cli! See you next time. 👋'));
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
// ANIME FLOW
// ====================================================================
async function handleAnimeFlow(query, options) {
  let selectedAnime = null;
  let selectedLang = options.lang ? options.lang.toLowerCase() : null;

  // 1. Check auto-resume
  if (!query && options.continue) {
    const lastAnime = getLastWatchedAnime();
    const animeUrl = lastAnime ? (lastAnime.url || lastAnime.animeKey) : null;
    if (lastAnime && animeUrl) {
      console.log(chalk.cyan(`🎬 [Auto-Resume] Found last watched anime: ${chalk.bold(lastAnime.title)}`));
      selectedAnime = {
        title: lastAnime.title,
        url: animeUrl,
        source: lastAnime.source || 'onepiecepower',
        language: lastAnime.language || 'it',
        audio: lastAnime.audio || 'both'
      };
    } else {
      console.log(chalk.yellow('ℹ️ No previous anime found in history to resume from.\n'));
    }
  }

  // 2. Search anime if not resuming
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

    const spinner = ora(`Searching anime catalog for "${searchQuery}"...`).start();
    const results = await oppAnimeProvider.search(searchQuery, selectedLang);
    spinner.stop();

    if (results.length === 0) {
      console.log(chalk.red(`❌ No anime found matching "${searchQuery}".`));
      process.exit(0);
    }

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

  const animeKey = (selectedAnime.url || selectedAnime.title).toLowerCase().trim();

  // 3. Audio track selection if anime has multiple tracks
  let preferredAudio = 'subita';
  if (options.dub) {
    preferredAudio = 'ita';
  } else if (options.sub) {
    preferredAudio = 'subita';
  } else if (selectedAnime.audio === 'ita') {
    preferredAudio = 'ita';
  } else if (selectedAnime.audio === 'subita' || selectedAnime.audio === 'sub') {
    preferredAudio = 'subita';
  } else if (selectedAnime.audio === 'both' || selectedAnime.title.includes('ITA/SUB ITA') || selectedAnime.title.includes('ITA / SUB ITA')) {
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

  // 4. Fetch episodes
  const spinner = ora(`Loading episodes for ${selectedAnime.title}...`).start();
  const episodes = await oppAnimeProvider.getEpisodes(selectedAnime.url);
  spinner.stop();

  if (episodes.length === 0) {
    console.log(chalk.red('❌ No episodes available for this anime series.'));
    process.exit(0);
  }

  console.log(chalk.green(`✔ Found ${episodes.length} episodes!\n`));

  // 5. Episode playback loop
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

    // 6. Resolve video stream
    spinner.start(`Resolving high-speed video stream for "${selectedEpisode.title}"...`);
    const streamData = await oppAnimeProvider.getEpisodeStream(selectedEpisode.url, preferredAudio);
    spinner.stop();

    if (!streamData || !streamData.streamUrl) {
      console.log(chalk.red(`❌ Unable to extract video stream for this episode.`));
      continue;
    }

    console.log(chalk.blue(`\n🚀 Launching video stream in MPV player...`));
    console.log(chalk.dim(`   Title: ${selectedAnime.title} - ${selectedEpisode.title}`));
    console.log(chalk.dim(`   Stream: ${streamData.streamUrl}\n`));

    // Play video stream
    await animePlayer.play(
      streamData.streamUrl,
      selectedAnime.title,
      selectedEpisode.title,
      'https://onepiecepower.com/'
    );

    // Mark as watched
    markEpisodeWatched(animeKey, selectedAnime.title, selectedEpisode, selectedAnime);
    console.log(chalk.green(`✔ Marked "${selectedEpisode.title}" as watched.\n`));

    // Continuous watching prompt
    let inSubLoop = true;
    while (inSubLoop) {
      const currentIndex = currentEpisodes.findIndex(e => e.url === selectedEpisode.url);
      const nextEp = currentIndex + 1 < currentEpisodes.length ? currentEpisodes[currentIndex + 1] : null;

      const nextActionChoices = [
        ...(nextEp ? [{ name: `⏩ Watch next episode (${nextEp.title})`, value: 'next' }] : []),
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
        spinner.start(`Resolving video stream for "${nextEp.title}"...`);
        const nextStream = await oppAnimeProvider.getEpisodeStream(nextEp.url, preferredAudio);
        spinner.stop();

        if (!nextStream || !nextStream.streamUrl) {
          console.log(chalk.red(`❌ Unable to extract video stream for next episode.`));
          selectedEpisode = nextEp;
          continue;
        }

        console.log(chalk.blue(`\n🚀 Streaming next episode in MPV player...`));
        await animePlayer.play(
          nextStream.streamUrl,
          selectedAnime.title,
          nextEp.title,
          'https://onepiecepower.com/'
        );

        markEpisodeWatched(animeKey, selectedAnime.title, nextEp, selectedAnime);
        console.log(chalk.green(`✔ Marked "${nextEp.title}" as watched.\n`));
        selectedEpisode = nextEp;
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

  // 1. Resume directly from last read manga
  if (!query && options.continue) {
    const lastManga = getLastReadManga();
    const mangaUrl = lastManga ? (lastManga.url || lastManga.mangaKey) : null;
    if (lastManga && mangaUrl) {
      console.log(chalk.cyan(`📖 [Auto-Resume] Found last read manga: ${chalk.bold(lastManga.title)}`));
      selectedManga = {
        title: lastManga.title,
        url: mangaUrl,
        source: lastManga.source || (mangaUrl.includes('mangadex') ? 'mangadex' : (mangaUrl.includes('mangapill') ? 'mangapill' : 'onepiecepower')),
        language: lastManga.language || selectedLang || 'it'
      };
      if (!selectedLang && lastManga.language) {
        selectedLang = lastManga.language;
      }
    } else {
      console.log(chalk.yellow('ℹ️ No previous manga found in history to resume from.\n'));
    }
  }

  // 2. Select language and manga if not resuming
  if (!selectedManga) {
    if (!selectedLang) {
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

    const langLabel = selectedLang.toUpperCase();
    const spinner = ora(`Searching manga for "${searchQuery}" [${langLabel}]...`).start();

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
    spinner.stop();

    if (results.length === 0) {
      console.log(chalk.red(`❌ No manga found for "${searchQuery}" in language [${selectedLang}].`));
      process.exit(0);
    }

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

  const mangaKey = (selectedManga.url || selectedManga.id || selectedManga.title).toLowerCase().trim();

  if (selectedManga.source === 'mangadex') {
    chosenProvider = mdProvider;
  } else if (selectedManga.source === 'mangapill') {
    chosenProvider = mpProvider;
  } else {
    chosenProvider = oppProvider;
  }

  // 3. Fetch chapters
  const spinner = ora(`Loading chapters for ${selectedManga.title}...`).start();
  const chapters = await chosenProvider.getChapters(selectedManga.url, selectedLang);
  spinner.stop();

  if (chapters.length === 0) {
    console.log(chalk.red('❌ No chapters available for this manga in the selected language.'));
    process.exit(0);
  }

  console.log(chalk.green(`✔ Found ${chapters.length} chapters!\n`));

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

    // 4. Extract pages
    spinner.start(`Discovering pages for "${selectedChapter.title}"...`);
    const chapterData = await chosenProvider.getChapterPages(selectedChapter.url);
    spinner.stop();

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
        spinner.start(`Discovering pages for "${nextChapter.title}"...`);
        const nextData = await chosenProvider.getChapterPages(nextChapter.url);
        spinner.stop();

        if (nextData.externalUrl) {
          spawn('xdg-open', [nextData.externalUrl], { stdio: 'ignore' });
          markChapterRead(mangaKey, selectedManga.title, nextChapter, selectedManga);
          selectedChapter = nextChapter;
          continue;
        }

        mangaViewer.prepareChapterDir(selectedManga.title, nextChapter.id);
        const dlSpin = ora('Buffering page 1...').start();
        console.log(chalk.magenta('🚀 Opening next chapter instantly!'));
        await mangaViewer.streamAndRead(nextData.pages || nextData, nextChapter.url, (done, total, isComplete) => {
          if (isComplete) dlSpin.succeed(chalk.green(`All ${total} pages streamed into viewer!`));
        });

        markChapterRead(mangaKey, selectedManga.title, nextChapter, selectedManga);
        selectedChapter = nextChapter;
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
