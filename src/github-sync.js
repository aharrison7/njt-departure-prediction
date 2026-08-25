/**
 * GitHub Data Sync
 * 
 * Writes historical data (history.json, track_registry.json, cancellations.json, api_data.json)
 * directly back to the GitHub repository from the running Render server using the GitHub REST API.
 */

const fs = require('fs');
const path = require('path');

class GitHubSync {
  constructor(options = {}) {
    this.token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
    this.repo = options.repo || process.env.GITHUB_REPO || 'aharrison7/njt-departure-prediction';
    this.branch = options.branch || process.env.GITHUB_BRANCH || 'main';
    this.lastSync = null;
    this.isSyncing = false;
  }

  /**
   * Check if GitHub Sync is configured.
   */
  isConfigured() {
    return Boolean(this.token && this.repo);
  }

  /**
   * Sync a single file in data/ directory to GitHub repository.
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
        message: `Sync ${filename} history from live server [skip ci]`,
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

      console.log(`[GitHubSync] Successfully synced data/${filename} to ${this.repo} (${this.branch})`);
      return { updated: true, filename };
    } catch (error) {
      console.error(`[GitHubSync] Failed to sync data/${filename}:`, error.message);
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
      console.log('[GitHubSync] Sync already in progress, skipping...');
      return { skipped: true, reason: 'Sync in progress' };
    }

    this.isSyncing = true;
    console.log(`[GitHubSync] Starting repository sync to ${this.repo}...`);

    try {
      const files = ['history.json', 'track_registry.json', 'cancellations.json', 'api_data.json'];
      const results = [];

      for (const file of files) {
        const res = await this.syncFile(file);
        results.push(res);
      }

      this.lastSync = new Date().toISOString();
      console.log('[GitHubSync] Repository sync complete.');
      return { success: true, timestamp: this.lastSync, results };
    } finally {
      this.isSyncing = false;
    }
  }
}

module.exports = GitHubSync;
