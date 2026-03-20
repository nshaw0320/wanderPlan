# 🗺️ WanderPlan

A full-featured trip planner PWA — from quick day trips to complex multi-week adventures. Built with vanilla JS, Firebase Firestore, and optionally powered by Claude AI.

---

## ✨ Features

- **Multiple trips** — create, manage, and switch between any number of trips
- **Trip types** — Day Trip, Weekend, Road Trip, Vacation, Business, Adventure, Cruise, Other
- **Full itinerary builder** — day-by-day with events (time, category, details)
- **Smart packing lists** — organized by category with check-off progress
- **Budget tracker** — log expenses by category, track against your budget
- **Notes** — capture ideas, links, and anything useful
- **AI features** (optional) — generate trip summaries, packing lists, and day itineraries via Claude
- **PIN authentication** — 4–6 digit PIN stored securely as a SHA-256 hash
- **PWA** — installable on mobile and desktop
- **Firebase backend** — all data persisted in Firestore

---

## 🚀 Setup Guide

### Step 1 — Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

### Step 2 — Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → follow the steps
3. In your project, go to **Firestore Database** → **Create database**
   - Choose **Start in production mode**
   - Pick a region close to you
4. Go to **Project Settings** (⚙️) → **Your apps** → click **</>** (Web)
5. Register the app (no need for Firebase Hosting)
6. Copy the `firebaseConfig` object shown

### Step 3 — Configure Firebase

Edit `js/firebase-config.js` and paste your config:

```js
export const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc..."
};
```

### Step 4 — Set Firestore security rules

In Firebase Console → Firestore → **Rules**, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /wanderplan/{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ This grants open access — the PIN is your security gate. For additional security, consider IP restrictions or Firebase App Check.

### Step 5 — Push to GitHub

```bash
git add .
git commit -m "Initial WanderPlan setup"
git push origin main
```

### Step 6 — Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. The included workflow (`.github/workflows/deploy.yml`) will auto-deploy on every push to `main`
4. Your app will be live at: `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

---

## 🤖 AI Features (Optional)

WanderPlan can use Claude AI to:
- Generate a trip summary and travel tips
- Build a packing list tailored to your trip
- Suggest a full day itinerary

### Setup AI

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Open WanderPlan → click **⚙️ Settings**
3. Paste your API key under **AI API Key** → Save
   - The key is stored in Firestore (same as all your data)

> **Note:** API calls are made directly from your browser (client-side). This requires CORS access — the Anthropic API supports `anthropic-dangerous-direct-browser-access: true` for personal projects. Do not share your API key publicly.

---

## 📱 Install as PWA

- **iOS:** Safari → Share → Add to Home Screen
- **Android/Chrome:** Menu → Install App
- **Desktop Chrome:** Address bar → install icon

---

## 🗂️ Project Structure

```
wanderplan/
├── index.html                  # Main app shell
├── manifest.json               # PWA manifest
├── css/
│   └── styles.css              # All styles
├── js/
│   ├── firebase-config.js      # ← YOUR FIREBASE CONFIG GOES HERE
│   ├── db.js                   # Firestore data layer
│   ├── auth.js                 # PIN authentication
│   ├── ai.js                   # Claude AI integration
│   ├── ui.js                   # UI helpers (modals, toasts, etc.)
│   └── app.js                  # Main application logic
└── .github/
    └── workflows/
        └── deploy.yml          # Auto-deploy to GitHub Pages
```

---

## 🔒 Security Notes

- Your PIN is hashed with SHA-256 before being stored in Firestore — it is never stored in plaintext
- The Firestore rules above allow anyone who knows your Firebase project URL to read/write data — the PIN is the only access control
- For higher security, consider restricting Firestore access by Firebase App Check or API key restrictions in Google Cloud Console
- Never commit your Anthropic API key to the repo — store it via the in-app Settings panel

---

## 🛠️ Local Development

Since the app uses ES modules imported from Firebase CDN, you need a local HTTP server (not `file://`):

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .

# VS Code: use "Live Server" extension
```

Then open `http://localhost:8080`

---

## 📝 License

MIT — do whatever you like with it.
