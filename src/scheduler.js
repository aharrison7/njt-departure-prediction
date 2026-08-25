/**
 * Cron Scheduler
 * 
 * Manages the scraping schedule:
 * - Active Window: 5:00 AM ET – 2:00 AM ET (next day), 7 days a week, every 1 minute
 *   - Penn Station New York and Jersey Avenue Station ONLY
 * - Off-hours: 2:00 AM – 5:00 AM ET
 */

const cron = require('node-cron');

class Scheduler {
  constructor(onScrape, onSync, onBackfill) {
    this.onScrape = typeof onScrape === 'function' ? onScrape : null;
    this.onSync = typeof onSync === 'function' ? onSync : null;
    this.onBackfill = typeof onBackfill === 'function' ? onBackfill : null;
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Start all cron jobs.
   */
  start() {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    // Every 1 minute, 5:00 AM - 1:59 AM ET (hours 0,1, 5-23), 7 days a week
    const scrapeJob = cron.schedule('* 0,1,5-23 * * *', async () => {
      console.log(`[Scheduler] 1-minute live scrape triggered`);
      try {
        if (typeof this.onScrape === 'function') {
          await this.onScrape();
        }
      } catch (error) {
        console.error('[Scheduler] Scrape error:', error.message);
      }
    }, {
      timezone: 'America/New_York'
    });
    this.jobs.push(scrapeJob);

    // Periodically sync historical track data to GitHub (every 10 minutes)
    if (typeof this.onSync === 'function') {
      const syncJob = cron.schedule('*/10 * * * *', async () => {
        try {
          console.log('[Scheduler] Periodic GitHub sync triggered');
          await this.onSync();
        } catch (error) {
          console.error('[Scheduler] Periodic GitHub sync error:', error.message);
        }
      });
      this.jobs.push(syncJob);
    }

    // 24-hour ChooChooTracker backfill importer (runs every 5 minutes while active)
    if (typeof this.onBackfill === 'function') {
      const backfillJob = cron.schedule('*/5 * * * *', async () => {
        try {
          await this.onBackfill();
        } catch (error) {
          console.error('[Scheduler] Backfill cron error:', error.message);
        }
      });
      this.jobs.push(backfillJob);
    }

    this.isRunning = true;
    console.log('[Scheduler] Started with 1-minute live scrape, periodic GitHub sync, and 24-hr ChooChooTracker backfill');
  }

  /**
   * Stop all cron jobs.
   */
  stop() {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
    this.isRunning = false;
    console.log('[Scheduler] Stopped');
  }

  /**
   * Get the current time window.
   * @returns {'live' | 'off-hours'}
   */
  static getCurrentWindow() {
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = et.getHours();

    if (hour >= 5 || hour < 2) return 'live';
    return 'off-hours';
  }

  /**
   * Get status information.
   */
  getStatus() {
    const window = Scheduler.getCurrentWindow();
    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.length,
      currentWindow: window,
      operatingHours: '5:00 AM - 2:00 AM ET (Every 1 Minute, 7 days/week)',
      timezone: 'America/New_York'
    };
  }
}

module.exports = Scheduler;
