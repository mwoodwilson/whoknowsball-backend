/**
 * Team Mappings for Odds API <-> API-Sports Integration
 *
 * Maps team names between The Odds API and API-Sports for accurate game matching.
 * Both APIs use full team names, but there may be slight variations.
 *
 * Phase 1: NFL (32), NBA (30), NHL (32), MLB (30) = 124 teams
 * Phase 2: NCAAF (130 teams) - TBD after 1 week monitoring
 *
 * CRITICAL: Disambiguate teams with same nickname across sports (6 collisions)
 */

import levenshtein from 'fast-levenshtein';

/**
 * Team Name Collision Disambiguation
 *
 * Critical: Prevents cross-sport matching for teams with identical nicknames.
 * 6 collision pairs identified: Kings, Rangers, Giants, Jets, Cardinals, Panthers
 *
 * Strategy: Each collision keyword maps to sport-specific normalized identifiers.
 * "NONE" indicates the sport doesn't have a team with that nickname.
 */
const TEAM_DISAMBIGUATIONS: Record<string, Record<string, string>> = {
  // KINGS COLLISION: Sacramento Kings (NBA) vs Los Angeles Kings (NHL)
  'kings': {
    'americanfootball_nfl': 'NONE',
    'basketball_nba': 'sacramento_kings',
    'icehockey_nhl': 'losangeles_kings',
    'baseball_mlb': 'NONE',
    'americanfootball_ncaaf': 'NONE'
  },

  // RANGERS COLLISION: New York Rangers (NHL) vs Texas Rangers (MLB)
  'rangers': {
    'americanfootball_nfl': 'NONE',
    'basketball_nba': 'NONE',
    'icehockey_nhl': 'newyork_rangers',
    'baseball_mlb': 'texas_rangers',
    'americanfootball_ncaaf': 'NONE'
  },

  // GIANTS COLLISION: New York Giants (NFL) vs San Francisco Giants (MLB)
  'giants': {
    'americanfootball_nfl': 'newyork_giants',
    'basketball_nba': 'NONE',
    'icehockey_nhl': 'NONE',
    'baseball_mlb': 'sanfrancisco_giants',
    'americanfootball_ncaaf': 'NONE'
  },

  // JETS COLLISION: New York Jets (NFL) vs Winnipeg Jets (NHL)
  'jets': {
    'americanfootball_nfl': 'newyork_jets',
    'basketball_nba': 'NONE',
    'icehockey_nhl': 'winnipeg_jets',
    'baseball_mlb': 'NONE',
    'americanfootball_ncaaf': 'NONE'
  },

  // CARDINALS COLLISION: Arizona Cardinals (NFL) vs St. Louis Cardinals (MLB)
  // Historical note: NFL Cardinals were in St. Louis 1988-1987
  'cardinals': {
    'americanfootball_nfl': 'arizona_cardinals',
    'basketball_nba': 'NONE',
    'icehockey_nhl': 'NONE',
    'baseball_mlb': 'stlouis_cardinals',
    'americanfootball_ncaaf': 'NONE'
  },

  // PANTHERS COLLISION: Carolina Panthers (NFL) vs Florida Panthers (NHL)
  'panthers': {
    'americanfootball_nfl': 'carolina_panthers',
    'basketball_nba': 'NONE',
    'icehockey_nhl': 'florida_panthers',
    'baseball_mlb': 'NONE',
    'americanfootball_ncaaf': 'NONE'
  }
};

