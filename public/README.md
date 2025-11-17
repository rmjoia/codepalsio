# Public Assets

This folder contains static assets served directly by the web server.

## Structure

```
public/
├── README.md              (this file)
├── codepals00.jpg         (optimized logo - add here)
├── favicon.ico            (generated from logo - add here)
└── utilities/             (image processing scripts - NOT committed)
    └── .gitignore         (ignores all processing tools)
```

## Adding Assets

1. **Logo** (`codepals00.jpg`):
   - Source: CodePals00.png from `/specs/001-codepals-mvp/branding/`
   - Optimize using your image processor
   - Save as JPEG in this folder
   - Referenced in Header.astro and Footer.astro

2. **Favicon** (`favicon.ico`):
   - Generate from logo using image utilities in `public/utilities/`
   - Save as ICO format in this folder
   - Referenced in index.astro

## Image Utilities

Place your image processing scripts in `public/utilities/`:
- Logo optimization scripts
- Favicon generation scripts
- Image compression tools
- Batch processing scripts

These tools stay in `public/utilities/` and are **NOT committed** to the repository (protected by `.gitignore`).

## Notes

- Only final optimized assets belong in `public/` root
- Keep raw source files outside this repository
- Use image utilities in `public/utilities/` for processing
- Never commit unoptimized or processing files
