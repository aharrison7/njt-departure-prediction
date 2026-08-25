/**
 * NJ Transit Line Routes, Station Stops & Travel Time Offsets
 * 
 * Provides intermediate station stop lists and estimated travel time offsets
 * from origin to calculate expected arrival times at intermediate stops.
 */

const LINE_STOPS = {
  NEC: [
    "New York Penn Station",
    "Secaucus Junction",
    "Newark Penn Station",
    "Newark Airport",
    "North Elizabeth",
    "Elizabeth",
    "Rahway",
    "Metropark",
    "Metuchen",
    "Edison",
    "New Brunswick",
    "Jersey Avenue",
    "Princeton Junction",
    "Hamilton",
    "Trenton"
  ],
  NJCL: [
    "New York Penn Station",
    "Secaucus Junction",
    "Newark Penn Station",
    "Elizabeth",
    "Rahway",
    "Avenel",
    "Woodbridge",
    "Perth Amboy",
    "South Amboy",
    "Matawan",
    "Hazlet",
    "Middletown",
    "Red Bank",
    "Little Silver",
    "Long Branch",
    "Elberon",
    "Allenhurst",
    "Asbury Park",
    "Bradley Beach",
    "Belmar",
    "Spring Lake",
    "Manasquan",
    "Point Pleasant Beach",
    "Bay Head"
  ],
  "M&E": [
    "New York Penn Station",
    "Secaucus Junction",
    "Newark Broad St",
    "East Orange",
    "Brick Church",
    "Orange",
    "Highland Ave",
    "Mountain Station",
    "South Orange",
    "Maplewood",
    "Millburn",
    "Short Hills",
    "Summit",
    "Chatham",
    "Madison",
    "Convent Station",
    "Morristown",
    "Morris Plains",
    "Mount Tabor",
    "Denville",
    "Dover"
  ],
  MOBO: [
    "New York Penn Station",
    "Secaucus Junction",
    "Newark Broad St",
    "Broad Street Bloomfield",
    "Glen Ridge",
    "Bay Street Montclair",
    "Walnut Street",
    "Watchung Avenue",
    "Upper Montclair",
    "Mountain Avenue",
    "Montclair Heights",
    "Montclair State University (MSU)",
    "Little Falls",
    "Mountain View",
    "Wayne Route 23",
    "Towaco",
    "Lincoln Park",
    "Boonton",
    "Denville",
    "Lake Hopatcong",
    "Netcong",
    "Mount Arlington",
    "Mount Olive",
    "Hackettstown"
  ],
  RVL: [
    "New York Penn Station",
    "Secaucus Junction",
    "Newark Penn Station",
    "Union",
    "Roselle Park",
    "Cranford",
    "Garwood",
    "Westfield",
    "Fanwood",
    "Netherwood",
    "Plainfield",
    "Dunellen",
    "Bound Brook",
    "Bridgewater",
    "Somerville",
    "Raritan",
    "North Branch",
    "White House",
    "Lebanon",
    "Annandale",
    "High Bridge"
  ],
  RARV: [
    "New York Penn Station",
    "Secaucus Junction",
    "Newark Penn Station",
    "Union",
    "Roselle Park",
    "Cranford",
    "Garwood",
    "Westfield",
    "Fanwood",
    "Netherwood",
    "Plainfield",
    "Dunellen",
    "Bound Brook",
    "Bridgewater",
    "Somerville",
    "Raritan",
    "North Branch",
    "White House",
    "Lebanon",
    "Annandale",
    "High Bridge"
  ],
  RV: [
    "New York Penn Station",
    "Secaucus Junction",
    "Newark Penn Station",
    "Union",
    "Roselle Park",
    "Cranford",
    "Garwood",
    "Westfield",
    "Fanwood",
    "Netherwood",
    "Plainfield",
    "Dunellen",
    "Bound Brook",
    "Bridgewater",
    "Somerville",
    "Raritan",
    "North Branch",
    "White House",
    "Lebanon",
    "Annandale",
    "High Bridge"
  ],
  MAIN: [
    "Hoboken",
    "Secaucus Junction",
    "Kingsland",
    "Lyndhurst",
    "Delawanna",
    "Passaic",
    "Clifton",
    "Paterson",
    "Fair Lawn (Broadway)",
    "Fair Lawn (Radburn)",
    "Glen Rock",
    "Ridgewood",
    "Ho-Ho-Kus",
    "Waldwick",
    "Allendale",
    "Ramsey",
    "Ramsey Route 17",
    "Mahwah",
    "Suffern"
  ],
  BGN: [
    "Hoboken",
    "Secaucus Junction",
    "Rutherford",
    "Garfield",
    "Plauderville",
    "Fair Lawn (Broadway)",
    "Glen Rock",
    "Ridgewood",
    "Ho-Ho-Kus",
    "Waldwick",
    "Allendale",
    "Ramsey",
    "Ramsey Route 17",
    "Mahwah",
    "Suffern"
  ],
  PVL: [
    "Hoboken",
    "Secaucus Junction",
    "Wood-Ridge",
    "Teterboro",
    "Essex Street",
    "Anderson Street",
    "New Bridge Landing",
    "River Edge",
    "Oradell",
    "Emerson",
    "Westwood",
    "Hillsdale",
    "Woodcliff Lake",
    "Park Ridge",
    "Montvale",
    "Pearl River",
    "Nanuet",
    "Spring Valley"
  ],
  GLAD: [
    "New York Penn Station",
    "Secaucus Junction",
    "Newark Broad St",
    "East Orange",
    "Brick Church",
    "Orange",
    "Highland Ave",
    "Mountain Station",
    "South Orange",
    "Maplewood",
    "Millburn",
    "Short Hills",
    "Summit",
    "New Providence",
    "Murray Hill",
    "Berkeley Heights",
    "Gillette",
    "Stirling",
    "Millington",
    "Lyons",
    "Basking Ridge",
    "Bernardsville",
    "Far Hills",
    "Peapack",
    "Gladstone"
  ],
  ACL: [
    "Philadelphia 30th St",
    "Pennsauken",
    "Cherry Hill",
    "Lindenwold",
    "Atco",
    "Hammonton",
    "Egg Harbor City",
    "Absecon",
    "Atlantic City"
  ],
  PJL: [
    "Suffern",
    "Sloatsburg",
    "Tuxedo",
    "Harriman",
    "Salisbury Mills-Cornwall",
    "Campbell Hall",
    "Middletown NY",
    "Otisville",
    "Port Jervis"
  ],
  AMTK: [
    "New York Penn Station",
    "Newark Penn Station",
    "Metropark",
    "Trenton",
    "Philadelphia 30th St",
    "Wilmington",
    "Baltimore",
    "Washington Union Station"
  ]
};