// NFL Teams (32 teams)
export const NFL_TEAM_MAP: Record<string, string> = {
  // AFC East
  'Buffalo Bills': 'Buffalo Bills',
  'Miami Dolphins': 'Miami Dolphins',
  'New England Patriots': 'New England Patriots',
  'New York Jets': 'New York Jets',

  // AFC North
  'Baltimore Ravens': 'Baltimore Ravens',
  'Cincinnati Bengals': 'Cincinnati Bengals',
  'Cleveland Browns': 'Cleveland Browns',
  'Pittsburgh Steelers': 'Pittsburgh Steelers',

  // AFC South
  'Houston Texans': 'Houston Texans',
  'Indianapolis Colts': 'Indianapolis Colts',
  'Jacksonville Jaguars': 'Jacksonville Jaguars',
  'Tennessee Titans': 'Tennessee Titans',

  // AFC West
  'Denver Broncos': 'Denver Broncos',
  'Kansas City Chiefs': 'Kansas City Chiefs',
  'Las Vegas Raiders': 'Las Vegas Raiders',
  'Los Angeles Chargers': 'Los Angeles Chargers',

  // NFC East
  'Dallas Cowboys': 'Dallas Cowboys',
  'New York Giants': 'New York Giants',
  'Philadelphia Eagles': 'Philadelphia Eagles',
  'Washington Commanders': 'Washington Commanders',

  // NFC North
  'Chicago Bears': 'Chicago Bears',
  'Detroit Lions': 'Detroit Lions',
  'Green Bay Packers': 'Green Bay Packers',
  'Minnesota Vikings': 'Minnesota Vikings',

  // NFC South
  'Atlanta Falcons': 'Atlanta Falcons',
  'Carolina Panthers': 'Carolina Panthers',
  'New Orleans Saints': 'New Orleans Saints',
  'Tampa Bay Buccaneers': 'Tampa Bay Buccaneers',

  // NFC West
  'Arizona Cardinals': 'Arizona Cardinals',
  'Los Angeles Rams': 'Los Angeles Rams',
  'San Francisco 49ers': 'San Francisco 49ers',
  'Seattle Seahawks': 'Seattle Seahawks',
};

// NBA Teams (30 teams)
export const NBA_TEAM_MAP: Record<string, string> = {
  // Atlantic
  'Boston Celtics': 'Boston Celtics',
  'Brooklyn Nets': 'Brooklyn Nets',
  'New York Knicks': 'New York Knicks',
  'Philadelphia 76ers': 'Philadelphia 76ers',
  'Toronto Raptors': 'Toronto Raptors',

  // Central
  'Chicago Bulls': 'Chicago Bulls',
  'Cleveland Cavaliers': 'Cleveland Cavaliers',
  'Detroit Pistons': 'Detroit Pistons',
  'Indiana Pacers': 'Indiana Pacers',
  'Milwaukee Bucks': 'Milwaukee Bucks',

  // Southeast
  'Atlanta Hawks': 'Atlanta Hawks',
  'Charlotte Hornets': 'Charlotte Hornets',
  'Miami Heat': 'Miami Heat',
  'Orlando Magic': 'Orlando Magic',
  'Washington Wizards': 'Washington Wizards',

  // Northwest
  'Denver Nuggets': 'Denver Nuggets',
  'Minnesota Timberwolves': 'Minnesota Timberwolves',
  'Oklahoma City Thunder': 'Oklahoma City Thunder',
  'Portland Trail Blazers': 'Portland Trail Blazers',
  'Utah Jazz': 'Utah Jazz',

  // Pacific
  'Golden State Warriors': 'Golden State Warriors',
  'Los Angeles Clippers': 'Los Angeles Clippers',
  'Los Angeles Lakers': 'Los Angeles Lakers',
  'Phoenix Suns': 'Phoenix Suns',
  'Sacramento Kings': 'Sacramento Kings',

  // Southwest
  'Dallas Mavericks': 'Dallas Mavericks',
  'Houston Rockets': 'Houston Rockets',
  'Memphis Grizzlies': 'Memphis Grizzlies',
  'New Orleans Pelicans': 'New Orleans Pelicans',
  'San Antonio Spurs': 'San Antonio Spurs',
};

