const { getTrainStops } = require('./route-stops');

/**
 * Generate track predictions for all trains on the current board.
 * 
 * Analyzes 90-day historical track assignment data to predict which track
 * a train is most likely to depart from. Automatically excludes tracks
 * that are currently occupied or have never been used.
 */

/**
 * Generate track predictions for all trains on the current board.
 * 
 * @param {Array} currentBoard - Current departure board entries
 * @param {Object} history - 90-day history: { [trainNumber]: { [date]: { track, ... } } }
 * @param {Object} trackRegistry - { tracks: [...] } of tracks ever used
 * @returns {Array} Predictions for each train
 */
function generatePredictions(currentBoard, history, trackRegistry) {
  // Build set of currently occupied tracks
  const occupiedTracks = new Set();
  for (const dep of currentBoard) {
    if (dep.track && dep.track.trim()) {
      occupiedTracks.add(dep.track.trim());
    }
  }

  // Known tracks (tracks that have ever been used by NJT)
  const knownTracks = new Set((trackRegistry && trackRegistry.tracks) || []);

  const predictions = [];

  for (const dep of currentBoard) {
    if (!dep.trainNumber) continue;

    const trainHistory = history[dep.trainNumber];
    if (!trainHistory || Object.keys(trainHistory).length === 0) {
      // No history for this train
      predictions.push({
        trainNumber: dep.trainNumber,
        destination: dep.destination || '',
        line: dep.line || '',
        scheduledTime: dep.scheduledTime || '',
        currentTrack: dep.track || '',
        predictedTrack: null,
        confidence: 0,
        trackDistribution: {},
        daysOfData: 0,
        excludedTracks: [],
        excludeReasons: {},
        note: 'No historical data available',
        stops: dep.stops || getTrainStops(dep.line, dep.destination)
      });
      continue;
    }

    // Count track frequencies from history
    const trackCounts = {};
    let totalDays = 0;

    for (const [date, entry] of Object.entries(trainHistory)) {
      if (entry.track && entry.track.trim()) {
        const track = entry.track.trim();
        trackCounts[track] = (trackCounts[track] || 0) + 1;
        totalDays++;
      }
    }

    if (totalDays === 0) {
      predictions.push({
        trainNumber: dep.trainNumber,
        destination: dep.destination || '',
        line: dep.line || '',
        scheduledTime: dep.scheduledTime || '',
        currentTrack: dep.track || '',
        predictedTrack: null,
        confidence: 0,
        trackDistribution: {},
        daysOfData: Object.keys(trainHistory).length,
        excludedTracks: [],
        excludeReasons: {},
        note: 'No track assignments in history',
        stops: dep.stops || getTrainStops(dep.line, dep.destination)
      });
      continue;
    }

    // Build exclusion set
    const excludedTracks = {};

    // Exclude currently occupied tracks (but not this train's own track)
    for (const track of occupiedTracks) {
      // Don't exclude if this train already has this track assigned
      if (dep.track && dep.track.trim() === track) continue;
      excludedTracks[track] = 'currently occupied by another train';
    }

    // Exclude tracks never used by NJT (if registry exists)
    if (knownTracks.size > 0) {
      for (const track of Object.keys(trackCounts)) {
        if (!knownTracks.has(track)) {
          excludedTracks[track] = 'track has never been used by NJ Transit';
        }
      }
    }

    // Filter track counts to remove excluded tracks
    const filteredCounts = {};
    let filteredTotal = 0;

    for (const [track, count] of Object.entries(trackCounts)) {
      if (!excludedTracks[track]) {
        filteredCounts[track] = count;
        filteredTotal += count;
      }
    }

    // Sort tracks by frequency (descending)
    const sortedTracks = Object.entries(filteredCounts)
      .sort((a, b) => b[1] - a[1]);

    // Single most likely track prediction (must be a clear winner with no ties)
    let predictedTrack = null;
    if (sortedTracks.length === 1) {
      predictedTrack = sortedTracks[0][0];
    } else if (sortedTracks.length > 1) {
      // Must have strictly higher count than 2nd place
      if (sortedTracks[0][1] > sortedTracks[1][1]) {
        predictedTrack = sortedTracks[0][0];
      }
    }

    const confidence = predictedTrack && filteredTotal > 0
      ? Math.round((filteredCounts[predictedTrack] / filteredTotal) * 100) / 100
      : 0;

    // Build distribution percentages
    const distribution = {};
    for (const [track, count] of sortedTracks) {
      distribution[track] = count;
    }

    predictions.push({
      trainNumber: dep.trainNumber,
      destination: dep.destination || '',
      line: dep.line || '',
      scheduledTime: dep.scheduledTime || '',
      currentTrack: dep.track || '',
      predictedTrack,
      confidence,
      trackDistribution: distribution,
      daysOfData: totalDays,
      totalHistoryDays: Object.keys(trainHistory).length,
      excludedTracks: Object.keys(excludedTracks),
      excludeReasons: excludedTracks,
      stops: dep.stops || getTrainStops(dep.line, dep.destination)
    });
  }

  // Sort predictions: trains with track assignments first, then by scheduled time
  predictions.sort((a, b) => {
    if (a.currentTrack && !b.currentTrack) return -1;
    if (!a.currentTrack && b.currentTrack) return 1;
    return 0;
  });

  return predictions;
}

/**
 * Detect trains that departed Penn Station but were cancelled before Edison.
 * 
 * @param {Array} pennDepartures - Departures from NY Penn
 * @param {Array} edisonDepartures - Departures from Edison
 * @returns {Array} En-route cancellations
 */
function detectEnRouteCancellations(pennDepartures, edisonDepartures) {
  const enRouteCancellations = [];

  // Build set of train numbers that departed Penn (or are on their way)
  const pennTrains = new Map();
  for (const dep of pennDepartures) {
    if (!dep.trainNumber) continue;
    const status = (dep.status || '').toLowerCase();
    // Include trains that have departed or are boarding
    if (status.includes('departed') || status.includes('board') || status.includes('on time') || status.includes('delay')) {
      pennTrains.set(dep.trainNumber, dep);
    }
  }

  // Check Edison for cancellations of trains that were at Penn
  for (const dep of edisonDepartures) {
    if (!dep.trainNumber) continue;
    const status = (dep.status || '').toLowerCase();
    
    if (status.includes('cancel') && pennTrains.has(dep.trainNumber)) {
      const pennDep = pennTrains.get(dep.trainNumber);
      enRouteCancellations.push({
        trainNumber: dep.trainNumber,
        line: pennDep.line || dep.line || '',
        destination: pennDep.destination || dep.destination || '',
        departedPenn: pennDep.scheduledTime || '',
        pennStatus: pennDep.status || '',
        edisonStatus: dep.status || 'Cancelled',
        cancelledAtEdison: true,
        date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      });
    }
  }

  return enRouteCancellations;
}

/**
 * Get cancellations from the last 7 days for display.
 * 
 * @param {Object} cancellations - Full cancellation records
 * @returns {Object} Last 7 days of cancellations by train number
 */
function getRecentCancellations(cancellations) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const recent = {};
  for (const [trainNum, entries] of Object.entries(cancellations)) {
    const recentEntries = entries.filter(e => e.date >= cutoffStr);
    if (recentEntries.length > 0) {
      recent[trainNum] = recentEntries.map(e => e.date);
    }
  }
  return recent;
}

module.exports = {
  generatePredictions,
  detectEnRouteCancellations,
  getRecentCancellations
};
