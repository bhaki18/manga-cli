#!/usr/bin/env node

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const OnePiecePowerProvider = require('./providers/onepiecepower');
const MangaViewer = require('./viewer/reader');

// Register autocomplete prompt in inquirer
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

const program = new Command();
const provider = new OnePiecePowerProvider();
const viewer = new MangaViewer();

program
  .name('manga-cli')
  .description('Terminal CLI to read manga online from One Piece Power')
  .version('1.0.0')
  .argument('[query]', 'Search manga by title')
  .action(async (query) => {
    try {
      console.log(chalk.bold.cyan('\n  📖 MANGA CLI - One Piece Power Edition\n'));

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

      // 1. Search manga
      const spinner = ora(`Searching for "${searchQuery}"...`).start();
      const results = await provider.search(searchQuery);
      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.red(`❌ No manga found for "${searchQuery}".`));
        process.exit(0);
      }

      // 2. Select Manga with Inquirer Autocomplete + Fixed Page Size Window
      const mangaChoices = results.slice(0, 50).map(m => ({
        name: `${m.title} ${m.author ? chalk.dim(`(Author: ${m.author})`) : ''}`,
        value: m
      }));

      const mangaAnswer = await inquirer.prompt([
        {
          type: 'autocomplete',
          name: 'manga',
          message: 'Select a manga (type to filter):',
          pageSize: 10,
          source: async (answersSoFar, input) => {
            if (!input) return mangaChoices;
            const clean = input.toLowerCase();
            return mangaChoices.filter(c => c.name.toLowerCase().includes(clean));
          }
        }
      ]);

      const selectedManga = mangaAnswer.manga;

      // 3. Fetch Chapters
      spinner.start(`Loading chapters for ${selectedManga.title}...`);
      const chapters = await provider.getChapters(selectedManga.url);
      spinner.stop();

      if (chapters.length === 0) {
        console.log(chalk.red('❌ No chapters available for this manga.'));
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
              return chapterChoices.filter(c => c.name.toLowerCase().includes(clean));
            }
          }
        ]);

        const selectedChapter = chapterAnswer.chapter;

        // 4. Extract pages with fast parallel batch discovery
        spinner.start(`Discovering pages for "${selectedChapter.title}"...`);
        const chapterData = await provider.getChapterPages(selectedChapter.url);
        spinner.stop();

        if (chapterData.pages.length === 0) {
          console.log(chalk.red('❌ Unable to find pages for this chapter.'));
          continue;
        }

        console.log(chalk.blue(`⚡ Streaming ${chapterData.pages.length} pages in real time into RAM (/dev/shm)...`));

        // 5. Open reader instantly on page 1 and append all subsequent pages via IPC live streaming
        viewer.prepareChapterDir(selectedManga.title, selectedChapter.id);
        const downloadSpinner = ora('Buffering page 1 (opening viewer)...').start();

        console.log(chalk.magenta('🚀 Reader opening instantly! (subsequent pages are being pushed live)'));
        await viewer.streamAndRead(
          chapterData.pages,
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
          const nextData = await provider.getChapterPages(nextChapter.url);
          spinner.stop();

          viewer.prepareChapterDir(selectedManga.title, nextChapter.id);
          const dlSpin = ora('Buffering page 1...').start();
          console.log(chalk.magenta('🚀 Opening next chapter instantly!'));
          await viewer.streamAndRead(nextData.pages, nextChapter.url, (done, total, isComplete) => {
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
