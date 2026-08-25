/**
 * Cron Scheduler
 * 
 * Manages the scraping schedule:
 * - Active Window: 5:00 AM ET – 2:00 AM ET (next day), 7 days a week, every 5 minutes
 *   - Morning (5:00 AM - 11:59 AM ET): Jersey Ave Station
 *   - Main / Afternoon / Evening / Night (12:00 PM - 2:00 AM ET): Penn Station + Edison Station
 * - Off-hours: 2:00 AM – 5:00 AM ET
 */

const cron = require('node-cron');

class Scheduler {
  constructor(onMorningScrape, onAfternoonScrape) {
    this.onMorningScrape = onMorningScrape;
    this.onAfternoonScrape = onAfternoonScrape;
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

    // Morning Window: every 5 min, 5:00 AM - 11:55 AM ET, 7 days a week
    // Cron: minute(*/5) hour(5-11) * * *
    const morningJob = cron.schedule('*/5 5-11 * * *', async () => {
      console.log(`[Scheduler] Morning scrape triggered`);
      try {
        await this.onMorningScrape();
      } catch (error) {
        console.error('[Scheduler] Morning scrape error:', error.message);
      }
    }, {
      timezone: 'America/New_York'
    });
    this.jobs.push(morningJob);

    // Main / Afternoon / Evening / Night Window: every 5 min, 12:00 PM - 1:55 AM ET (hours 12-23, 0-1), 7 days a week
    // Cron: minute(*/5) hour(0,1,12-23) * * *
    const mainJob = cron.schedule('*/5 0,1,12-23 * * *', async () => {
      console.log(`[Scheduler] Main/Afternoon scrape triggered`);
      try {
        await this.onAfternoonScrape();
      } catch (error) {
        console.error('[Scheduler] Scrape error:', error.message);
      }
    }, {
      timezone: 'America/New_York'
    });
    this.jobs.push(mainJob);

    this.isRunning = true;
    console.log('[Scheduler] Started with 5:00 AM - 2:00 AM ET schedule:');
    console.log('  Morning (5:00 AM - 11:59 AM ET):   Every 5 min (Jersey Ave)');
    console.log('  Main    (12:00 PM - 2:00 AM ET):   Every 5 min (Penn + Edison)');
    console.log('  Off-Hours: 2:00 AM - 5:00 AM ET');
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
   * @returns {'morning' | 'afternoon' | 'off-hours'}
   */
  static getCurrentWindow() {
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = et.getHours();

    // Morning: 5:00 AM - 11:59 AM ET
    if (hour >= 5 && hour < 12) return 'morning';

    // Main / Afternoon / Night: 12:00 PM - 2:00 AM ET (hours 12..23, 0..1)
    if (hour >= 12 || hour < 2) return 'afternoon';

    // Off-hours: 2:00 AM - 5:00 AM ET
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
      operatingHours: '5:00 AM - 2:00 AM ET (7 days/week)',
      timezone: 'America/New_York'
    };
  }
}

module.exports = Scheduler;
