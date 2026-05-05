Place platform icons and build resources here for electron-builder.

Recommended files:
- icon.ico  (Windows)
- icon.icns (macOS)
- icon.png  (fallback)

Example: to build a Windows installer locally:

```bash
npm run dist
```

If you don't provide icons, electron-builder will use defaults. Replace `appId` and `productName` in `package.json`'s `build` section before publishing.