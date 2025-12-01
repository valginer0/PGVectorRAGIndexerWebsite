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

## Deployment

The website is configured for deployment to **three platforms** - all with **FREE hosting**!

### 🚀 GitHub Pages (Automatic)

**Status**: ✅ Configured with GitHub Actions

The site automatically deploys to GitHub Pages on every push to `main`.

**Live URL**: https://valginer0.github.io/PGVectorRAGIndexerWebsite

**Setup** (one-time):
1. Go to repository Settings → Pages
2. Under "Build and deployment":
   - Source: **GitHub Actions**
3. Push to main branch - deployment starts automatically!

**Note**: First deployment may take 2-3 minutes. Check the "Actions" tab to monitor progress.

---

### 🌐 Netlify (2-Click Setup)

**Status**: ✅ Configured with `netlify.toml`

**Setup**:
1. Go to [netlify.com](https://netlify.com) and sign in with GitHub
2. Click "Add new site" → "Import an existing project"
3. Choose GitHub → Select `PGVectorRAGIndexerWebsite` repository
4. Click "Deploy" (settings auto-detected from `netlify.toml`)

**Live URL**: `https://[your-site-name].netlify.app` (customizable in settings)

**Features**:
- Automatic deployments on every push
- Deploy previews for pull requests
- Custom domain support (free)
- Instant rollbacks

---

### ⚡ Vercel (2-Click Setup)

**Status**: ✅ Configured with `vercel.json`

**Setup**:
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New" → "Project"
3. Import `PGVectorRAGIndexerWebsite` repository
4. Click "Deploy" (settings auto-detected from `vercel.json`)

**Live URL**: `https://[your-project-name].vercel.app` (customizable)

**Features**:
- Automatic deployments on every push
- Preview deployments for branches
- Edge network (ultra-fast globally)
- Custom domain support (free)

---

### 📊 Platform Comparison

| Feature | GitHub Pages | Netlify | Vercel |
|---------|-------------|---------|--------|
| **Cost** | Free | Free | Free |
| **Bandwidth** | 100GB/month | 100GB/month | 100GB/month |
| **Auto Deploy** | ✅ | ✅ | ✅ |
| **Custom Domain** | ✅ | ✅ | ✅ |
| **HTTPS** | ✅ | ✅ | ✅ |
| **Deploy Time** | ~2-3 min | ~1-2 min | ~1 min |
| **Setup** | Automatic | 2 clicks | 2 clicks |

**Recommendation**: Deploy to all three! They're all free and provide redundancy.

---

## Local Development

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
