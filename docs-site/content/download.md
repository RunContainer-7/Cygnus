---
title: Download
description: Get the latest Cygnus build for Windows as a normal installer or a portable .exe.
---

## Pick a build

Both builds contain the same app and the same models. The difference is how they start.

- **Installer** — recommended. Installs Cygnus for your Windows user, adds a Start-menu shortcut, and can update itself from inside the app.
- **Portable** — a single `.exe` that runs without installing anything. Keep it in a folder you control. Portable builds cannot update in place, so download a fresh file for each release.

The cards above always point at the release that matches the version in the header.

## Requirements

- Windows 10 or 11 on x64.
- About 1 GB of free disk space for the app, plus room for projects.
- No Node.js, no terminal, and no separate model server. Hosted models need only an internet connection.
- On-device models need enough RAM for the model you pick; the picker disables models that will not fit.

## Windows SmartScreen

The builds are not code-signed, so Windows may show **Windows protected your PC** the first time. Click **More info**, then **Run anyway**. Cygnus is open source, so every line that runs is on GitHub.

## Updates

Installed builds check GitHub Releases on launch and offer an in-app update. You can also install a newer build over the top; your projects and chats are kept. Portable builds show a download link instead of updating themselves.

## Verify a download

Each card lists the file's SHA-256 checksum. To check a file on Windows:

```powershell
Get-FileHash .\Cygnus-Setup.exe -Algorithm SHA256
```

The result should match the checksum shown on this page. If it does not, delete the file and download it again from the release page.
