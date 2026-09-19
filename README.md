# passwordgen

A standalone, offline secure password/passphrase generator — a single self-contained HTML file (`secure-password-generator.html`, mirrored as `index.html` for GitHub Pages) with no external dependencies, server, or network requests. Open either file directly in a browser to use it.

## Development

`secure-password-generator.html` and `index.html` must stay byte-identical; after editing one, copy it over the other:

```
cp secure-password-generator.html index.html
```

## Testing

A Playwright smoke test drives the real page through its core flows (generation, batch mode, QR codes) and runs the page's own in-page self-test suite (see the "Local self-tests" section in the page itself). It runs in CI on every push, and locally with:

```
npm ci
npx playwright install chromium
npm test
```
