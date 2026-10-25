const BaseProvider = require('./base');
const ProviderManager = require('./manager');

module.exports = {
  BaseProvider,
  BaseMangaProvider: BaseProvider.BaseMangaProvider,
  BaseAnimeProvider: BaseProvider.BaseAnimeProvider,
  ProviderManager
};
