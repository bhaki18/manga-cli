# Arch Linux base per testare fedelmente l'ambiente di build e runtime AUR
FROM archlinux:latest

# Aggiorna keyring e pacchetti di sistema
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm --needed \
      base-devel \
      git \
      nodejs \
      npm \
      curl \
      fzf \
      mpv \
      sudo

# Crea un utente non-root (makepkg su Arch non può girare come root)
RUN useradd -m -s /bin/bash builder && \
    echo "builder ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

WORKDIR /app
COPY . /app
RUN chown -R builder:builder /app

USER builder

# Installa le dipendenze npm
RUN npm install

# Crea il link globale manga-cli
USER root
RUN npm link
USER builder

ENTRYPOINT ["manga-cli"]
CMD ["--help"]
