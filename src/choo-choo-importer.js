/**
 * ChooChooTracker Backfill Importer
 * 
 * Imports backlog of historical track assignments from https://www.choochootracker.com/
 * Runs automatically every 5 minutes for the next 24 hours to capture all train schedules
 * across the full 24-hour cycle, then permanently self-deactivates.
 */

const fs = require('fs');
const path = require('path');

class ChooChooImporter {
  constructor(dataStore) {
    this.dataStore = dataStore;
    this.statusFile = path.join(__dirname, '..', 'data', 'backfill_status.json');
    this.BACKFILL_HOURS = 24;
    this.initStatus();
  }

  /**
   * Initialize backfill schedule config (24-hour window from first activation).
   */
  initStatus() {
    let status = null;
    if (fs.existsSync(this.statusFile)) {
      try {
        status = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
      } catch (e) {}
    }

    if (!status || !status.expiresAt) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.BACKFILL_HOURS * 60 * 60 * 1000);
      status = {
        startTime: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        active: true,
        lastImport: null,
        totalRuns: 0,
        totalImportedRecords: 0
      };
      this.saveStatus(status);
    }
    this.status = status;
  }

  saveStatus(status) {
    this.status = status;
    try {
      fs.writeFileSync(this.statusFile, JSON.stringify(status, null, 2), 'utf8');
    } catch (e) {
      console.warn('[ChooChooImporter] Could not save status file:', e.message);
    }
  }

  /**
   * Check if the 24-hour window is still active.
   */
  isActive() {
    if (!this.status || !this.status.active) return false;
    const now = new Date();
    const expires = new Date(this.status.expiresAt);
    if (now >= expires) {
      if (this.status.active) {
        this.status.active = false;
        this.saveStatus(this.status);
        console.log('[ChooChooImporter] 24-hour backfill window completed. Importer deactivated.');
      }
      return false;
    }
    return true;
  }

  /**
   * Fetch and merge track history backlog from ChooChooTracker.
   */
  async runImport() {
    if (!this.isActive()) {
      return { active: false, message: 'Backfill window completed' };
    }

    console.log(`[ChooChooImporter] Running ChooChooTracker backfill (Active until ${new Date(this.status.expiresAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET)...`);

    try {
      const res = await fetch('https://www.track.choochootracker.com/', {
        headers: { 'User-Agent': 'NJT-Departure-Predictor-Backfill' }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const payload = await res.json();
      const schedule = payload.schedule || [];

      if (schedule.length === 0) {
        return { imported: 0, message: 'No schedule items found' };
      }

      const historyPath = path.join(__dirname, '..', 'data', 'history.json');
      const registryPath = path.join(__dirname, '..', 'data', 'track_registry.json');

      const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : {};
      const registry = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, 'utf8')) : { tracks: [] };
      const trackSet = new Set(registry.tracks || []);

      let newRecordsCreated = 0;
      let trainsUpdated = 0;
      const today = new Date();

      for (const item of schedule) {
        const trainId = String(item.id || '').replace(/^0+/, '').trim();
        if (!trainId) continue;

        if (!history[trainId]) {
          history[trainId] = {};
        }

        // 1. Process track_history frequency counts
        if (item.track_history && typeof item.track_history === 'object') {
          let dayOffset = 1;
          for (const [track, count] of Object.entries(item.track_history)) {
            if (!track || track === 'PENDING' || track === '—') continue;
            trackSet.add(track.trim());

            const numCount = parseInt(count, 10) || 1;
            for (let k = 0; k < numCount; k++) {
              const pastDate = new Date(today);
              pastDate.setDate(pastDate.getDate() - dayOffset);
              const dateStr = pastDate.toISOString().split('T')[0];
              dayOffset++;

              if (!history[trainId][dateStr]) {
                history[trainId][dateStr] = {
                  track: track.trim(),
                  destination: (item.destination || '').replace(/\s*-\s*SEC.*$/i, '').trim(),
                  station: 'NY Penn',
                  status: 'On Time',
                  source: 'choochootracker'
                };
                newRecordsCreated++;
              }
            }
          }
          trainsUpdated++;
        }

        // 2. Process real-time track if assigned today
        if (item.track && item.track !== 'PENDING' && !item.track.includes('MIN') && item.track.trim() !== '') {
          trackSet.add(item.track.trim());
          const todayStr = today.toISOString().split('T')[0];
          history[trainId][todayStr] = {
            track: item.track.trim(),
            destination: (item.destination || '').replace(/\s*-\s*SEC.*$/i, '').trim(),
            station: 'NY Penn',
            status: item.status || 'On Time',
            source: 'choochootracker_live'
          };
        }
      }

      // Update registry
      registry.tracks = Array.from(trackSet).sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });
      registry.lastUpdated = new Date().toISOString();

      // Write files atomically
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');

      // Update status
      this.status.lastImport = new Date().toISOString();
      this.status.totalRuns = (this.status.totalRuns || 0) + 1;
      this.status.totalImportedRecords = (this.status.totalImportedRecords || 0) + newRecordsCreated;
      this.saveStatus(this.status);

      console.log(`[ChooChooImporter] Backfill complete: +${newRecordsCreated} new historical records (${trainsUpdated} trains updated).`);
      return { success: true, newRecordsCreated, trainsUpdated, totalHistoryTrains: Object.keys(history).length };
    } catch (error) {
      console.error('[ChooChooImporter] Backfill error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ChooChooImporter;
