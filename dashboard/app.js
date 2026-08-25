/**
 * NJT Track Predictor — Dashboard Application
 * 
 * Fetches data from the local server API and renders the departure board,
 * predictions, and cancellation views. Auto-refreshes every 60 seconds.
 * Supports station stop filtering (default: Jersey Avenue), arrival time calculation,
 * and train stop modal dialogs.
 */

(function () {
  'use strict';

  // ─── Configuration ─────────────────────────────────────────
  const API_URL = '/api/data';
  const REFRESH_INTERVAL = 60 * 1000; // 60 seconds

  let currentTab = 'board';
  let refreshTimer = null;
  let rawData = null;
  let selectedStop = 'Jersey Avenue'; // Default filter: Jersey Avenue
  let focusedOptionIndex = -1;

  // Complete NJ Transit line stops
  const LINE_STOPS = {
    NEC: ["New York Penn Station", "Secaucus Junction", "Newark Penn Station", "Newark Airport", "North Elizabeth", "Elizabeth", "Rahway", "Metropark", "Metuchen", "Edison", "New Brunswick", "Jersey Avenue", "Princeton Junction", "Hamilton", "Trenton"],
    NJCL: ["New York Penn Station", "Secaucus Junction", "Newark Penn Station", "Elizabeth", "Rahway", "Avenel", "Woodbridge", "Perth Amboy", "South Amboy", "Matawan", "Hazlet", "Middletown", "Red Bank", "Little Silver", "Long Branch", "Elberon", "Allenhurst", "Asbury Park", "Bradley Beach", "Belmar", "Spring Lake", "Manasquan", "Point Pleasant Beach", "Bay Head"],
    "M&E": ["New York Penn Station", "Secaucus Junction", "Newark Broad St", "East Orange", "Brick Church", "Orange", "Highland Ave", "Mountain Station", "South Orange", "Maplewood", "Millburn", "Short Hills", "Summit", "Chatham", "Madison", "Convent Station", "Morristown", "Morris Plains", "Mount Tabor", "Denville", "Dover"],
    MOBO: ["New York Penn Station", "Secaucus Junction", "Newark Broad St", "Broad Street Bloomfield", "Glen Ridge", "Bay Street Montclair", "Walnut Street", "Watchung Avenue", "Upper Montclair", "Mountain Avenue", "Montclair Heights", "Montclair State University (MSU)", "Little Falls", "Mountain View", "Wayne Route 23", "Towaco", "Lincoln Park", "Boonton", "Denville", "Lake Hopatcong", "Netcong", "Mount Arlington", "Mount Olive", "Hackettstown"],
    RVL: ["Newark Penn Station", "Union", "Roselle Park", "Cranford", "Garwood", "Westfield", "Fanwood", "Netherwood", "Plainfield", "Dunellen", "Bound Brook", "Bridgewater", "Somerville", "Raritan", "Lebanon", "White House", "High Bridge"],
    MAIN: ["Hoboken", "Secaucus Junction", "Kingsland", "Lyndhurst", "Delawanna", "Passaic", "Clifton", "Paterson", "Fair Lawn (Broadway)", "Fair Lawn (Radburn)", "Glen Rock", "Ridgewood", "Ho-Ho-Kus", "Waldwick", "Allendale", "Ramsey", "Ramsey Route 17", "Mahwah", "Suffern"],
    BGN: ["Hoboken", "Secaucus Junction", "Rutherford", "Garfield", "Plauderville", "Fair Lawn (Broadway)", "Glen Rock", "Ridgewood", "Ho-Ho-Kus", "Waldwick", "Allendale", "Ramsey", "Ramsey Route 17", "Mahwah", "Suffern"],
    PVL: ["Hoboken", "Secaucus Junction", "Wood-Ridge", "Teterboro", "Essex Street", "Anderson Street", "New Bridge Landing", "River Edge", "Oradell", "Emerson", "Westwood", "Hillsdale", "Woodcliff Lake", "Park Ridge", "Montvale", "Pearl River", "Nanuet", "Spring Valley"],
    GLAD: ["New York Penn Station", "Secaucus Junction", "Newark Broad St", "East Orange", "Brick Church", "Orange", "Highland Ave", "Mountain Station", "South Orange", "Maplewood", "Millburn", "Short Hills", "Summit", "New Providence", "Murray Hill", "Berkeley Heights", "Gillette", "Stirling", "Millington", "Lyons", "Basking Ridge", "Bernardsville", "Far Hills", "Peapack", "Gladstone"],
    ACL: ["Philadelphia 30th St", "Pennsauken", "Cherry Hill", "Lindenwold", "Atco", "Hammonton", "Egg Harbor City", "Absecon", "Atlantic City"],
    PJL: ["Suffern", "Sloatsburg", "Tuxedo", "Harriman", "Salisbury Mills-Cornwall", "Campbell Hall", "Middletown NY", "Otisville", "Port Jervis"],
    AMTK: ["New York Penn Station", "Newark Penn Station", "Metropark", "Trenton", "Philadelphia 30th St", "Wilmington", "Baltimore", "Washington Union Station"]
  };

  const STATION_OFFSETS = {
    NEC: {
      "new york penn station": 0, "secaucus junction": 10, "newark penn station": 18,
      "newark airport": 22, "north elizabeth": 26, "elizabeth": 29, "rahway": 36,
      "metropark": 43, "metuchen": 49, "edison": 55, "new brunswick": 60,
      "jersey avenue": 65, "princeton junction": 76, "hamilton": 86, "trenton": 95
    },
    NJCL: {
      "new york penn station": 0, "secaucus junction": 10, "newark penn station": 18,
      "elizabeth": 29, "rahway": 36, "avenel": 40, "woodbridge": 44, "perth amboy": 50,
      "south amboy": 56, "matawan": 65, "hazlet": 73, "middletown": 80, "red bank": 87,
      "little silver": 92, "long branch": 102, "bay head": 135
    },
    "M&E": {
      "new york penn station": 0, "secaucus junction": 10, "newark broad st": 18,
      "east orange": 24, "brick church": 27, "orange": 30, "highland ave": 33,
      "mountain station": 36, "south orange": 40, "maplewood": 44, "millburn": 48,
      "short hills": 52, "summit": 58, "chatham": 64, "madison": 69, "convent station": 73,
      "morristown": 78, "dover": 95
    }
  };

  // ─── DOM References ────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── Initialization ────────────────────────────────────────
  function init() {
    setupTabs();
    setupFilterControls();
    setupModal();
    fetchData();
    refreshTimer = setInterval(fetchData, REFRESH_INTERVAL);
  }

  // ─── Tab Navigation ────────────────────────────────────────
  function setupTabs() {
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $$('.tab-panel').forEach(p => p.classList.remove('active'));
        $(`#panel-${tab}`).classList.add('active');
        currentTab = tab;
      });
    });
  }

  // ─── All Station List (Sorted Alphabetically) ──────────────
  function getAllStationsList() {
    const stationSet = new Set();

    // 1. Add from LINE_STOPS
    Object.values(LINE_STOPS).forEach(stops => {
      stops.forEach(st => stationSet.add(st));
    });

    // 2. Add from server data if available
    if (rawData && rawData.allStops && Array.isArray(rawData.allStops)) {
      rawData.allStops.forEach(st => stationSet.add(st));
    }

    // 3. Add active destinations / stops from current board
    if (rawData && rawData.currentBoard && Array.isArray(rawData.currentBoard)) {
      rawData.currentBoard.forEach(dep => {
        if (dep.destination) stationSet.add(dep.destination);
        if (dep.stops && Array.isArray(dep.stops)) {
          dep.stops.forEach(st => stationSet.add(st));
        }
      });
    }

    return Array.from(stationSet).sort((a, b) => a.localeCompare(b));
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    return `${before}<span class="match-hl">${match}</span>${after}`;
  }

  // ─── Searchable Station Filter Controls ────────────────────
  function setupFilterControls() {
    const combobox = $('#station-combobox');
    const searchInput = $('#station-search-input');
    const dropdownMenu = $('#station-dropdown-menu');
    const optionsList = $('#station-options-list');
    const countHeader = $('#dropdown-count-header');
    const clearInputBtn = $('#station-clear-btn');

    const pillJersey = $('#pill-jersey-ave');
    const pillNYPenn = $('#pill-ny-penn');
    const pillAll = $('#pill-all');
    const clearBannerBtn = $('#clear-filter-btn');

    function openDropdown() {
      if (!combobox) return;
      combobox.classList.add('open');
      dropdownMenu.removeAttribute('hidden');
      renderOptions(searchInput.value.trim());
    }

    function closeDropdown() {
      if (!combobox) return;
      combobox.classList.remove('open');
      dropdownMenu.setAttribute('hidden', '');
      focusedOptionIndex = -1;
    }

    function renderOptions(query = '') {
      const allStations = getAllStationsList();
      const qClean = query.toLowerCase();

      let filtered = allStations.filter(st => st.toLowerCase().includes(qClean));

      // Header label
      if (!query) {
        countHeader.textContent = `All Stations (${allStations.length}) — Alphabetical`;
      } else {
        countHeader.textContent = `${filtered.length} Matching Station${filtered.length !== 1 ? 's' : ''}`;
      }

      let html = '';

      // Always include "All Trains" if query matches "all", "any", or is empty/short
      if (!query || 'all trains (any stop)'.includes(qClean)) {
        const isAllSelected = !selectedStop;
        html += `<div class="station-option station-option-all ${isAllSelected ? 'selected' : ''}" data-value="">
          <span class="option-label">✨ All Trains (Any Stop)</span>
          ${isAllSelected ? '<span>✓</span>' : ''}
        </div>`;
      }

      if (filtered.length === 0 && query) {
        html += `<div class="no-station-matches">No stations found matching "${esc(query)}"</div>`;
      } else {
        html += filtered.map(st => {
          const isSelected = selectedStop && selectedStop.toLowerCase() === st.toLowerCase();
          return `<div class="station-option ${isSelected ? 'selected' : ''}" data-value="${esc(st)}">
            <span class="option-label">📍 ${highlightMatch(esc(st), query)}</span>
            ${isSelected ? '<span>✓</span>' : ''}
          </div>`;
        }).join('');
      }

      optionsList.innerHTML = html;
      focusedOptionIndex = -1;

      // Attach click listeners to option elements
      optionsList.querySelectorAll('.station-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.getAttribute('data-value');
          setStationFilter(val);
          closeDropdown();
        });
      });
    }

    // Input events
    searchInput.addEventListener('focus', () => {
      openDropdown();
      // Select text on focus for easy replacement
      searchInput.select();
    });

    searchInput.addEventListener('input', () => {
      openDropdown();
      updateClearBtnVisibility();
    });

    searchInput.addEventListener('click', (e) => {
      e.stopPropagation();
      openDropdown();
    });

    // Keyboard Navigation
    searchInput.addEventListener('keydown', (e) => {
      const options = optionsList.querySelectorAll('.station-option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!combobox.classList.contains('open')) {
          openDropdown();
          return;
        }
        if (options.length > 0) {
          focusedOptionIndex = (focusedOptionIndex + 1) % options.length;
          updateOptionFocus(options);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (options.length > 0) {
          focusedOptionIndex = (focusedOptionIndex - 1 + options.length) % options.length;
          updateOptionFocus(options);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedOptionIndex >= 0 && options[focusedOptionIndex]) {
          options[focusedOptionIndex].click();
        } else if (options.length > 0) {
          // Select first available matching option
          options[0].click();
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
        searchInput.value = selectedStop || '';
        searchInput.blur();
      }
    });

    function updateOptionFocus(options) {
      options.forEach((opt, idx) => {
        if (idx === focusedOptionIndex) {
          opt.classList.add('focused');
          opt.scrollIntoView({ block: 'nearest' });
        } else {
          opt.classList.remove('focused');
        }
      });
    }

    // Clear input button
    clearInputBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setStationFilter('');
      searchInput.focus();
      openDropdown();
    });

    function updateClearBtnVisibility() {
      if (searchInput.value.trim().length > 0 || selectedStop) {
        clearInputBtn.style.display = 'block';
      } else {
        clearInputBtn.style.display = 'none';
      }
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!combobox.contains(e.target)) {
        closeDropdown();
        // Reset input field text to selectedStop if user typed without selecting
        searchInput.value = selectedStop || '';
        updateClearBtnVisibility();
      }
    });

    // Pill event listeners
    if (pillJersey) pillJersey.addEventListener('click', () => setStationFilter('Jersey Avenue'));
    if (pillNYPenn) pillNYPenn.addEventListener('click', () => setStationFilter('New York Penn Station'));
    if (pillAll) pillAll.addEventListener('click', () => setStationFilter(''));
    if (clearBannerBtn) clearBannerBtn.addEventListener('click', () => setStationFilter(''));

    updateClearBtnVisibility();
  }

  function setStationFilter(stopName) {
    selectedStop = stopName ? stopName.trim() : '';

    // Update input box text
    const searchInput = $('#station-search-input');
    const clearInputBtn = $('#station-clear-btn');
    if (searchInput) {
      searchInput.value = selectedStop;
    }
    if (clearInputBtn) {
      clearInputBtn.style.display = selectedStop ? 'block' : 'none';
    }

    // Sync hidden select element for full compatibility
    const select = $('#station-filter-select');
    if (select) {
      const allStations = getAllStationsList();
      select.innerHTML = '<option value="">All Trains (Any Stop)</option>' +
        allStations.map(st => `<option value="${esc(st)}" ${st === selectedStop ? 'selected' : ''}>${esc(st)}</option>`).join('');
      select.value = selectedStop;
    }

    // Update Pills
    const pillJersey = $('#pill-jersey-ave');
    const pillNYPenn = $('#pill-ny-penn');
    const pillAll = $('#pill-all');

    if (pillJersey) pillJersey.classList.toggle('active', selectedStop === 'Jersey Avenue');
    if (pillNYPenn) pillNYPenn.classList.toggle('active', selectedStop === 'New York Penn Station');
    if (pillAll) pillAll.classList.toggle('active', selectedStop === '');

    // Update Banner
    const banner = $('#filter-banner');
    const bannerTarget = $('#filter-banner-target');
    if (selectedStop) {
      banner.style.display = 'flex';
      bannerTarget.textContent = selectedStop;
    } else {
      banner.style.display = 'none';
    }

    if (rawData) {
      renderAll(rawData);
    }
  }

  // ─── Arrival Time Calculation ──────────────────────────────
  function calculateArrivalTime(departureTimeStr, lineAbbrv, targetStop, originStation) {
    if (!departureTimeStr || !targetStop) return null;

    const match = departureTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3] ? match[3].toUpperCase() : '';

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const lineOffsets = STATION_OFFSETS[lineAbbrv] || STATION_OFFSETS.NEC;
    const targetClean = targetStop.toLowerCase();
    
    let targetOffset = null;
    for (const [stName, offset] of Object.entries(lineOffsets)) {
      if (stName.includes(targetClean) || targetClean.includes(stName)) {
        targetOffset = offset;
        break;
      }
    }

    if (targetOffset === null) targetOffset = 50;

    let originOffset = 0;
    if (originStation) {
      const originClean = originStation.toLowerCase();
      for (const [stName, offset] of Object.entries(lineOffsets)) {
        if (stName.includes(originClean) || originClean.includes(stName)) {
          originOffset = offset;
          break;
        }
      }
    }

    const travelMinutes = Math.max(0, targetOffset - originOffset);

    const totalMins = hours * 60 + minutes + travelMinutes;
    const newHours24 = Math.floor(totalMins / 60) % 24;
    const newMins = totalMins % 60;

    const newAMPM = newHours24 >= 12 ? 'PM' : 'AM';
    let newHours12 = newHours24 % 12;
    if (newHours12 === 0) newHours12 = 12;

    const paddedMins = newMins < 10 ? `0${newMins}` : `${newMins}`;
    return `${newHours12}:${paddedMins} ${newAMPM}`;
  }

  // ─── Modal Handling ────────────────────────────────────────
  function setupModal() {
    const modal = $('#stops-modal');
    const closeBtn = $('#modal-close-btn');

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function openStopsModal(item) {
    const modal = $('#stops-modal');
    $('#modal-train-num').textContent = `Train ${item.trainNumber}`;
    $('#modal-train-line').textContent = item.line || 'NJT';
    $('#modal-train-time').textContent = item.scheduledTime || '—';
    $('#modal-train-dest').textContent = item.destination || '—';
    $('#modal-train-track').textContent = item.track || item.lastTrack || 'TBD';
    $('#modal-train-status').textContent = item.status || item.departedStatus || 'On Time';

    const stops = getStopsForTrain(item);
    const timeline = $('#modal-stops-timeline');

    timeline.innerHTML = stops.map((stop, idx) => {
      const isSelected = selectedStop && stop.toLowerCase().includes(selectedStop.toLowerCase());
      const isOrigin = idx === 0;
      const isDest = idx === stops.length - 1;

      // Calculate arrival time for this specific stop on timeline
      const stopArrTime = calculateArrivalTime(item.scheduledTime, item.line, stop, item.station);

      let classes = 'timeline-step';
      if (isSelected) classes += ' active-stop';
      if (isOrigin) classes += ' origin-stop';
      if (isDest) classes += ' dest-stop';

      return `<div class="${classes}">
        <div>
          <span>${esc(stop)}</span>
          ${stopArrTime ? `<span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-amber);margin-left:8px;">${esc(stopArrTime)}</span>` : ''}
        </div>
        ${isSelected ? '<span class="stop-tag">📍 Filter Stop Match</span>' : ''}
        ${isOrigin ? '<span class="stop-tag" style="background:rgba(0,45,114,0.3);color:#fff;">Departure</span>' : ''}
        ${isDest ? '<span class="stop-tag" style="background:rgba(246,136,31,0.3);color:var(--text-amber);">Terminus</span>' : ''}
      </div>`;
    }).join('');

    modal.style.display = 'flex';
  }

  function closeModal() {
    $('#stops-modal').style.display = 'none';
  }

  function getStopsForTrain(item) {
    if (item.stops && Array.isArray(item.stops) && item.stops.length > 0) {
      return item.stops;
    }
    const lineStops = LINE_STOPS[item.line] || LINE_STOPS.NEC;
    const destClean = (item.destination || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    let destIdx = lineStops.findIndex(st => 
      st.toLowerCase().replace(/[^a-z0-9]/g, '').includes(destClean) ||
      destClean.includes(st.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
    if (destIdx === -1) destIdx = lineStops.length - 1;

    return lineStops.slice(0, destIdx + 1);
  }

  function trainStopsAt(item, targetStop) {
    if (!targetStop || targetStop.trim() === '') return true;
    const targetClean = targetStop.toLowerCase().replace(/[^a-z0-9]/g, '');

    const destClean = (item.destination || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (destClean.includes(targetClean)) return true;

    const stops = getStopsForTrain(item);
    return stops.some(st => st.toLowerCase().replace(/[^a-z0-9]/g, '').includes(targetClean));
  }

  // ─── Data Fetching ─────────────────────────────────────────
  async function fetchData() {
    try {
      let res = await fetch(API_URL).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch('../data/api_data.json').catch(() => null);
      }
      if (!res || !res.ok) {
        res = await fetch('./data/api_data.json').catch(() => null);
      }
      if (!res || !res.ok) throw new Error(`HTTP fetch failed`);
      rawData = await res.json();
      renderAll(rawData);
      updateStatus('live', rawData.lastUpdated);
    } catch (err) {
      console.warn('[Dashboard] Fetch error:', err.message);
      updateStatus('error');
      loadDemoData();
    }
  }

  function updateStatus(state, lastUpdated) {
    const pill = $('#status-pill');
    const statusText = $('#status-text');
    const updatedEl = $('#last-updated');

    if (state === 'live') {
      pill.className = 'status-pill live';
      statusText.textContent = 'Live';
      if (lastUpdated) {
        const d = new Date(lastUpdated);
        updatedEl.textContent = `Updated ${d.toLocaleTimeString('en-US', { 
          hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' 
        })} ET`;
      }
    } else {
      pill.className = 'status-pill';
      statusText.textContent = 'Demo Mode';
      updatedEl.textContent = 'API not connected';
    }
  }

  // ─── Render All ────────────────────────────────────────────
  function renderAll(data) {
    rawData = data;

    const station = data.activeStation || 'NJ Transit';
    const window = data.activeWindow || '';
    const windowLabel = window === 'morning' ? '🌅 Morning' : window === 'afternoon' ? '🌆 Afternoon' : '';
    $('#header-station').textContent = `${station} ${windowLabel ? '— ' + windowLabel : ''}`;

    // Update column headers for Arrival Time
    const thArr = $('#th-arr-time');
    const thDeptArr = $('#th-departed-arr-time');
    if (selectedStop) {
      thArr.textContent = `Arr @ ${selectedStop}`;
      thArr.style.display = 'table-cell';
      thDeptArr.textContent = `Arr @ ${selectedStop}`;
      thDeptArr.style.display = 'table-cell';
    } else {
      thArr.style.display = 'none';
      thDeptArr.style.display = 'none';
    }

    // Apply stop filter
    const filteredBoard = (data.currentBoard || []).filter(dep => trainStopsAt(dep, selectedStop));
    const filteredDeparted = (data.recentlyDeparted || []).filter(dep => trainStopsAt(dep, selectedStop));
    const filteredPreds = (data.predictions || []).filter(pred => trainStopsAt(pred, selectedStop));

    renderBoard(filteredBoard, filteredDeparted, data.activeStation, data.predictions || []);
    renderPredictions(filteredPreds, data.activeStation);
    renderCancellations(data.cancellations || {}, data.enRouteCancellations || [], data.activeWindow);
  }

  // ─── Departure Board ──────────────────────────────────────
  function renderBoard(board, recentlyDeparted, originStation, predictions) {
    const tbody = $('#departure-tbody');
    const countBadge = $('#board-count');

    if (board.length === 0) {
      const msg = selectedStop 
        ? `No current departures stopping at ${esc(selectedStop)}`
        : 'No departures currently posted';
      tbody.innerHTML = `<tr class="row-empty"><td colspan="8">${msg}</td></tr>`;
      countBadge.textContent = '0 trains';
    } else {
      countBadge.textContent = `${board.length} train${board.length !== 1 ? 's' : ''}`;
      tbody.innerHTML = board.map((dep, index) => {
        const statusClass = getStatusClass(dep.status);
        const arrTime = selectedStop ? calculateArrivalTime(dep.scheduledTime, dep.line, selectedStop, dep.station || originStation) : null;

        // Check for track prediction if no official track is assigned
        let trackPrediction = null;
        if (!dep.track || dep.track === '—' || dep.track.trim() === '') {
          const predItem = (predictions || []).find(p => p.trainNumber === dep.trainNumber);
          if (predItem && predItem.predictedTrack) {
            trackPrediction = predItem.predictedTrack;
          }
        }

        return `<tr data-board-index="${index}">
          <td class="cell-train">${esc(dep.trainNumber)}</td>
          <td>${esc(dep.scheduledTime)}</td>
          ${selectedStop ? `<td style="font-family:var(--font-mono);font-weight:700;color:var(--text-amber);">${esc(arrTime || '—')}</td>` : '<td style="display:none"></td>'}
          <td>${esc(dep.destination)}</td>
          <td><span class="line-badge">${esc(dep.line)}</span></td>
          <td class="col-track">${renderTrackBadge(dep.track, false, trackPrediction, dep.trainNumber)}</td>
          <td><span class="status-text ${statusClass}">${esc(dep.status || '—')}</span></td>
          <td><button class="view-stops-btn">View Stops</button></td>
        </tr>`;
      }).join('');

      tbody.querySelectorAll('tr[data-board-index]').forEach((row, idx) => {
        row.addEventListener('click', () => openStopsModal(board[idx]));
      });

      // Handle clicking on predicted track badges to navigate to predictions page
      tbody.querySelectorAll('.track-badge--predicted').forEach(badge => {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const trainNum = badge.getAttribute('data-pred-train');
          if (trainNum) {
            navigateToPrediction(trainNum);
          }
        });
      });
    }

    // Recently Departed section
    const deptHeader = $('#departed-header');
    const deptWrap = $('#departed-wrap');
    const deptTbody = $('#departed-tbody');
    const deptCount = $('#departed-count');

    if (recentlyDeparted.length > 0) {
      deptHeader.style.display = 'flex';
      deptWrap.style.display = 'block';
      deptCount.textContent = `${recentlyDeparted.length}`;

      deptTbody.innerHTML = recentlyDeparted.map((dep, index) => {
        const ago = timeAgo(dep.removedAt);
        const arrTime = selectedStop ? calculateArrivalTime(dep.scheduledTime, dep.line, selectedStop, dep.station || originStation) : null;

        return `<tr data-dept-index="${index}">
          <td class="cell-train">${esc(dep.trainNumber)}</td>
          <td>${esc(dep.scheduledTime || '')}</td>
          ${selectedStop ? `<td style="font-family:var(--font-mono);font-weight:700;color:var(--text-cyan);">${esc(arrTime || '—')}</td>` : '<td style="display:none"></td>'}
          <td>${esc(dep.destination || '')}</td>
          <td><span class="line-badge">${esc(dep.line || '')}</span></td>
          <td class="col-track">${renderTrackBadge(dep.lastTrack, true)}</td>
          <td><span class="time-ago">${dep.departedStatus === 'Cancelled' ? '❌ Cancelled' : `🚂 ${ago}`}</span></td>
          <td><button class="view-stops-btn">View Stops</button></td>
        </tr>`;
      }).join('');

      deptTbody.querySelectorAll('tr[data-dept-index]').forEach((row, idx) => {
        row.addEventListener('click', () => openStopsModal(recentlyDeparted[idx]));
      });
    } else {
      deptHeader.style.display = 'none';
      deptWrap.style.display = 'none';
    }
  }

  function renderTrackBadge(track, isDeparted, predictedTrack, trainNumber) {
    if (track && track !== '—' && track.trim() !== '') {
      const style = isDeparted ? 'style="opacity:0.7"' : '';
      return `<span class="track-badge" ${style}>${esc(track)}</span>`;
    }

    if (predictedTrack) {
      return `<span class="track-badge track-badge--predicted" data-pred-train="${esc(trainNumber)}" title="Track Prediction: Track ${esc(predictedTrack)} based on historical analysis. Click to view on predictions tab.">
        <span>Trk ${esc(predictedTrack)}</span>
        <span class="pred-label">(Pred)</span>
      </span>`;
    }

    return '<span class="track-badge track-badge--empty">TBD</span>';
  }

  function navigateToPrediction(trainNumber) {
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabBtn = $('#tab-predictions');
    if (tabBtn) tabBtn.classList.add('active');

    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = $('#panel-predictions');
    if (panel) panel.classList.add('active');
    currentTab = 'predictions';

    setTimeout(() => {
      const card = $(`#pred-card-${trainNumber}`) || $(`[data-train-num="${trainNumber}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlighted');
        setTimeout(() => card.classList.remove('highlighted'), 3000);
      }
    }, 100);
  }

  function getStatusClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('on time')) return 'status-text--ontime';
    if (s.includes('cancel')) return 'status-text--cancelled';
    if (s.includes('delay') || s.includes('late') || s.includes('min')) return 'status-text--delayed';
    if (s.includes('board') || s.includes('all aboard')) return 'status-text--boarding';
    if (s.includes('depart')) return 'status-text--departed';
    return '';
  }

  // ─── Predictions ───────────────────────────────────────────
  function renderPredictions(predictions, originStation) {
    const grid = $('#predictions-grid');

    if (predictions.length === 0) {
      const msg = selectedStop 
        ? `No upcoming predictions stopping at ${esc(selectedStop)}`
        : 'No predictions available — waiting for departure data';
      grid.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
        <p>${msg}</p>
      </div>`;
      return;
    }

    grid.innerHTML = predictions.map((pred, idx) => {
      const conf = Math.round((pred.confidence || 0) * 100);
      const confClass = conf >= 40 ? '' : 'low';
      const arrTime = selectedStop ? calculateArrivalTime(pred.scheduledTime, pred.line, selectedStop, originStation) : null;

      const dist = pred.trackDistribution || {};
      const maxCount = Math.max(...Object.values(dist), 1);
      const barsHtml = Object.entries(dist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([track, count]) => {
          const pct = Math.round((count / maxCount) * 100);
          return `<div class="pred-bar-row">
            <span class="pred-bar-track">${esc(track)}</span>
            <div class="pred-bar-fill-wrap">
              <div class="pred-bar-fill" style="width:${pct}%"></div>
            </div>
            <span class="pred-bar-count">${count}d</span>
          </div>`;
        }).join('');

      const excluded = pred.excludedTracks || [];
      const reasons = pred.excludeReasons || {};
      const excludedHtml = excluded.length > 0
        ? `<div class="pred-excluded">
            <strong>Excluded:</strong> ${excluded.map(t => 
              `Track ${esc(t)} (${esc(reasons[t] || 'excluded')})`
            ).join(', ')}
          </div>`
        : '';

      const resultHtml = pred.predictedTrack
        ? `<div class="pred-result">
            <div class="pred-track-big">${esc(pred.predictedTrack)}</div>
            <div class="pred-confidence">
              <div class="label">Confidence</div>
              <div class="value ${confClass}">${conf}%</div>
            </div>
          </div>`
        : `<div class="pred-no-data">${pred.note || 'No prediction available'}</div>`;

      return `<div class="pred-card" id="pred-card-${esc(pred.trainNumber)}" data-train-num="${esc(pred.trainNumber)}" data-pred-index="${idx}">
        <div class="pred-card-header">
          <div class="pred-train-info">
            <span class="pred-train-num">${esc(pred.trainNumber)}</span>
            <div>
              <div class="pred-dest">${esc(pred.destination || '')} ${pred.scheduledTime ? '@ ' + esc(pred.scheduledTime) : ''}</div>
              ${arrTime ? `<div style="font-size:0.75rem;font-weight:700;color:var(--text-amber);margin-top:2px;">ETA @ ${esc(selectedStop)}: ${esc(arrTime)}</div>` : ''}
            </div>
          </div>
          ${pred.currentTrack ? `<div class="pred-current-track">
            <div class="label">Current</div>
            ${renderTrackBadge(pred.currentTrack)}
          </div>` : ''}
        </div>
        ${resultHtml}
        <div class="pred-bars">${barsHtml}</div>
        ${excludedHtml}
      </div>`;
    }).join('');

    grid.querySelectorAll('.pred-card[data-pred-index]').forEach((card, idx) => {
      card.addEventListener('click', () => openStopsModal(predictions[idx]));
    });
  }

  // ─── Cancellations ─────────────────────────────────────────
  function renderCancellations(cancellations, enRoute, activeWindow) {
    const enrouteSection = $('#enroute-section');
    const enrouteCards = $('#enroute-cards');
    const enrouteCount = $('#enroute-count');

    if (activeWindow === 'afternoon' && enRoute.length > 0) {
      enrouteSection.style.display = 'block';
      enrouteCount.textContent = enRoute.length;
      enrouteCards.innerHTML = enRoute.map(c => `
        <div class="cancel-card">
          <div class="cancel-card-header">
            <span class="cancel-train">${esc(c.trainNumber)}</span>
            <span class="cancel-route">${esc(c.line)} → ${esc(c.destination)}</span>
          </div>
          <div class="cancel-detail">Departed Penn: ${esc(c.departedPenn)} (${esc(c.pennStatus)})</div>
          <div class="cancel-detail" style="color:var(--text-red);">❌ Cancelled at Edison</div>
        </div>
      `).join('');
    } else {
      enrouteSection.style.display = 'none';
    }

    const cancelList = $('#cancel-list');
    const recent = cancellations.recentByTrain || {};
    const entries = Object.entries(recent);

    if (entries.length === 0) {
      cancelList.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <p>No cancellations in the last 7 days</p>
      </div>`;
      return;
    }

    entries.sort((a, b) => b[1].length - a[1].length);

    cancelList.innerHTML = entries.map(([trainNum, dates]) => {
      const dateChips = dates.map(d => {
        const formatted = formatDate(d);
        return `<span class="cancel-date-chip">${formatted}</span>`;
      }).join('');

      return `<div class="cancel-list-item">
        <span class="cancel-list-train">${esc(trainNum)}</span>
        <div class="cancel-list-dates">${dateChips}</div>
        <span class="cancel-list-count">${dates.length}×</span>
      </div>`;
    }).join('');
  }

  // ─── Demo Data Fallback ────────────────────────────────────
  function loadDemoData() {
    const demo = {
      lastUpdated: new Date().toISOString(),
      activeStation: 'Penn Station New York',
      activeWindow: 'afternoon',
      currentBoard: [
        { trainNumber: '3267', scheduledTime: '3:10 PM', destination: 'Trenton', line: 'NEC', track: '5', status: 'On Time', stops: ["New York Penn Station", "Secaucus Junction", "Newark Penn Station", "Metropark", "Edison", "New Brunswick", "Jersey Avenue", "Princeton Junction", "Trenton"] },
        { trainNumber: '3849', scheduledTime: '3:24 PM', destination: 'Long Branch', line: 'NJCL', track: '', status: 'In Delay', stops: ["New York Penn Station", "Secaucus Junction", "Newark Penn Station", "Elizabeth", "Rahway", "Woodbridge", "Perth Amboy", "South Amboy", "Long Branch"] },
        { trainNumber: '3721', scheduledTime: '3:56 PM', destination: 'Jersey Avenue', line: 'NEC', track: '', status: 'On Time', stops: ["New York Penn Station", "Secaucus Junction", "Newark Penn Station", "Elizabeth", "Rahway", "Metropark", "Metuchen", "Edison", "New Brunswick", "Jersey Avenue"] },
        { trainNumber: '3855', scheduledTime: '3:30 PM', destination: 'Trenton', line: 'NEC', track: '14', status: 'All Aboard', stops: ["New York Penn Station", "Secaucus Junction", "Newark Penn Station", "Newark Airport", "Metropark", "Metuchen", "Edison", "New Brunswick", "Jersey Avenue", "Princeton Junction", "Trenton"] },
        { trainNumber: '5743', scheduledTime: '4:03 PM', destination: 'Montclair', line: 'M&E', track: '', status: 'Cancelled', stops: ["New York Penn Station", "Secaucus Junction", "Newark Broad St", "East Orange", "Orange", "Montclair State University (MSU)"] }
      ],
      recentlyDeparted: [
        { trainNumber: '3719', scheduledTime: '2:45 PM', destination: 'Jersey Avenue', line: 'NEC', lastTrack: '8', removedAt: new Date(Date.now() - 4 * 60000).toISOString(), departedStatus: 'Departed', stops: ["New York Penn Station", "Secaucus Junction", "Newark Penn Station", "Metropark", "Edison", "New Brunswick", "Jersey Avenue"] }
      ],
      predictions: [
        {
          trainNumber: '3721', destination: 'Jersey Avenue', line: 'NEC', scheduledTime: '3:56 PM',
          currentTrack: '', predictedTrack: '8', confidence: 0.65,
          trackDistribution: { '8': 42, '11': 15, '5': 8 },
          daysOfData: 65, excludedTracks: ['5', '14'], excludeReasons: { '5': 'currently occupied', '14': 'currently occupied' },
          stops: ["New York Penn Station", "Secaucus Junction", "Newark Penn Station", "Elizabeth", "Rahway", "Metropark", "Metuchen", "Edison", "New Brunswick", "Jersey Avenue"]
        },
        {
          trainNumber: '3855', destination: 'Trenton', line: 'NEC', scheduledTime: '3:30 PM',
          currentTrack: '14', predictedTrack: '14', confidence: 1.0,
          trackDistribution: { '14': 45, '8': 10 },
          daysOfData: 55, excludedTracks: ['5'], excludeReasons: { '5': 'currently occupied' },
          stops: ["New York Penn Station", "Secaucus Junction", "Newark Penn Station", "Newark Airport", "Metropark", "Metuchen", "Edison", "New Brunswick", "Jersey Avenue", "Princeton Junction", "Trenton"]
        }
      ],
      cancellations: {
        recentByTrain: {
          '5743': ['2026-08-21', '2026-08-19', '2026-08-15'],
          '3721': ['2026-08-18']
        }
      },
      enRouteCancellations: [],
      trackRegistry: ['1', '2', '5', '8', '11', '14']
    };

    renderAll(demo);
  }

  // ─── Utilities ─────────────────────────────────────────────
  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function timeAgo(isoStr) {
    if (!isoStr) return '';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    return `${mins} min ago`;
  }

  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr + 'T12:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
    } catch {
      return dateStr;
    }
  }

  // ─── Boot ──────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
