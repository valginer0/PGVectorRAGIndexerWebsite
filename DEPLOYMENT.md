# Deployment Guide

This website is configured for FREE deployment to three platforms. Follow the instructions below.

## ✅ Already Configured

- ✅ **Netlify**: `netlify.toml` pushed to repository
- ✅ **Vercel**: `vercel.json` pushed to repository  
- ⚠️ **GitHub Pages**: Workflow file created locally (see instructions below)

---

## 🚀 GitHub Pages Setup

### Step 1: Add GitHub Actions Workflow

The workflow file is located at `.github/workflows/deploy.yml` but couldn't be pushed automatically due to token permissions.

**Option A: Upload via GitHub UI** (Recommended)

1. Go to https://github.com/valginer0/PGVectorRAGIndexerWebsite
2. Click "Add file" → "Create new file"
3. Name it: `.github/workflows/deploy.yml`
4. Copy and paste the content from the local file:
   ```
   /home/valginer0/projects/PGVectorRAGIndexerWebsite/.github/workflows/deploy.yml
   ```
5. Commit the file

**Option B: Push with Proper Token**

If you have a GitHub token with `workflow` scope, you can push directly:
```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Actions workflow"
git push
```

### Step 2: Enable GitHub Pages

1. Go to repository **Settings** → **Pages**
2. Under "Build and deployment":
   - Source: Select **GitHub Actions**
3. The workflow will trigger automatically on the next push

### Step 3: Verify Deployment

- Check the **Actions** tab to monitor deployment progress
- Once complete, visit: https://valginer0.github.io/PGVectorRAGIndexerWebsite

---

## 🌐 Netlify Setup (2 Minutes)

1. Go to https://netlify.com and sign in with GitHub
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **GitHub** → Select **`PGVectorRAGIndexerWebsite`** repository
4. Click **"Deploy"** (settings auto-detected from `netlify.toml`)

**Live URL**: `https://[your-site-name].netlify.app`

**Customize URL**:
- Go to Site settings → Domain management
- Click "Options" → "Edit site name"

---

## ⚡ Vercel Setup (2 Minutes)

1. Go to https://vercel.com and sign in with GitHub
2. Click **"Add New"** → **"Project"**
3. Import **`PGVectorRAGIndexerWebsite`** repository
4. Click **"Deploy"** (settings auto-detected from `vercel.json`)

**Live URL**: `https://[your-project-name].vercel.app`

**Customize URL**:
- Go to Project settings → Domains
- Add your custom domain or change the Vercel subdomain

---

## 📊 Deployment Status

| Platform | Status | URL | Setup Time |
|----------|--------|-----|------------|
| **GitHub Pages** | ⚠️ Needs workflow upload | https://valginer0.github.io/PGVectorRAGIndexerWebsite | 2 min |
| **Netlify** | ✅ Ready to deploy | `https://[name].netlify.app` | 2 min |
| **Vercel** | ✅ Ready to deploy | `https://[name].vercel.app` | 1 min |

---

## 🎯 Next Steps

1. **Upload GitHub Actions workflow** (Option A above)
2. **Deploy to Netlify** (follow Netlify setup)
3. **Deploy to Vercel** (follow Vercel setup)

All three platforms will auto-deploy on every push to `main` after initial setup!

---

## 💰 Cost

**All three platforms are 100% FREE** for this static website:
- No credit card required
- No hidden fees
- Generous free tier limits (100GB bandwidth/month each)

---

## 🔧 Troubleshooting

**GitHub Actions not running?**
- Ensure workflow file is in `.github/workflows/deploy.yml`
- Check Actions tab for error messages
- Verify Pages source is set to "GitHub Actions"

**Netlify build failing?**
- Check build logs in Netlify dashboard
- Ensure `netlify.toml` is in repository root

**Vercel deployment issues?**
- Check deployment logs in Vercel dashboard
- Ensure `vercel.json` is in repository root
