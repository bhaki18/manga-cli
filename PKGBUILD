# Maintainer: bhaki18 <https://github.com/bhaki18>
pkgname=manga-cli-git
pkgver=1.1.0
pkgrel=1
pkgdesc="Terminal CLI to read manga online with RAM caching, inspired by ani-cli"
arch=('any')
url="https://github.com/bhaki18/manga-cli"
license=('MIT')
depends=('nodejs' 'curl')
optdepends=(
    'mpv: lettore multimediale e visualizzatore immagini'
    'feh: visualizzatore immagini leggero da terminale'
    'sxiv: simple X image viewer'
    'fzf: menu interattivo fuzzy finder'
)
makedepends=('npm' 'git')
provides=('manga-cli')
conflicts=('manga-cli')
source=("$pkgname::git+https://github.com/bhaki18/manga-cli.git")
sha256sums=('SKIP')

package() {
    cd "$srcdir/$pkgname"
    npm install --omit=dev --no-audit --no-fund

    # Installa i file in /usr/lib/node_modules/manga-cli
    install -d "$pkgdir/usr/lib/node_modules/$pkgname"
    cp -r . "$pkgdir/usr/lib/node_modules/$pkgname/"

    # Rendi eseguibile l'entrypoint
    chmod +x "$pkgdir/usr/lib/node_modules/$pkgname/src/cli.js"

    # Crea il comando 'manga-cli' direttamente in /usr/bin/
    install -d "$pkgdir/usr/bin"
    ln -s "/usr/lib/node_modules/$pkgname/src/cli.js" "$pkgdir/usr/bin/manga-cli"
}
