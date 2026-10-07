// scripts/scrape-matches.mjs
//
// Automated scraper for real-world football match data.
// Fetches match results, half-time scores, shots, shots on target, fouls,
// corners, and cards across major European leagues and seasons.
// Normalizes and saves raw CSV/JSON and clean structured match datasets to data/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const MATCHES_DIR = path.join(DATA_DIR, 'matches');
const CALIB_DIR = path.join(DATA_DIR, 'calibration');

// Ensure directories exist
for (const dir of [DATA_DIR, RAW_DIR, MATCHES_DIR, CALIB_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const SOURCES = [
  // 2023-2024 Season
  {
    name: 'Premier League 2023-2024',
    league: 'Premier League',
    country: 'England',
    season: '2023-2024',
    code: 'E0_2324',
    url: 'https://football-data.co.uk/mmz4281/2324/E0.csv',
  },
  {
    name: 'Championship 2023-2024',
    league: 'Championship',
    country: 'England',
    season: '2023-2024',
    code: 'E1_2324',
    url: 'https://football-data.co.uk/mmz4281/2324/E1.csv',
  },
  {
    name: 'La Liga 2023-2024',
    league: 'La Liga',
    country: 'Spain',
    season: '2023-2024',
    code: 'SP1_2324',
    url: 'https://football-data.co.uk/mmz4281/2324/SP1.csv',
  },
  {
    name: 'Bundesliga 2023-2024',
    league: 'Bundesliga',
    country: 'Germany',
    season: '2023-2024',
    code: 'D1_2324',
    url: 'https://football-data.co.uk/mmz4281/2324/D1.csv',
  },
  {
    name: 'Serie A 2023-2024',
    league: 'Serie A',
    country: 'Italy',
    season: '2023-2024',
    code: 'I1_2324',
    url: 'https://football-data.co.uk/mmz4281/2324/I1.csv',
  },
  {
    name: 'Ligue 1 2023-2024',
    league: 'Ligue 1',
    country: 'France',
    season: '2023-2024',
    code: 'F1_2324',
    url: 'https://football-data.co.uk/mmz4281/2324/F1.csv',
  },

  // 2024-2025 Season
  {
    name: 'Premier League 2024-2025',
    league: 'Premier League',
    country: 'England',
    season: '2024-2025',
    code: 'E0_2425',
    url: 'https://football-data.co.uk/mmz4281/2425/E0.csv',
  },
  {
    name: 'La Liga 2024-2025',
    league: 'La Liga',
    country: 'Spain',
    season: '2024-2025',
    code: 'SP1_2425',
    url: 'https://football-data.co.uk/mmz4281/2425/SP1.csv',
  },
  {
    name: 'Bundesliga 2024-2025',
    league: 'Bundesliga',
    country: 'Germany',
    season: '2024-2025',
    code: 'D1_2425',
    url: 'https://football-data.co.uk/mmz4281/2425/D1.csv',
  },
  {
    name: 'Serie A 2024-2025',
    league: 'Serie A',
    country: 'Italy',
    season: '2024-2025',
    code: 'I1_2425',
    url: 'https://football-data.co.uk/mmz4281/2425/I1.csv',
  },
  {
    name: 'Ligue 1 2024-2025',
    league: 'Ligue 1',
    country: 'France',
    season: '2024-2025',
    code: 'F1_2425',
    url: 'https://football-data.co.uk/mmz4281/2425/F1.csv',
  },
];

const JSON_SOURCES = [
  {
    name: 'OpenFootball Premier League 2023-2024 Fixtures & Scores',
    filename: 'openfootball_premier_league_2023_2024.json',
    url: 'https://raw.githubusercontent.com/openfootball/football.json/master/2023-24/en.1.json',
  },
];

async function fetchWithRetry(url, maxRetries = 3) {
  let lastErr = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'FSPro-MatchDataScraper/1.0 (football-simulation-research)',
          'Accept': 'text/csv, application/json, text/plain, */*',
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length <= 1) continue;

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] !== undefined ? values[j] : '';
    }
    rows.push(row);
  }

  return rows;
}

