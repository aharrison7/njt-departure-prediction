/**
 * GitHub Bidirectional Data Sync
 * 
 * Manages bidirectional synchronization between Render and GitHub:
 * 1. Pull on Startup: Loads and merges historical track data from GitHub into Render.
 * 2. Push on Schedule: Commits updated historical data back to GitHub.
 * 
 * This ensures Render is the single authoritative live scraper and prevents
 * GitHub from ever overwriting Render's active data.
 */

const fs = require('fs');
const path = require('path');

class GitHubSync {
  constructor(options = {}) {
    this.token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
    this.repo = options.repo || process.env.GITHUB_REPO || 'aharrison7/njt-departure-prediction';
    this.branch = options.branch || process.env.GITHUB_BRANCH || 'main';
    this.lastSync = null;
    this.lastPull = null;
    this.isSyncing = false;
  }

  /**
   * Check if GitHub Sync is configured.
   */
  isConfigured() {
    return Boolean(this.token && this.repo);
  }

  /**
   * Pull and merge remote file from GitHub into local data folder.
   */
  async pullFile(filename) {
    const localDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localPath = path.join(localDir, filename);

    const rawUrl = `https://raw.githubusercontent.com/${this.repo}/${this.branch}/data/${filename}`;
    const headers = { 'User-Agent': 'NJT-Departure-Predictor-Sync' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(rawUrl, { headers });
      if (!res.ok) {
        return { pulled: false, reason: `HTTP ${res.status}` };
      }

      const remoteData = await res.json();
      let mergedData = remoteData;

      // Smart merge if local file already exists
      if (fs.existsSync(localPath)) {
        try {
          const localData = JSON.parse(fs.readFileSync(localPath, 'utf8'));

          if (filename === 'history.json') {
            // Deep merge history records per train and date
            mergedData = { ...remoteData };
            for (const [trainNum, dates] of Object.entries(localData)) {
              if (!mergedData[trainNum]) {
                mergedData[trainNum] = {};
              }
              for (const [date, entry] of Object.entries(dates)) {
                if (!mergedData[trainNum][date] || (entry.track && !mergedData[trainNum][date].track)) {
                  mergedData[trainNum][date] = entry;
                }
              }
            }
          } else if (filename === 'track_registry.json') {
            // Union of tracks
            const tracksSet = new Set([
              ...(remoteData.tracks || []),
              ...(localData.tracks || [])
            ]);
            mergedData = {
              tracks: Array.from(tracksSet).sort((a, b) => {
                const numA = parseInt(a, 10);
                const numB = parseInt(b, 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return a.localeCompare(b);
              }),
              lastUpdated: new Date().toISOString()
            };
          } else if (filename === 'cancellations.json') {
            mergedData = { ...remoteData };
            for (const [trainNum, records] of Object.entries(localData)) {
              if (!mergedData[trainNum]) {
                mergedData[trainNum] = records;
              } else {
                const datesSet = new Set(mergedData[trainNum].map(r => r.date));
                for (const r of records) {
                  if (!datesSet.has(r.date)) {
                    mergedData[trainNum].push(r);
                  }
                }
              }
            }
          }
        } catch (e) {
          // If local JSON parse fails, remoteData is used as base
        }
      }

      // Write merged data locally atomically
      const tmpPath = path.join(localDir, `${filename}.pull.${Date.now()}.tmp`);
      fs.writeFileSync(tmpPath, JSON.stringify(mergedData, null, 2), 'utf8');
      fs.renameSync(tmpPath, localPath);

      console.log(`[GitHubSync] Pulled & merged data/${filename} from GitHub`);
      return { pulled: true, filename };
    } catch (error) {
      console.warn(`[GitHubSync] Could not pull data/${filename}:`, error.message);
      return { pulled: false, error: error.message };
    }
  }

  /**
   * Pull all historical data on server boot.
   */
  async pullAll() {
    console.log(`[GitHubSync] Initializing historical dataset from GitHub repository (${this.repo})...`);
    const files = ['history.json', 'track_registry.json', 'cancellations.json'];
    const results = [];
    for (const f of files) {
      const res = await this.pullFile(f);
      results.push(res);
    }
    this.lastPull = new Date().toISOString();
    return results;
  }

  /**
   * Sync a single file in data/ directory to GitHub repository via REST API.
   */
  async syncFile(filename) {
    if (!this.isConfigured()) {
      return { skipped: true, reason: 'GITHUB_TOKEN not set' };
    }

    const localPath = path.join(__dirname, '..', 'data', filename);
    if (!fs.existsSync(localPath)) {
      return { skipped: true, reason: `File not found: ${filename}` };
    }

    const fileContent = fs.readFileSync(localPath, 'utf8');
    const base64Content = Buffer.from(fileContent).toString('base64');
    const apiUrl = `https://api.github.com/repos/${this.repo}/contents/data/${filename}`;

    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'NJT-Departure-Predictor-Sync',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    try {
      // 1. Check existing file on GitHub to get its SHA
      let currentSha = null;
      let remoteContent = null;
      const getRes = await fetch(`${apiUrl}?ref=${this.branch}`, { headers });

      if (getRes.ok) {
        const getJson = await getRes.json();
        currentSha = getJson.sha;
        remoteContent = (getJson.content || '').replace(/\n/g, '');
      }

      // If content has not changed, skip commit
      if (remoteContent && remoteContent === base64Content) {
        return { updated: false, unchanged: true, filename };
      }

      // 2. Put updated file to GitHub
      const putBody = {
        message: `Sync ${filename} history from live Render server [skip ci]`,
        content: base64Content,
        branch: this.branch
      };
      if (currentSha) {
        putBody.sha = currentSha;
      }

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(putBody)
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        throw new Error(`GitHub API error ${putRes.status}: ${errText}`);
      }

      console.log(`[GitHubSync] Successfully pushed data/${filename} to GitHub repository`);
      return { updated: true, filename };
    } catch (error) {
      console.error(`[GitHubSync] Failed to push data/${filename}:`, error.message);
      return { error: error.message, filename };
    }
  }

  /**
   * Sync all historical tracking and data files to GitHub.
   */
  async syncAll() {
    if (!this.isConfigured()) {
      return { skipped: true, reason: 'GITHUB_TOKEN environment variable is not configured' };
    }

    if (this.isSyncing) {
      console.log('[GitHubSync] Push sync already in progress, skipping...');
      return { skipped: true, reason: 'Sync in progress' };
    }

    this.isSyncing = true;
    console.log(`[GitHubSync] Pushing live dataset from Render to GitHub (${this.repo})...`);

    try {
      const files = ['history.json', 'track_registry.json', 'cancellations.json', 'api_data.json'];
      const results = [];

      for (const file of files) {
        const res = await this.syncFile(file);
        results.push(res);
      }

      this.lastSync = new Date().toISOString();
      console.log('[GitHubSync] Push sync complete.');
      return { success: true, timestamp: this.lastSync, results };
    } finally {
      this.isSyncing = false;
    }
  }
}

module.exports = GitHubSync;
