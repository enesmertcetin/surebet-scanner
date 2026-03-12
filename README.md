# surebet

This folder is a Node.js and Playwright toolkit for sportsbook endpoint discovery, raw market-data capture, formatter experiments, and surebet comparison workflows.

## Stack

- Node.js
- Playwright
- WebSocket tooling
- Custom scraping and normalization scripts

## What This Project Does

- Captures network traffic and iframe behavior from Digitain-based and other betting providers.
- Fetches and reformats bookmaker market data from sources such as Bilyoner, Holiganbet, and Tempobet.
- Probes site APIs, WebSocket channels, and frontend assets to reverse engineer usable data sources.
- Compares normalized odds data to test surebet and realtime arbitrage ideas.

## Highlights

- Covers multiple bookmakers and reverse-engineering workflows in one toolkit.
- Includes both data capture utilities and odds comparison scripts.
- Organized with per-file documentation for the large script inventory.

## Dependencies

- `playwright`
- `ws`

## Documentation

- [CODE_FILES.md](CODE_FILES.md) lists every JavaScript and MJS source file in this project.
- [code-docs/](code-docs/) contains one markdown explanation per source file.