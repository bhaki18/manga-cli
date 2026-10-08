#!/usr/bin/env node

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { spawn } = require('child_process');
const OnePiecePowerProvider = require('./providers/onepiecepower');
const MangaDexProvider = require('./providers/mangadex');
const MangapillProvider = require('./providers/mangapill');
const MangaViewer = require('./viewer/reader');
const { LANGUAGES, getLanguageName, getLanguageFlag } = require('./utils/languages');

// Register autocomplete prompt in inquirer
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

const program = new Command();
const oppProvider = new OnePiecePowerProvider();
const mdProvider = new MangaDexProvider();
const mpProvider = new MangapillProvider();
const viewer = new MangaViewer();

program
  .name('manga-cli')
  .description('Terminal CLI to read manga online with RAM caching and 30+ language support')
  .version('1.1.0')
  .argument('[query]', 'Search manga by title')
  .option('-l, --lang <language>', 'Filter by scan language code (e.g. it, en, es, fr, ja)', null)
  .action(async (query, options) => {
    try {
      console.log(chalk.bold.cyan('\n  📖 MANGA CLI - Universal Terminal Manga Reader\n'));

      // 0. Language Selection
      let selectedLang = options.lang ? options.lang.toLowerCase() : null;

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

      // 1. Search across providers
      const langLabel = selectedLang.toUpperCase();
      const spinner = ora(`Searching for "${searchQuery}" [${langLabel}]...`).start();

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

      // 2. Select Manga
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

      const selectedManga = mangaAnswer.manga;
      let chosenProvider = oppProvider;
      if (selectedManga.source === 'mangadex') {
        chosenProvider = mdProvider;
      } else if (selectedManga.source === 'mangapill') {
        chosenProvider = mpProvider;
      }

      // 3. Fetch Chapters
      spinner.start(`Loading chapters for ${selectedManga.title}...`);
      const chapters = await chosenProvider.getChapters(selectedManga.url, selectedLang);
      spinner.stop();

      if (chapters.length === 0) {
        console.log(chalk.red('❌ No chapters available for this manga in the selected language.'));
        process.exit(0);
      }

      console.log(chalk.green(`✔ Found ${chapters.length} chapters!\n`));

      // Loop to allow reading consecutive chapters
      let currentChapters = chapters;
      let keepReading = true;

      while (keepReading) {
        const chapterChoices = currentChapters.map(c => ({
          name: c.title,
          value: c
        }));

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

        const selectedChapter = chapterAnswer.chapter;

        // 4. Extract pages
        spinner.start(`Discovering pages for "${selectedChapter.title}"...`);
        const chapterData = await chosenProvider.getChapterPages(selectedChapter.url);
        spinner.stop();

        // If it's an official external release (like MangaPlus Shueisha)
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

        // 5. Open reader instantly on page 1 and append all subsequent pages
        viewer.prepareChapterDir(selectedManga.title, selectedChapter.id);
        const downloadSpinner = ora('Buffering page 1 (opening viewer)...').start();

        console.log(chalk.magenta('🚀 Reader opening instantly! (subsequent pages are being pushed live)'));
        await viewer.streamAndRead(
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

        console.log(chalk.green('✔ Chapter finished and RAM cache cleared.\n'));

        // Ask for next action
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
            continue;
          }

          viewer.prepareChapterDir(selectedManga.title, nextChapter.id);
          const dlSpin = ora('Buffering page 1...').start();
          console.log(chalk.magenta('🚀 Opening next chapter instantly!'));
          await viewer.streamAndRead(nextData.pages || nextData, nextChapter.url, (done, total, isComplete) => {
            if (isComplete) dlSpin.succeed(chalk.green(`All ${total} pages streamed into viewer!`));
          });
        } else if (nextActionAnswer.action === 'choose') {
          continue;
        } else {
          keepReading = false;
        }
      }

      console.log(chalk.cyan('Thank you for using manga-cli! See you next time. 👋'));
    } catch (err) {
      if (err.name === 'ExitPromptError') {
        console.log(chalk.yellow('\nOperation cancelled.'));
      } else {
        console.error(chalk.red(`\nUnexpected error: ${err.message}`));
      }
      viewer.cleanUp();
      process.exit(0);
    }
  });

program.parse();
