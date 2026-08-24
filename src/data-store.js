/**
 * Google Drive Data Store
 * 
 * Manages reading/writing JSON data files to Google Drive.
 * Handles 90-day retention, public sharing for the dashboard, and file creation.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

class DataStore {
  constructor(credentialsPath, folderId) {
    this.folderId = folderId;
    this.credentialsPath = credentialsPath;
    this.drive = null;
    this.fileCache = {}; // Cache of filename -> fileId
    this.RETENTION_DAYS = 90;
  }

  /**
   * Initialize Google Drive API client.
   */
  async init() {
    try {
      const credentials = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
      
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });

      this.drive = google.drive({ version: 'v3', auth });
      console.log('[DataStore] Google Drive client initialized');

      // Ensure our data folder exists and cache file IDs
      await this._cacheFileIds();
    } catch (error) {
      console.error('[DataStore] Failed to initialize:', error.message);
      console.log('[DataStore] Running in local-only mode (data will be saved to ./data/)');
      this.drive = null;
    }
  }

  /**
   * Cache file IDs for known data files.
   */
  async _cacheFileIds() {
    if (!this.drive) return;

    try {
      const response = await this.drive.files.list({
        q: `'${this.folderId}' in parents and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 100
      });

      for (const file of response.data.files || []) {
        this.fileCache[file.name] = file.id;
      }
      console.log(`[DataStore] Cached ${Object.keys(this.fileCache).length} file IDs`);
    } catch (error) {
      console.error('[DataStore] Error caching file IDs:', error.message);
    }
  }

  /**
   * Read a JSON file from Drive (or local fallback).
   */
  async readJSON(filename) {
    // Try Google Drive first
    if (this.drive && this.fileCache[filename]) {
      try {
        const response = await this.drive.files.get({
          fileId: this.fileCache[filename],
          alt: 'media'
        });
        return response.data;
      } catch (error) {
        console.error(`[DataStore] Error reading ${filename} from Drive:`, error.message);
      }
    }

    // Fallback to local file
    const localPath = path.join(__dirname, '..', 'data', filename);
    try {
      if (fs.existsSync(localPath)) {
        return JSON.parse(fs.readFileSync(localPath, 'utf8'));
      }
    } catch (error) {
      console.error(`[DataStore] Error reading local ${filename}:`, error.message);
    }

    return null;
  }

  /**
   * Write a JSON file to Drive (and local fallback).
   */
  async writeJSON(filename, data, makePublic = false) {
    const jsonStr = JSON.stringify(data, null, 2);

    // Always write locally as backup
    const localDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.writeFileSync(path.join(localDir, filename), jsonStr, 'utf8');

    // Write to Google Drive
    if (this.drive) {
      try {
        const media = {
          mimeType: 'application/json',
          body: jsonStr
        };

        if (this.fileCache[filename]) {
          // Update existing file
          await this.drive.files.update({
            fileId: this.fileCache[filename],
            media
          });
        } else {
          // Create new file
          const response = await this.drive.files.create({
            requestBody: {
              name: filename,
              parents: [this.folderId],
              mimeType: 'application/json'
            },
            media,
            fields: 'id'
          });
          this.fileCache[filename] = response.data.id;

          // Make public if requested (for api_data.json)
          if (makePublic) {
            await this.drive.permissions.create({
              fileId: response.data.id,
              requestBody: {
                role: 'reader',
                type: 'anyone'
              }
            });
            console.log(`[DataStore] Made ${filename} publicly readable`);
            console.log(`[DataStore] Public URL: https://drive.google.com/uc?id=${response.data.id}&export=download`);
          }
        }
      } catch (error) {
        console.error(`[DataStore] Error writing ${filename} to Drive:`, error.message);
      }
    }
  }

  /**
   * Get the public download URL for a file.
   */
  getPublicUrl(filename) {
    const fileId = this.fileCache[filename];
    if (fileId) {
      return `https://drive.google.com/uc?id=${fileId}&export=download`;
    }
    return null;
  }

  // ─── Domain-Specific Methods ───────────────────────────────────────

  /**
   * Load the 90-day track history.
   * Structure: { [trainNumber]: { [date]: { track, status, station } } }
   */
  async loadHistory() {
    const data = await this.readJSON('history.json');
    return data || {};
  }

  /**
   * Save track history (with 90-day pruning).
   */
  async saveHistory(history) {
    // Prune entries older than 90 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.RETENTION_DAYS);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    for (const trainNum of Object.keys(history)) {
      const dates = history[trainNum];
      for (const date of Object.keys(dates)) {
        if (date < cutoffStr) {
          delete dates[date];
        }
      }
      // Remove train entry if no dates left
      if (Object.keys(dates).length === 0) {
        delete history[trainNum];
      }
    }

    await this.writeJSON('history.json', history);
  }

  /**
   * Update history with new departure data.
   */
  async updateHistory(departures) {
    const history = await this.loadHistory();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD

    for (const dep of departures) {
      if (!dep.trainNumber) continue;

      if (!history[dep.trainNumber]) {
        history[dep.trainNumber] = {};
      }

      // Only update if we have a track assignment (don't overwrite with empty)
      const existing = history[dep.trainNumber][today];
      if (dep.track || !existing) {
        history[dep.trainNumber][today] = {
          track: dep.track || (existing && existing.track) || '',
          status: dep.status || '',
          station: dep.station || '',
          scheduledTime: dep.scheduledTime || '',
          destination: dep.destination || ''
        };
      }
    }

    await this.saveHistory(history);
    return history;
  }

  /**
   * Load cancellation records.
   * Structure: { [trainNumber]: [{ date, station, status }] }
   */
  async loadCancellations() {
    const data = await this.readJSON('cancellations.json');
    return data || {};
  }

  /**
   * Record cancellations from current departures.
   */
  async recordCancellations(departures) {
    const cancellations = await this.loadCancellations();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.RETENTION_DAYS);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    for (const dep of departures) {
      if (!dep.trainNumber) continue;
      
      const status = (dep.status || '').toLowerCase();
      if (status.includes('cancel')) {
        if (!cancellations[dep.trainNumber]) {
          cancellations[dep.trainNumber] = [];
        }

        // Avoid duplicate entries for same date
        const alreadyRecorded = cancellations[dep.trainNumber].some(c => c.date === today);
        if (!alreadyRecorded) {
          cancellations[dep.trainNumber].push({
            date: today,
            station: dep.station || '',
            status: dep.status || 'Cancelled'
          });
        }
      }
    }

    // Prune old cancellation entries
    for (const trainNum of Object.keys(cancellations)) {
      cancellations[trainNum] = cancellations[trainNum].filter(c => c.date >= cutoffStr);
      if (cancellations[trainNum].length === 0) {
        delete cancellations[trainNum];
      }
    }

    await this.writeJSON('cancellations.json', cancellations);
    return cancellations;
  }

  /**
   * Load the track registry (tracks that have ever been used).
   */
  async loadTrackRegistry() {
    const data = await this.readJSON('track_registry.json');
    return data || { tracks: [], lastUpdated: null };
  }

  /**
   * Update the track registry with new track observations.
   */
  async updateTrackRegistry(departures) {
    const registry = await this.loadTrackRegistry();
    const trackSet = new Set(registry.tracks || []);

    for (const dep of departures) {
      if (dep.track && dep.track.trim()) {
        trackSet.add(dep.track.trim());
      }
    }

    registry.tracks = Array.from(trackSet).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
    registry.lastUpdated = new Date().toISOString();

    await this.writeJSON('track_registry.json', registry);
    return registry;
  }

  /**
   * Write the public API data file for the dashboard.
   */
  async writeApiData(data) {
    await this.writeJSON('api_data.json', data, true);
  }
}

module.exports = DataStore;