// NHL Teams (32 teams)
export const NHL_TEAM_MAP: Record<string, string> = {
  // Atlantic
  'Boston Bruins': 'Boston Bruins',
  'Buffalo Sabres': 'Buffalo Sabres',
  'Detroit Red Wings': 'Detroit Red Wings',
  'Florida Panthers': 'Florida Panthers',
  'Montreal Canadiens': 'Montreal Canadiens',
  'Ottawa Senators': 'Ottawa Senators',
  'Tampa Bay Lightning': 'Tampa Bay Lightning',
  'Toronto Maple Leafs': 'Toronto Maple Leafs',

  // Metropolitan
  'Carolina Hurricanes': 'Carolina Hurricanes',
  'Columbus Blue Jackets': 'Columbus Blue Jackets',
  'New Jersey Devils': 'New Jersey Devils',
  'New York Islanders': 'New York Islanders',
  'New York Rangers': 'New York Rangers',
  'Philadelphia Flyers': 'Philadelphia Flyers',
  'Pittsburgh Penguins': 'Pittsburgh Penguins',
  'Washington Capitals': 'Washington Capitals',

  // Central
  'Arizona Coyotes': 'Arizona Coyotes',
  'Chicago Blackhawks': 'Chicago Blackhawks',
  'Colorado Avalanche': 'Colorado Avalanche',
  'Dallas Stars': 'Dallas Stars',
  'Minnesota Wild': 'Minnesota Wild',
  'Nashville Predators': 'Nashville Predators',
  'St. Louis Blues': 'St. Louis Blues',
  'Winnipeg Jets': 'Winnipeg Jets',

  // Pacific
  'Anaheim Ducks': 'Anaheim Ducks',
  'Calgary Flames': 'Calgary Flames',
  'Edmonton Oilers': 'Edmonton Oilers',
  'Los Angeles Kings': 'Los Angeles Kings',
  'San Jose Sharks': 'San Jose Sharks',
  'Seattle Kraken': 'Seattle Kraken',
  'Vancouver Canucks': 'Vancouver Canucks',
  'Vegas Golden Knights': 'Vegas Golden Knights',
};

// MLB Teams (30 teams)
export const MLB_TEAM_MAP: Record<string, string> = {
  // AL East
  'Baltimore Orioles': 'Baltimore Orioles',
  'Boston Red Sox': 'Boston Red Sox',
  'New York Yankees': 'New York Yankees',
  'Tampa Bay Rays': 'Tampa Bay Rays',
  'Toronto Blue Jays': 'Toronto Blue Jays',

  // AL Central
  'Chicago White Sox': 'Chicago White Sox',
  'Cleveland Guardians': 'Cleveland Guardians',
  'Detroit Tigers': 'Detroit Tigers',
  'Kansas City Royals': 'Kansas City Royals',
  'Minnesota Twins': 'Minnesota Twins',

  // AL West
  'Houston Astros': 'Houston Astros',
  'Los Angeles Angels': 'Los Angeles Angels',
  'Oakland Athletics': 'Oakland Athletics',
  'Seattle Mariners': 'Seattle Mariners',
  'Texas Rangers': 'Texas Rangers',

  // NL East
  'Atlanta Braves': 'Atlanta Braves',
  'Miami Marlins': 'Miami Marlins',
  'New York Mets': 'New York Mets',
  'Philadelphia Phillies': 'Philadelphia Phillies',
  'Washington Nationals': 'Washington Nationals',

  // NL Central
  'Chicago Cubs': 'Chicago Cubs',
  'Cincinnati Reds': 'Cincinnati Reds',
  'Milwaukee Brewers': 'Milwaukee Brewers',
  'Pittsburgh Pirates': 'Pittsburgh Pirates',
  'St. Louis Cardinals': 'St. Louis Cardinals',

  // NL West
  'Arizona Diamondbacks': 'Arizona Diamondbacks',
  'Colorado Rockies': 'Colorado Rockies',
  'Los Angeles Dodgers': 'Los Angeles Dodgers',
  'San Diego Padres': 'San Diego Padres',
  'San Francisco Giants': 'San Francisco Giants',
};

// Sport-specific mapping lookup
const SPORT_MAPS: Record<string, Record<string, string>> = {
  'americanfootball_nfl': NFL_TEAM_MAP,
  'basketball_nba': NBA_TEAM_MAP,
  'icehockey_nhl': NHL_TEAM_MAP,
  'baseball_mlb': MLB_TEAM_MAP,
};

/**
 * Normalize team name with sport-specific collision disambiguation
 *
 * @param name - Team name to normalize
 * @param sportKey - Sport key to disambiguate collisions
 * @returns Normalized, sport-specific team identifier
 */