// Travel time offsets in minutes from line origin
const STATION_OFFSETS = {
  NEC: {
    "new york penn station": 0,
    "secaucus junction": 10,
    "newark penn station": 18,
    "newark airport": 22,
    "north elizabeth": 26,
    "elizabeth": 29,
    "rahway": 36,
    "metropark": 43,
    "metuchen": 49,
    "edison": 55,
    "new brunswick": 60,
    "jersey avenue": 65,
    "princeton junction": 76,
    "hamilton": 86,
    "trenton": 95
  },
  NJCL: {
    "new york penn station": 0,
    "secaucus junction": 10,
    "newark penn station": 18,
    "elizabeth": 29,
    "rahway": 36,
    "avenel": 40,
    "woodbridge": 44,
    "perth amboy": 50,
    "south amboy": 56,
    "matawan": 65,
    "hazlet": 73,
    "middletown": 80,
    "red bank": 87,
    "little silver": 92,
    "long branch": 102,
    "bay head": 135
  },
  "M&E": {
    "new york penn station": 0,
    "secaucus junction": 10,
    "newark broad st": 18,
    "east orange": 24,
    "brick church": 27,
    "orange": 30,
    "highland ave": 33,
    "mountain station": 36,
    "south orange": 40,
    "maplewood": 44,
    "millburn": 48,
    "short hills": 52,
    "summit": 58,
    "chatham": 64,
    "madison": 69,
    "convent station": 73,
    "morristown": 78,
    "dover": 95
  },
  RVL: {
    "new york penn station": 0,
    "secaucus junction": 10,
    "newark penn station": 18,
    "union": 27,
    "roselle park": 32,
    "cranford": 36,
    "garwood": 39,
    "westfield": 42,
    "fanwood": 46,
    "netherwood": 49,
    "plainfield": 53,
    "dunellen": 58,
    "bound brook": 65,
    "bridgewater": 70,
    "somerville": 75,
    "raritan": 80,
    "north branch": 87,
    "white house": 94,
    "lebanon": 100,
    "annandale": 105,
    "high bridge": 110
  }
};

