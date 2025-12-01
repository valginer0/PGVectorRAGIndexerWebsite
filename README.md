# PGVectorRAGIndexer Website

Modern marketing and documentation website for [PGVectorRAGIndexer](https://github.com/valginer0/PGVectorRAGIndexer).

## Features

- 🎨 **Premium Dark Mode Design** - Vibrant gradients and glassmorphism effects
- ⚡ **Fast & Lightweight** - Built with Vite for optimal performance
- 📱 **Fully Responsive** - Beautiful on all devices
- ✨ **Smooth Animations** - Scroll-triggered animations and micro-interactions
- 🎯 **SEO Optimized** - Proper meta tags and semantic HTML

## Local Development

### Prerequisites

- Node.js 16+ and npm

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   - Navigate to http://localhost:5173

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Deployment Options

### GitHub Pages

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy the `dist/` folder to GitHub Pages

### Netlify

1. Connect your repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`

### Vercel

1. Connect your repository to Vercel
2. Vercel will auto-detect Vite configuration
3. Deploy with one click

## Project Structure

```
PGVectorRAGIndexerWebsite/
├── index.html          # Main HTML file
├── src/
│   ├── style.css       # All styles and design system
│   └── main.js         # Interactive functionality
├── public/             # Static assets
├── package.json        # Dependencies
└── README.md          # This file
```

## Technology Stack

- **Vite** - Build tool and dev server
- **Vanilla HTML/CSS/JS** - No framework overhead
- **Google Fonts** - Inter (UI) and JetBrains Mono (code)

## Design System

The website uses CSS custom properties for a consistent design:

- **Colors**: Premium dark mode with purple/pink/cyan accents
- **Typography**: Inter for UI, JetBrains Mono for code
- **Effects**: Glassmorphism, gradients, smooth transitions
- **Responsive**: Mobile-first with breakpoints at 480px, 768px, 1024px

## License

Same as PGVectorRAGIndexer - Dual licensed (Community/Commercial)

## Support

For issues with the website, please contact valginer0@gmail.com