export function normalizeTeamName(name: string, sportKey: string): string {
  // Step 1: Basic normalization (lowercase, remove special chars)
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  // Step 2: Check for collision keywords
  for (const [collisionKey, sportMap] of Object.entries(TEAM_DISAMBIGUATIONS)) {
    if (normalized.includes(collisionKey)) {
      const disambiguated = sportMap[sportKey];

      if (disambiguated && disambiguated !== 'NONE') {
        console.log(`[TeamMapping] 🔍 Disambiguated "${name}" → "${disambiguated}" for ${sportKey}`);
        return disambiguated;
      }

      // If NONE, this sport doesn't have this nickname
      if (disambiguated === 'NONE') {
        console.log(`[TeamMapping] ⚠️ "${name}" contains "${collisionKey}" but ${sportKey} has no such team`);
      }

      // Fall through to return normalized name
      break;
    }
  }

  // Step 3: No collision - return standard normalization
  return normalized;
}

/**
 * Get possible sport keys for a team name (collision detection)
 *
 * @param teamName - Team name to analyze
 * @returns Array of sport keys where this team name could exist
 */
export function getTeamSportKey(teamName: string): string[] {
  const normalized = teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const possibleSports: string[] = [];

  // Check if this is a collision case
  for (const [collisionKey, sportMap] of Object.entries(TEAM_DISAMBIGUATIONS)) {
    if (normalized.includes(collisionKey)) {
      // Found a collision keyword - return only sports that have this team
      for (const [sport, value] of Object.entries(sportMap)) {
        if (value !== 'NONE') {
          possibleSports.push(sport);
        }
      }
      return possibleSports;
    }
  }

  // Not a collision case - could be any sport
  return ['americanfootball_nfl', 'basketball_nba', 'icehockey_nhl', 'baseball_mlb', 'americanfootball_ncaaf'];
}


/**
 * Get all team names for a sport (Odds API format)
 *
 * @param sportKey - Sport key (e.g., 'americanfootball_nfl')
 * @returns Array of team names
 */
export function getAllTeamsForSport(sportKey: string): string[] {
  const sportMap = SPORT_MAPS[sportKey];
  return sportMap ? Object.keys(sportMap) : [];
}

/**
 * Get sport display name from sport key
 *
 * @param sportKey - Sport key (e.g., 'americanfootball_nfl')
 * @returns Human-readable sport name
 */
export function getSportDisplayName(sportKey: string): string {
  const displayNames: Record<string, string> = {
    'americanfootball_nfl': 'NFL',
    'basketball_nba': 'NBA',
    'icehockey_nhl': 'NHL',
    'baseball_mlb': 'MLB',
    'americanfootball_ncaaf': 'NCAAF',
  };
  return displayNames[sportKey] || sportKey;
}

/**
 * API-Sports Team Name Mappings
 *
 * Strategy: Assume team names are identical between Odds API and API-Sports.
 * This mapping starts empty and will be populated with exceptions as discovered during testing.
 *
 * If API-Sports uses different team names, add explicit mappings here:
 * Example: 'Los Angeles Lakers': 'LA Lakers'
 */
export const API_SPORTS_TEAM_MAP: Record<string, Record<string, string>> = {
  'americanfootball_nfl': {
    // Add exceptions as discovered during testing
    // Example: 'Odds API Name': 'API-Sports Name'
  },
  'americanfootball_ncaaf': {
    // Add exceptions as discovered during testing
  },
  'basketball_nba': {
    // Add exceptions as discovered during testing
  },
  'icehockey_nhl': {
    // Add exceptions as discovered during testing
  },
  'baseball_mlb': {
    // Add exceptions as discovered during testing
  }
};

/**
 * Get API-Sports team name from Odds API name
 *
 * Returns input name as-is (assumes identical names).
 * If explicit mapping exists for this team, returns the mapped name.
 * Add exceptions to API_SPORTS_TEAM_MAP as discovered during testing.
 *
 * @param oddsApiName - Team name from Odds API
 * @param sportKey - Sport key (e.g., 'americanfootball_nfl')
 * @returns API-Sports team name (same as input unless explicitly mapped)
 */
export function getAPISportsTeamName(oddsApiName: string, sportKey: string): string {
  const sportMap = API_SPORTS_TEAM_MAP[sportKey];
  if (!sportMap) {
    // Unknown sport - return original name
    return oddsApiName;
  }

  // Return mapped name if exists, otherwise return original (assume identical)
  return sportMap[oddsApiName] || oddsApiName;
}
