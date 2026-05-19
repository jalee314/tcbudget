# TCBudget

**Pokémon TCG P&L Tracker** — track your collection like a stock portfolio.

- Portfolio grid with cost basis, market value, and realized/unrealized P&L
- Pack-opening flow with animations and sealed-product tracking
- Analytics and market watchlist (powered by [JustTCG](https://justtcg.com) when an API key is set)
- Local SQLite database — your data stays on your machine

**Website:** [jalee314.github.io/tcbudget](https://jalee314.github.io/tcbudget)  
**Downloads:** [GitHub Releases](https://github.com/jalee314/tcbudget/releases/latest)

## Requirements

- Node.js 20+
- macOS or Windows (Linux builds are not configured yet)

## Development

```bash
git clone https://github.com/jalee314/tcbudget.git
cd tcbudget
npm install
```

Optional: create a `.env` file in the project root for live market prices:

```env
JUSTTCG_API_KEY=your_key_here
```

```bash
npm run dev      # Electron dev server
npm run build    # Compile main/preload/renderer
npm run dist     # Build installers locally (output in dist/)
```

## Releasing

1. Merge changes into `main`.
2. Bump `version` in `package.json` and commit.
3. Tag and push:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

4. The **Release** workflow builds macOS (DMG + zip) and Windows (NSIS) installers and attaches them to the GitHub release.
5. The **Deploy Pages** workflow updates the landing site on every push to `main`.

First-time setup on GitHub:

1. **Settings → Pages → Build and deployment:** Source = **GitHub Actions**.
2. Ensure **Actions** are enabled for the repository.
3. After the first tag push, installers appear under **Releases**.

## Project layout

| Path | Purpose |
|------|---------|
| `src/main/` | Electron main process, SQLite, IPC |
| `src/preload/` | Secure bridge to renderer |
| `src/renderer/` | React UI |
| `docs/` | Static landing page (GitHub Pages) |
| `build/` | App icons for electron-builder |

## License

Private / all rights reserved unless a license file is added.