/**
 * Determine line abbreviation from line name, destination, and train number.
 */
function resolveLine(lineAbbrv, destination, trainNumber) {
  const lineClean = (lineAbbrv || '').toUpperCase().trim();
  const destClean = (destination || '').toLowerCase().trim();

  if (['RVL', 'RV', 'RAR', 'RARITAN', 'RARITAN VALLEY', 'RARITAN VALLEY LINE'].includes(lineClean) ||
      destClean.includes('raritan') || destClean.includes('high bridge') || destClean.includes('somerville') ||
      destClean.includes('plainfield') || destClean.includes('dunellen') || destClean.includes('bound brook') ||
      destClean.includes('bridgewater') || destClean.includes('white house') || destClean.includes('annandale') ||
      destClean.includes('lebanon') || destClean.includes('cranford') || destClean.includes('roselle park')) {
    return 'RVL';
  }

  if (['NJCL', 'COAST', 'NORTH JERSEY COAST', 'BAY HEAD', 'LONG BRANCH'].includes(lineClean) ||
      destClean.includes('bay head') || destClean.includes('long branch') || destClean.includes('south amboy') ||
      destClean.includes('asbury park') || destClean.includes('hazlet') || destClean.includes('middletown') ||
      destClean.includes('red bank') || destClean.includes('point pleasant') || destClean.includes('belmar')) {
    return 'NJCL';
  }

  if (['M&E', 'ME', 'MORRIS & ESSEX', 'MORRISTOWN', 'DOVER'].includes(lineClean) ||
      destClean.includes('dover') || destClean.includes('morristown') || destClean.includes('summit') ||
      destClean.includes('south orange') || destClean.includes('maplewood') || destClean.includes('chatham') ||
      destClean.includes('madison') || destClean.includes('convent') || destClean.includes('morris plains')) {
    return 'M&E';
  }

  if (['MOBO', 'MONTCLAIR', 'MONTCLAIR-BOONTON', 'BOONTON', 'MSU', 'HACKETTSTOWN'].includes(lineClean) ||
      destClean.includes('msu') || destClean.includes('montclair') || destClean.includes('hackettstown') ||
      destClean.includes('boonton') || destClean.includes('wayne') || destClean.includes('little falls')) {
    return 'MOBO';
  }

  if (['GLAD', 'GLADSTONE', 'PASSAIC & DELAWARE'].includes(lineClean) ||
      destClean.includes('gladstone') || destClean.includes('bernardsville') || destClean.includes('peapack') ||
      destClean.includes('far hills') || destClean.includes('berkeley heights') || destClean.includes('murray hill') ||
      destClean.includes('new providence') || destClean.includes('stirling') || destClean.includes('millington')) {
    return 'GLAD';
  }

  if (['AMTK', 'AMTRAK', 'ACELA', 'NER', 'REGIONAL'].includes(lineClean) ||
      (trainNumber && String(trainNumber).startsWith('A')) ||
      destClean.includes('washington') || destClean.includes('baltimore') || destClean.includes('wilmington') ||
      destClean.includes('philadelphia') || destClean.includes('newport news') || destClean.includes('norfolk') ||
      destClean.includes('richmond') || destClean.includes('charlotte') || destClean.includes('savannah') ||
      destClean.includes('boston')) {
    return 'AMTK';
  }

  if (['MAIN', 'MAIN LINE'].includes(lineClean) || destClean.includes('suffern') || destClean.includes('ridgewood') ||
      destClean.includes('paterson') || destClean.includes('clifton') || destClean.includes('passaic')) {
    return 'MAIN';
  }

  if (['BGN', 'BERGEN', 'BERGEN COUNTY'].includes(lineClean) || destClean.includes('garfield') || destClean.includes('rutherford')) {
    return 'BGN';
  }

  if (['PVL', 'PASCACK', 'PASCACK VALLEY'].includes(lineClean) || destClean.includes('spring valley')) {
    return 'PVL';
  }

  if (['ACL', 'ATLANTIC CITY'].includes(lineClean) || destClean.includes('atlantic city')) {
    return 'ACL';
  }

  if (['PJL', 'PORT JERVIS'].includes(lineClean) || destClean.includes('port jervis')) {
    return 'PJL';
  }

  return 'NEC';
}

