# Portfolio Dashboard Deployment Guides

## Backend Deployment (Render)

### Step 1: Create Render Account & Web Service
1. Go to https://render.com and sign up (free tier available)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configuration:
   - **Name**: `portfolio-api` (or your choice)
   - **Environment**: `Python 3.11`
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `gunicorn -w 4 -b 0.0.0.0:$PORT backend.app.main:app`
   - **Region**: Choose closest to you (e.g., us-east-1)
   - **Free Tier**: Select it (auto-spins down after 15 min inactivity)

5. Click **Create Web Service** and wait ~3-5 minutes for build
6. Once deployed, note your URL (e.g., `https://portfolio-api.onrender.com`)
7. Copy this URL for the Vercel frontend deployment step

### Step 2: Test Backend is Working
Once Render build completes:
```bash
curl https://portfolio-api.onrender.com/docs
# Should return Swagger UI
```

---

## Frontend Deployment (Vercel)

### Step 1: Deploy via Vercel Dashboard
1. Go to https://vercel.com and sign in with GitHub
2. Click **Add New...** → **Project**
3. Select your portfolio dashboard repository
4. Configuration:
   - **Framework**: `Other` (since it's static vanilla JS)
   - **Root Directory**: `./frontend`
   - **Build Command**: (leave empty)
   - **Output Directory**: `.` (use default)
   - **Environment Variables**: Add:
     - Key: `VITE_API_URL`
     - Value: `https://portfolio-api.onrender.com` (your Render URL)

5. Click **Deploy** and wait ~1-2 minutes

### Step 2: Get Your Vercel URL
Once deployed, Vercel will show your production URL (e.g., `https://portfolio-dashboard-abc123.vercel.app`)

### Step 3: Update Backend CORS (Already Done)
The backend now allows requests from your Vercel domain. No additional config needed!

---

## Testing the Live Deployment

1. Open your Vercel URL in a browser
2. Upload a CSV file
3. Run analysis - should see data loading from Render backend
4. Check browser DevTools → Network tab to confirm API calls go to Render

---

## Troubleshooting

### "CORS error" or "Failed to fetch"
- Check backend URL is correct in Vercel env variable
- Backend must be running on Render (check Render dashboard)
- Wait ~1 min after first Render deploy (cold start)

### "API calls going to localhost"
- Vercel needs rebuild after env variable change
- Go to Vercel dashboard → Settings → Environment Variables → Redeploy

### CSV uploads failing
- File size limit on Vercel is 4.5MB (should be fine for Robinhood CSVs)
- Check backend `/api/upload-csv` endpoint working on Render

### Cold start delays (Render free tier)
- Free tier spins down after 15 min inactivity
- First request will take 30-60 sec to spin up (normal)
- Upgrade to paid tier for always-on backend

---

## Environment Variables Summary

**Vercel Frontend:**
```
VITE_API_URL = https://portfolio-api.onrender.com
```

**Render Backend:**
- No env vars needed for basic setup
- Optional: Add DATABASE_URL if you add persistence later

---

## Updating Your App

### To push new features:
```bash
git add -A
git commit -m "Feature: new feature"
git push origin main
```

Both Vercel and Render will auto-redeploy on git push to main branch!

### To update backend only:
Changes to `backend/app/main.py`, `helper.py` → auto-deployed to Render

### To update frontend only:
Changes to `frontend/` files → auto-deployed to Vercel
