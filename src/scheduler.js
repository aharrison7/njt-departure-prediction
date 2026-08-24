/**
 * Cron Scheduler
 * 
 * Manages the scraping schedule:
 * - Morning: 6:00 AM – 10:00 AM ET, weekdays, every 5 minutes (Jersey Ave)
 * - Afternoon: 2:50 PM – 6:00 PM ET, weekdays, every 5 minutes (Penn + Edison)
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

    // Morning: every 5 min, 6:00-9:55 AM, Mon-Fri
    // Cron: minute(0,5,10,...,55) hour(6-9) * * weekday(1-5)
    const morningJob = cron.schedule('*/5 6-9 * * 1-5', async () => {
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

    // Afternoon Part 1: 2:50 PM, 2:55 PM — Mon-Fri
    // Cron: minute(50,55) hour(14) * * weekday(1-5)
    const afternoonEarlyJob = cron.schedule('50,55 14 * * 1-5', async () => {
      console.log(`[Scheduler] Afternoon scrape triggered (early)`);
      try {
        await this.onAfternoonScrape();
      } catch (error) {
        console.error('[Scheduler] Afternoon scrape error:', error.message);
      }
    }, {
      timezone: 'America/New_York'
    });
    this.jobs.push(afternoonEarlyJob);

    // Afternoon Part 2: every 5 min, 3:00-5:55 PM — Mon-Fri
    // Cron: minute(0,5,10,...,55) hour(15-17) * * weekday(1-5)
    const afternoonMainJob = cron.schedule('*/5 15-17 * * 1-5', async () => {
      console.log(`[Scheduler] Afternoon scrape triggered`);
      try {
        await this.onAfternoonScrape();
      } catch (error) {
        console.error('[Scheduler] Afternoon scrape error:', error.message);
      }
    }, {
      timezone: 'America/New_York'
    });
    this.jobs.push(afternoonMainJob);

    this.isRunning = true;
    console.log('[Scheduler] Started with schedule:');
    console.log('  Morning:   Every 5 min, 6:00-9:55 AM ET, Mon-Fri (Jersey Ave)');
    console.log('  Afternoon: Every 5 min, 2:50-5:55 PM ET, Mon-Fri (Penn + Edison)');
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
    const minute = et.getMinutes();
    const day = et.getDay(); // 0=Sun, 6=Sat

    // Weekdays only
    if (day === 0 || day === 6) return 'off-hours';

    // Morning: 6:00 AM - 10:00 AM
    if (hour >= 6 && hour < 10) return 'morning';

    // Afternoon: 2:50 PM - 6:00 PM
    if ((hour === 14 && minute >= 50) || (hour >= 15 && hour < 18)) return 'afternoon';

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
      timezone: 'America/New_York'
    };
  }
}

module.exports = Scheduler;
