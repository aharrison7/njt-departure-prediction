/**
 * Recently Departed Train Tracker
 * 
 * Maintains a rolling 10-minute buffer of trains that have been removed from
 * the departure board. When a train disappears from the live board, it's added
 * here with its last known track so commuters can still catch late trains.
 */

class DepartedTracker {
  constructor() {
    // Map of trainNumber -> { ...departureData, removedAt: Date }
    this.recentlyDeparted = new Map();
    // Previous board state for diff detection
    this.previousBoard = new Map();
    // Retention period: 10 minutes
    this.RETENTION_MS = 10 * 60 * 1000;
  }

  /**
   * Update the tracker with a new board snapshot.
   * Detects trains that were on the previous board but are now gone.
   * 
   * @param {Array} currentDepartures - Current departure board entries
   * @param {string} station - Station identifier
   * @returns {Array} List of recently departed trains (still within 10-min window)
   */
  update(currentDepartures, station) {
    const now = new Date();
    const currentTrainKeys = new Set();

    // Build set of currently-visible trains
    for (const dep of currentDepartures) {
      const key = `${station}:${dep.trainNumber}`;
      currentTrainKeys.add(key);
    }

    // Find trains that were on previous board but are now gone
    for (const [key, prevDep] of this.previousBoard.entries()) {
      if (!key.startsWith(`${station}:`)) continue; // Only compare same station
      
      if (!currentTrainKeys.has(key)) {
        // This train has left the board — it departed!
        // Only add if it had a track assignment (otherwise it was probably cancelled)
        const status = (prevDep.status || '').toLowerCase();
        const isCancelled = status.includes('cancel');
        
        this.recentlyDeparted.set(key, {
          ...prevDep,
          removedAt: now.toISOString(),
          departedStatus: isCancelled ? 'Cancelled' : 'Departed',
          lastTrack: prevDep.track || '—'
        });
      }
    }

    // Update previous board state for this station
    // Remove old entries for this station first
    for (const key of this.previousBoard.keys()) {
      if (key.startsWith(`${station}:`)) {
        this.previousBoard.delete(key);
      }
    }
    // Add current entries
    for (const dep of currentDepartures) {
      const key = `${station}:${dep.trainNumber}`;
      this.previousBoard.set(key, { ...dep });
    }

    // Prune entries older than 10 minutes
    this._prune(now);

    // Return recently departed for this station
    return this.getRecentlyDeparted(station);
  }

  /**
   * Get recently departed trains for a specific station.
   * 
   * @param {string} station - Station identifier (optional, returns all if omitted)
   * @returns {Array} Trains that left the board within the last 10 minutes
   */
  getRecentlyDeparted(station) {
    this._prune(new Date());
    
    const results = [];
    for (const [key, dep] of this.recentlyDeparted.entries()) {
      if (!station || key.startsWith(`${station}:`)) {
        results.push(dep);
      }
    }
    
    // Sort by removal time, most recent first
    results.sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt));
    return results;
  }

  /**
   * Remove entries older than the retention period.
   */
  _prune(now) {
    for (const [key, dep] of this.recentlyDeparted.entries()) {
      const removedAt = new Date(dep.removedAt);
      if (now - removedAt > this.RETENTION_MS) {
        this.recentlyDeparted.delete(key);
      }
    }
  }

  /**
   * Clear all state (useful when switching between morning/afternoon windows).
   */
  clear() {
    this.recentlyDeparted.clear();
    this.previousBoard.clear();
  }

  /**
   * Serialize the current state for inclusion in api_data.json.
   */
  toJSON() {
    return this.getRecentlyDeparted();
  }
}

module.exports = DepartedTracker;