function toInt(val, fallback = 0) {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

function normalizeMatch(row, source, idx) {
  const home = row['HomeTeam'] || row['Home'] || '';
  const away = row['AwayTeam'] || row['Away'] || '';
  if (!home || !away) return null;

  const fthg = toInt(row['FTHG']);
  const ftag = toInt(row['FTAG']);
  const hthg = toInt(row['HTHG']);
  const htag = toInt(row['HTAG']);

  const hs = toInt(row['HS']);
  const as = toInt(row['AS']);
  const hst = toInt(row['HST']);
  const ast = toInt(row['AST']);
  const hf = toInt(row['HF']);
  const af = toInt(row['AF']);
  const hc = toInt(row['HC']);
  const ac = toInt(row['AC']);
  const hy = toInt(row['HY']);
  const ay = toInt(row['AY']);
  const hr = toInt(row['HR']);
  const ar = toInt(row['AR']);

  let ftr = row['FTR'] || (fthg > ftag ? 'H' : fthg < ftag ? 'A' : 'D');
  let htr = row['HTR'] || (hthg > htag ? 'H' : hthg < htag ? 'A' : 'D');

  const cleanSeason = source.season.replace(/[^0-9]/g, '');
  const slugLeague = source.league.toLowerCase().replace(/\s+/g, '_');
  const matchId = `match_${slugLeague}_${cleanSeason}_${idx + 1}`;

  return {
    id: matchId,
    league: source.league,
    country: source.country,
    season: source.season,
    date: row['Date'] || '',
    time: row['Time'] || '',
    referee: row['Referee'] || null,
    homeTeam: home,
    awayTeam: away,
    score: {
      fullTime: {
        home: fthg,
        away: ftag,
        result: ftr,
        total: fthg + ftag,
      },
      halfTime: {
        home: hthg,
        away: htag,
        result: htr,
        total: hthg + htag,
      },
    },
    stats: {
      shots: { home: hs, away: as, total: hs + as },
      shotsOnTarget: { home: hst, away: ast, total: hst + ast },
      fouls: { home: hf, away: af, total: hf + af },
      corners: { home: hc, away: ac, total: hc + ac },
      yellowCards: { home: hy, away: ay, total: hy + ay },
      redCards: { home: hr, away: ar, total: hr + ar },
    },
  };
}

function computeCalibrationMetrics(allMatches) {
  const count = allMatches.length;
  if (count === 0) return null;

  let totalGoals = 0;
  let homeGoals = 0;
  let awayGoals = 0;
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  let totalShots = 0;
  let homeShots = 0;
  let awayShots = 0;

  let totalShotsOnTarget = 0;
  let homeShotsOnTarget = 0;
  let awayShotsOnTarget = 0;

  let totalFouls = 0;
  let homeFouls = 0;
  let awayFouls = 0;

  let totalCorners = 0;
  let totalYellowCards = 0;
  let totalRedCards = 0;

  let matchesWithShotStats = 0;

  for (const m of allMatches) {
    totalGoals += m.score.fullTime.total;
    homeGoals += m.score.fullTime.home;
    awayGoals += m.score.fullTime.away;

    if (m.score.fullTime.result === 'H') homeWins++;
    else if (m.score.fullTime.result === 'A') awayWins++;
    else draws++;

    if (m.stats.shots.total > 0) {
      matchesWithShotStats++;
      totalShots += m.stats.shots.total;
      homeShots += m.stats.shots.home;
      awayShots += m.stats.shots.away;

      totalShotsOnTarget += m.stats.shotsOnTarget.total;
      homeShotsOnTarget += m.stats.shotsOnTarget.home;
      awayShotsOnTarget += m.stats.shotsOnTarget.away;

      totalFouls += m.stats.fouls.total;
      homeFouls += m.stats.fouls.home;
      awayFouls += m.stats.fouls.away;

      totalCorners += m.stats.corners.total;
      totalYellowCards += m.stats.yellowCards.total;
      totalRedCards += m.stats.redCards.total;
    }
  }

  const sCount = Math.max(matchesWithShotStats, 1);

  return {
    sampleSize: count,
    matchesWithDetailedStats: matchesWithShotStats,
    averages: {
      goalsPerMatch: Number((totalGoals / count).toFixed(2)),
      homeGoalsPerMatch: Number((homeGoals / count).toFixed(2)),
      awayGoalsPerMatch: Number((awayGoals / count).toFixed(2)),
      homeWinRate: Number(((homeWins / count) * 100).toFixed(1)),
      drawRate: Number(((draws / count) * 100).toFixed(1)),
      awayWinRate: Number(((awayWins / count) * 100).toFixed(1)),
      shotsPerMatch: Number((totalShots / sCount).toFixed(2)),
      shotsOnTargetPerMatch: Number((totalShotsOnTarget / sCount).toFixed(2)),
      shotAccuracyPercent: Number(((totalShotsOnTarget / Math.max(totalShots, 1)) * 100).toFixed(1)),
      foulsPerMatch: Number((totalFouls / sCount).toFixed(2)),
      cornersPerMatch: Number((totalCorners / sCount).toFixed(2)),
      yellowCardsPerMatch: Number((totalYellowCards / sCount).toFixed(2)),
      redCardsPerMatch: Number((totalRedCards / sCount).toFixed(2)),
    },
    referenceRealismRanges: {
      goalsPerMatch: [2.0, 3.2],
      shotsPerMatch: [18.0, 30.0],
      shotsOnTargetPerMatch: [6.0, 12.0],
      shotAccuracyPercent: [30.0, 45.0],
      foulsPerMatch: [18.0, 28.0],
      yellowCardsPerMatch: [3.0, 5.0],
      redCardsPerMatch: [0.1, 0.3],
    },
  };
}

async function main() {
  console.log('====================================================');
  console.log('       FSPro Real-World Football Data Scraper       ');
  console.log('====================================================');
  console.log(`Target directory: ${DATA_DIR}\n`);

  const allCombinedMatches = [];
  const manifest = {
    scrapedAt: new Date().toISOString(),
    datasets: [],
  };

  // 1. Scrape CSV sources
  for (const src of SOURCES) {
    process.stdout.write(`Fetching ${src.name}... `);
    try {
      const csvText = await fetchWithRetry(src.url);
      const rawFileName = `${src.code}.csv`;
      const rawFilePath = path.join(RAW_DIR, rawFileName);
      fs.writeFileSync(rawFilePath, csvText, 'utf-8');

      const rawRows = parseCSV(csvText);
      const normalized = rawRows
        .map((r, i) => normalizeMatch(r, src, i))
        .filter((m) => m !== null);

      const jsonFileName = `${src.code}.json`;
      const jsonFilePath = path.join(MATCHES_DIR, jsonFileName);
      fs.writeFileSync(jsonFilePath, JSON.stringify(normalized, null, 2), 'utf-8');

      allCombinedMatches.push(...normalized);

      manifest.datasets.push({
        name: src.name,
        league: src.league,
        season: src.season,
        matchCount: normalized.length,
        rawCsv: path.relative(DATA_DIR, rawFilePath).replace(/\\/g, '/'),
        json: path.relative(DATA_DIR, jsonFilePath).replace(/\\/g, '/'),
      });

      console.log(`[OK] (${normalized.length} matches)`);
    } catch (err) {
      console.log(`[FAILED: ${err.message}]`);
    }
  }

  // 2. Scrape JSON sources (OpenFootball)
  for (const src of JSON_SOURCES) {
    process.stdout.write(`Fetching ${src.name}... `);
    try {
      const jsonText = await fetchWithRetry(src.url);
      const filePath = path.join(RAW_DIR, src.filename);
      fs.writeFileSync(filePath, jsonText, 'utf-8');
      const parsed = JSON.parse(jsonText);
      const matchesCount = parsed.matches?.length || 0;
      console.log(`[OK] (${matchesCount} fixtures)`);
    } catch (err) {
      console.log(`[FAILED: ${err.message}]`);
    }
  }

  // 3. Save combined matches file
  const combinedPath = path.join(MATCHES_DIR, 'all_matches_combined.json');
  fs.writeFileSync(combinedPath, JSON.stringify(allCombinedMatches, null, 2), 'utf-8');

  // 4. Compute and save calibration benchmarks
  const calibMetrics = computeCalibrationMetrics(allCombinedMatches);
  const calibPath = path.join(CALIB_DIR, 'real_world_benchmarks.json');
  fs.writeFileSync(calibPath, JSON.stringify(calibMetrics, null, 2), 'utf-8');

  // 5. Save manifest
  manifest.totalMatches = allCombinedMatches.length;
  manifest.calibrationSummary = calibMetrics?.averages || null;
  fs.writeFileSync(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('\n====================================================');
  console.log(` Scraping Complete!`);
  console.log(` Total Matches Scraped:   ${allCombinedMatches.length}`);
  console.log(` Datasets Created:        ${manifest.datasets.length}`);
  if (calibMetrics) {
    console.log(` Real-World Calibration:`);
    console.log(`   Goals / match:         ${calibMetrics.averages.goalsPerMatch}`);
    console.log(`   Home / Draw / Away %:  ${calibMetrics.averages.homeWinRate}% / ${calibMetrics.averages.drawRate}% / ${calibMetrics.averages.awayWinRate}%`);
    console.log(`   Shots / match:         ${calibMetrics.averages.shotsPerMatch}`);
    console.log(`   Shots on Target / m:   ${calibMetrics.averages.shotsOnTargetPerMatch}`);
    console.log(`   Fouls / match:         ${calibMetrics.averages.foulsPerMatch}`);
    console.log(`   Yellow Cards / match:  ${calibMetrics.averages.yellowCardsPerMatch}`);
  }
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Fatal error during scrape:', err);
  process.exit(1);
});
