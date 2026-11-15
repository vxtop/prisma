# Changelog

All notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [Semantic Versioning](https://semver.org/).

## [0.6.0] — 2026-11-15

First public-ready release, named **vxtop** (formerly SIMULA).

### Added
- Hover preview: live windows of the programs using a folder, images, videos and texts being touched, files open right now.
- First-run welcome, with an opt-in for live images of your windows.
- Clicking the read-only badge relaunches the server with administrator rights.
- Smoke and end-to-end tests (`npm test`, `npm run test:e2e`), CI on Windows and Linux.
- Apache-2.0 license, NOTICE, contributing and security guides, English and Spanish docs.

### Changed
- Starts without administrator rights.
- Client split into ordered modules served as one bundle with a source map.
- Live view shows only what is in use now (8 s), up to 24 activity groups.
- One click selects, centres and opens; focus dims everything unrelated.
- Programs are 27-cell cubes floating above the folders; no floor.
- Code and comments in English.

### Fixed
- The native Windows helper no longer exceeds the command-line length limit.
- A habitual double click no longer cancels the camera framing.

### Removed
- Decorative particles, process bar cards, type chips, selection brackets and the Channels tab.