/**
 * Get intermediate stops for a train given its line and destination.
 */
function getTrainStops(lineAbbrv, destination, originStation, trainNumber) {
  const lineKey = resolveLine(lineAbbrv, destination, trainNumber);
  const fullRoute = LINE_STOPS[lineKey] || LINE_STOPS.NEC;
  const destClean = (destination || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  let destIdx = fullRoute.findIndex(st => 
    st.toLowerCase().replace(/[^a-z0-9]/g, '').includes(destClean) ||
    destClean.includes(st.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );

  if (destIdx === -1) destIdx = fullRoute.length - 1;

  let stops = fullRoute.slice(0, destIdx + 1);

  if (originStation) {
    const originClean = originStation.toLowerCase().replace(/[^a-z0-9]/g, '');
    const originIdx = stops.findIndex(st => 
      st.toLowerCase().replace(/[^a-z0-9]/g, '').includes(originClean) ||
      originClean.includes(st.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
    if (originIdx !== -1) {
      stops = stops.slice(originIdx);
    }
  }

  return stops;
}

/**
 * Calculate expected arrival time at a specific stop station.
 * 
 * @param {string} departureTimeStr - Departure time string (e.g., "3:30 PM", "6:50 AM")
 * @param {string} lineAbbrv - Line abbreviation (NEC, NJCL, etc.)
 * @param {string} targetStop - Target station stop name (e.g. "Jersey Avenue")
 * @param {string} originStation - Origin station name (e.g. "NY Penn")
 * @returns {string|null} Formatted arrival time (e.g., "4:35 PM") or null
 */
function calculateArrivalTime(departureTimeStr, lineAbbrv, targetStop, originStation) {
  if (!departureTimeStr || !targetStop) return null;

  // Match time format: HH:MM AM/PM
  const match = departureTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3] ? match[3].toUpperCase() : '';

  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  // Get offsets
  const lineOffsets = STATION_OFFSETS[lineAbbrv] || STATION_OFFSETS.NEC;
  const targetClean = targetStop.toLowerCase();
  
  let targetOffset = null;
  for (const [stName, offset] of Object.entries(lineOffsets)) {
    if (stName.includes(targetClean) || targetClean.includes(stName)) {
      targetOffset = offset;
      break;
    }
  }

  if (targetOffset === null) targetOffset = 50; // Default estimate 50 min

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

  // Add travel minutes
  const totalMins = hours * 60 + minutes + travelMinutes;
  const newHours24 = Math.floor(totalMins / 60) % 24;
  const newMins = totalMins % 60;

  const newAMPM = newHours24 >= 12 ? 'PM' : 'AM';
  let newHours12 = newHours24 % 12;
  if (newHours12 === 0) newHours12 = 12;

  const paddedMins = newMins < 10 ? `0${newMins}` : `${newMins}`;
  return `${newHours12}:${paddedMins} ${newAMPM}`;
}

function getAllStationStops() {
  const allStops = new Set();
  for (const stops of Object.values(LINE_STOPS)) {
    for (const stop of stops) {
      allStops.add(stop);
    }
  }
  return Array.from(allStops).sort((a, b) => a.localeCompare(b));
}

module.exports = {
  LINE_STOPS,
  STATION_OFFSETS,
  resolveLine,
  getTrainStops,
  calculateArrivalTime,
  getAllStationStops
};
