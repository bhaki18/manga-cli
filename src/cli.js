#!/usr/bin/env node

const { Command } = require('commander');
const prompts = require('prompts');
const chalk = require('chalk');
const ora = require('ora');
const OnePiecePowerProvider = require('./providers/onepiecepower');
const MangaViewer = require('./viewer/reader');

const program = new Command();
const provider = new OnePiecePowerProvider();
const viewer = new MangaViewer();

program
  .name('manga-cli')
  .description('CLI per leggere manga da One Piece Power direttamente da terminale')
  .version('1.0.0')
  .argument('[query]', 'Cerca un manga per nome')
  .action(async (query) => {
    try {
      console.log(chalk.bold.cyan('\n  📖 MANGA CLI - One Piece Power Edition\n'));

      let searchQuery = query;
      if (!searchQuery) {
        const response = await prompts({
          type: 'text',
          name: 'query',
          message: '🔍 Che manga vuoi leggere?',
          validate: value => value.trim().length > 0 ? true : 'Inserisci un titolo da cercare'
        });

        if (!response.query) {
          console.log(chalk.yellow('Operazione annullata.'));
          process.exit(0);
        }
        searchQuery = response.query;
      }

      // 1. Search manga
      const spinner = ora(`Ricerca di "${searchQuery}" in corso...`).start();
      const results = await provider.search(searchQuery);
      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.red(`❌ Nessun manga trovato per "${searchQuery}".`));
        process.exit(0);
      }

      // 2. Select Manga
      const mangaChoices = results.slice(0, 30).map(m => ({
        title: `${m.title} ${m.author ? chalk.dim(`(Autore: ${m.author})`) : ''}`,
        description: m.genres ? chalk.dim(m.genres) : '',
        value: m
      }));

      const mangaPrompt = await prompts({
        type: 'autocomplete',
        name: 'manga',
        message: 'Seleziona un manga:',
        choices: mangaChoices,
        limit: 15
      });

      if (!mangaPrompt.manga) {
        console.log(chalk.yellow('Nessun manga selezionato.'));
        process.exit(0);
      }

      const selectedManga = mangaPrompt.manga;

      // 3. Fetch Chapters
      spinner.start(`Caricamento capitoli di ${selectedManga.title}...`);
      const chapters = await provider.getChapters(selectedManga.url);
      spinner.stop();

      if (chapters.length === 0) {
        console.log(chalk.red('❌ Nessun capitolo disponibile per questo manga.'));
        process.exit(0);
      }

      console.log(chalk.green(`✔ Trovati ${chapters.length} capitoli!\n`));

      // Loop to allow reading consecutive chapters
      let currentChapters = chapters;
      let keepReading = true;

      while (keepReading) {
        const chapterChoices = currentChapters.map(c => ({
          title: c.title,
          value: c
        }));

        const chapterPrompt = await prompts({
          type: 'autocomplete',
          name: 'chapter',
          message: 'Seleziona il capitolo da leggere:',
          choices: chapterChoices,
          limit: 15
        });

        if (!chapterPrompt.chapter) {
          console.log(chalk.yellow('Uscita dalla lettura.'));
          break;
        }

        const selectedChapter = chapterPrompt.chapter;

        // 4. Extract pages
        spinner.start(`Recupero pagine di "${selectedChapter.title}"...`);
        const chapterData = await provider.getChapterPages(selectedChapter.url);
        spinner.stop();

        if (chapterData.pages.length === 0) {
          console.log(chalk.red('❌ Impossibile trovare le pagine per questo capitolo.'));
          continue;
        }

        console.log(chalk.blue(`📥 Scaricamento di ${chapterData.pages.length} pagine in RAM (/dev/shm)...`));

        // 5. Download in RAM
        viewer.prepareChapterDir(selectedManga.title, selectedChapter.id);
        const downloadSpinner = ora('Download pagine in corso: 0%').start();

        const files = await viewer.downloadPages(
          chapterData.pages,
          selectedChapter.url,
          (done, total) => {
            const percent = Math.round((done / total) * 100);
            downloadSpinner.text = `Download pagine in RAM: ${percent}% (${done}/${total})`;
          }
        );

        downloadSpinner.succeed(chalk.green(`Pagine caricate in RAM con successo!`));

        // 6. Open Reader
        console.log(chalk.magenta('🚀 Apertura del lettore...'));
        await viewer.openViewer(files);
        console.log(chalk.green('✔ Capitolo terminato e cache RAM eliminata.\n'));

        // Ask for next action
        const currentIndex = currentChapters.findIndex(c => c.url === selectedChapter.url);
        const nextChapter = currentIndex + 1 < currentChapters.length ? currentChapters[currentIndex + 1] : null;

        const nextAction = await prompts({
          type: 'select',
          name: 'action',
          message: 'Cosa vuoi fare adesso?',
          choices: [
            ...(nextChapter ? [{ title: `⏩ Leggi capitolo successivo (${nextChapter.title})`, value: 'next' }] : []),
            { title: '📑 Scegli un altro capitolo', value: 'choose' },
            { title: '🚪 Esci', value: 'exit' }
          ]
        });

        if (nextAction.action === 'next' && nextChapter) {
          // Select automatically the next one
          spinner.start(`Recupero pagine di "${nextChapter.title}"...`);
          const nextData = await provider.getChapterPages(nextChapter.url);
          spinner.stop();

          viewer.prepareChapterDir(selectedManga.title, nextChapter.id);
          const dlSpin = ora('Download capitolo successivo in RAM...').start();
          const nextFiles = await viewer.downloadPages(nextData.pages, nextChapter.url, (done, total) => {
            dlSpin.text = `Download pagine in RAM: ${Math.round((done/total)*100)}% (${done}/${total})`;
          });
          dlSpin.succeed(chalk.green('Pronto!'));
          await viewer.openViewer(nextFiles);
        } else if (nextAction.action === 'choose') {
          continue;
        } else {
          keepReading = false;
        }
      }

      console.log(chalk.cyan('Grazie per aver usato manga-cli! A presto. 👋'));
    } catch (err) {
      console.error(chalk.red(`\nErrore imprevisto: ${err.message}`));
      viewer.cleanUp();
      process.exit(1);
    }
  });

program.parse();
