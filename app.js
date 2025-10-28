// Raw data storage - will be loaded from APIs
let stockData = []; // Contains: date, sp500, cape, dividend, earnings, cpi
let homeData = [];  // Contains: date, realPrice, buildingCost
let goldData = [];  // Contains: date, price
let btcData = [];   // Contains: date, price
let stats = null;
let historicalEvents = [];
let currentChart = null;

// Base CPI for inflation calculations (will be set to latest CPI)
let baseCPI = null;

// Custom assets from Polygon.io (cached)
let customAssets = {}; // Format: { 'TICKER': { name: 'Name', color: '#color', data: [{date, price}] } }

// Asset metadata - defines what data is available
const assetMetadata = {
    'cape': {
        name: 'CAPE Ratio',
        code: 'cape',
        description: 'Cyclically Adjusted Price-to-Earnings ratio',
        keywords: ['cape', 'shiller', 'pe', 'ratio'],
        color: '#667eea',
        dataFields: {
            'real': null, // CAPE doesn't have real/nominal distinction
            'nominal': null,
            'raw': 'cape'
        }
    },
    'home': {
        name: 'Home Price Index',
        code: 'home',
        description: 'US Real Home Price Index',
        keywords: ['home', 'house', 'housing', 'real estate', 'property'],
        color: '#28a745',
        dataFields: {
            'real': 'homePriceReal',
            'nominal': 'homePriceNominal',
            'raw': 'homePriceReal'
        }
    },
    'sp500': {
        name: 'S&P 500',
        code: 'sp500',
        description: 'S&P 500 Stock Market Index',
        keywords: ['sp500', 's&p', 'spy', 'stock', 'market', 'index'],
        color: '#dc3545',
        dataFields: {
            'real': 'sp500Real',
            'nominal': 'sp500Nominal',
            'raw': 'sp500Real'
        }
    },
    'gold': {
        name: 'Gold',
        code: 'gold',
        description: 'Gold Price per Ounce',
        keywords: ['gold', 'gld', 'precious', 'metal'],
        color: '#ffc107',
        dataFields: {
            'real': 'goldReal',
            'nominal': 'goldNominal',
            'raw': 'goldReal'
        }
    },
    'btc': {
        name: 'Bitcoin',
        code: 'btc',
        description: 'Bitcoin (BTC) Price',
        keywords: ['btc', 'bitcoin', 'crypto', 'cryptocurrency'],
        color: '#f7931a',
        dataFields: {
            'real': 'btcReal',
            'nominal': 'btcNominal',
            'raw': 'btcNominal'
        }
    }
};

// Get the appropriate data array for an asset
function getDataArrayForAsset(asset) {
    // Map assets to their raw data sources
    if (asset === 'cape' || asset === 'sp500') return stockData;
    if (asset === 'home') return homeData;
    if (asset === 'gold') return goldData;
    if (asset === 'btc') return btcData;

    // Check if it's a custom asset (ticker symbol)
    if (customAssets[asset] && customAssets[asset].data) {
        return customAssets[asset].data;
    }

    return null;
}

// Get CPI for a date (nearest match from stock data)
function getCPIForDate(targetDate) {
    if (stockData.length === 0) return baseCPI;

    const target = new Date(targetDate);
    let closest = stockData[0];
    let minDiff = Math.abs(target - new Date(stockData[0].date));

    for (const stock of stockData) {
        const diff = Math.abs(target - new Date(stock.date));
        if (diff < minDiff) {
            minDiff = diff;
            closest = stock;
        }
    }

    return closest.cpi || baseCPI;
}

// Get value from data point for a specific asset and mode
function getAssetValue(dataPoint, asset, mode) {
    const metadata = assetMetadata[asset];
    const isCustomAsset = !metadata && customAssets[asset];

    if (!metadata && !isCustomAsset) return null;

    // Get the raw value for the asset
    let assetValue;

    if (asset === 'cape') {
        assetValue = dataPoint.cape || 0;
    } else if (asset === 'home') {
        assetValue = dataPoint.realPrice || 0; // Home data is already real
    } else if (asset === 'sp500') {
        assetValue = dataPoint.sp500 || 0; // Stock data is real
    } else if (asset === 'gold') {
        // For gold data points, the price is already there
        const goldPrice = dataPoint.price || 0;
        if (!goldPrice) return null;

        if (mode === 'nominal') {
            assetValue = goldPrice;
        } else {
            // Convert to real using CPI
            const cpi = getCPIForDate(dataPoint.date);
            assetValue = goldPrice * (baseCPI / cpi);
        }
    } else if (asset === 'btc') {
        // For Bitcoin data points, the price is nominal
        const btcPrice = dataPoint.price || 0;
        if (!btcPrice) return null;

        if (mode === 'nominal') {
            assetValue = btcPrice;
        } else {
            // Convert to real using CPI
            const cpi = getCPIForDate(dataPoint.date);
            assetValue = btcPrice * (baseCPI / cpi);
        }
    } else if (isCustomAsset) {
        // For custom assets from Polygon.io, the price is nominal
        const price = dataPoint.price || 0;
        if (!price) return null;

        if (mode === 'nominal') {
            assetValue = price;
        } else {
            // Convert to real using CPI
            const cpi = getCPIForDate(dataPoint.date);
            assetValue = price * (baseCPI / cpi);
        }
    }

    // Now handle the mode/denominator
    if (mode === 'real') {
        return assetValue;
    } else if (mode === 'nominal') {
        // Convert real to nominal using CPI
        if (asset === 'gold' || asset === 'btc') {
            return assetValue; // Already handled above
        }
        const cpi = dataPoint.cpi || getCPIForDate(dataPoint.date);
        return assetValue * (cpi / baseCPI);
    } else {
        // Asset-denominated mode (e.g., home/gold, sp500/gold)
        // Need to look up the denominator value from its own data source for this date
        let denominatorValue;

        if (mode === 'gold') {
            const goldPrice = getGoldPriceForDate(dataPoint.date);
            if (!goldPrice) return null;
            // Convert to real gold price
            const cpi = getCPIForDate(dataPoint.date);
            denominatorValue = goldPrice * (baseCPI / cpi);
        } else if (mode === 'btc') {
            const btcPrice = getBitcoinPriceForDate(dataPoint.date);
            if (!btcPrice) return null;
            // Convert to real Bitcoin price
            const cpi = getCPIForDate(dataPoint.date);
            denominatorValue = btcPrice * (baseCPI / cpi);
        } else if (mode === 'home') {
            const homePrice = getHomePriceForDate(dataPoint.date);
            if (!homePrice) return null;
            denominatorValue = homePrice; // Already real
        } else if (mode === 'sp500') {
            const sp500Price = getSP500ForDate(dataPoint.date);
            if (!sp500Price) return null;
            denominatorValue = sp500Price; // Already real
        } else if (mode === 'cape') {
            const capeValue = getCapeForDate(dataPoint.date);
            if (!capeValue) return null;
            denominatorValue = capeValue;
        } else if (customAssets[mode]) {
            // Custom asset as denominator
            const customPrice = getCustomAssetPriceForDate(mode, dataPoint.date);
            if (!customPrice) return null;
            // Convert to real price
            const cpi = getCPIForDate(dataPoint.date);
            denominatorValue = customPrice * (baseCPI / cpi);
        } else {
            return null;
        }

        if (!denominatorValue || denominatorValue === 0) return null;
        return assetValue / denominatorValue;
    }
}

// Get gold price for a specific date (nearest match)
function getGoldPriceForDate(targetDate) {
    if (goldData.length === 0) return null;

    const target = new Date(targetDate);
    let closest = goldData[0];
    let minDiff = Math.abs(target - new Date(goldData[0].date));

    for (const gold of goldData) {
        const diff = Math.abs(target - new Date(gold.date));
        if (diff < minDiff) {
            minDiff = diff;
            closest = gold;
        }
    }

    return closest.price;
}

// Get home price for a specific date (nearest match)
function getHomePriceForDate(targetDate) {
    if (homeData.length === 0) return null;

    const target = new Date(targetDate);
    let closest = homeData[0];
    let minDiff = Math.abs(target - new Date(homeData[0].date));

    for (const home of homeData) {
        const diff = Math.abs(target - new Date(home.date));
        if (diff < minDiff) {
            minDiff = diff;
            closest = home;
        }
    }

    return closest.realPrice;
}

// Get S&P 500 for a specific date (nearest match)
function getSP500ForDate(targetDate) {
    if (stockData.length === 0) return null;

    const target = new Date(targetDate);
    let closest = stockData[0];
    let minDiff = Math.abs(target - new Date(stockData[0].date));

    for (const stock of stockData) {
        const diff = Math.abs(target - new Date(stock.date));
        if (diff < minDiff) {
            minDiff = diff;
            closest = stock;
        }
    }

    return closest.sp500;
}

// Get Bitcoin price for a specific date (nearest match)
function getBitcoinPriceForDate(targetDate) {
    if (btcData.length === 0) return null;

    const target = new Date(targetDate);
    const firstBtcDate = new Date(btcData[0].date);

    // Bitcoin didn't exist before 2009, so return null for dates before our data starts
    // Allow some tolerance (30 days) for data alignment
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (target < (firstBtcDate.getTime() - thirtyDays)) {
        return null;
    }

    let closest = btcData[0];
    let minDiff = Math.abs(target - new Date(btcData[0].date));

    for (const btc of btcData) {
        const diff = Math.abs(target - new Date(btc.date));
        if (diff < minDiff) {
            minDiff = diff;
            closest = btc;
        }
    }

    return closest.price;
}

// Get CAPE for a specific date (nearest match)
function getCapeForDate(targetDate) {
    if (stockData.length === 0) return null;

    const target = new Date(targetDate);
    let closest = stockData[0];
    let minDiff = Math.abs(target - new Date(stockData[0].date));

    for (const stock of stockData) {
        const diff = Math.abs(target - new Date(stock.date));
        if (diff < minDiff) {
            minDiff = diff;
            closest = stock;
        }
    }

    return closest.cape;
}

// Fetch data from Polygon.io for a custom ticker
async function fetchPolygonData(ticker) {
    // Check cache first
    if (customAssets[ticker]) {
        console.log(`Using cached data for ${ticker}`);
        return customAssets[ticker];
    }

    const apiKey = getStoredApiKey();
    if (!apiKey) {
        throw new Error('No API key configured. Click the ⚙️ Settings button to set up your free Polygon.io API key.');
    }

    try {
        console.log(`Fetching data for ${ticker} from Polygon.io...`);

        // Get historical data - Free tier only has 2 years of history
        // Use 2 years to ensure free tier compatibility
        const endDate = new Date().toISOString().split('T')[0];
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const startDate = twoYearsAgo.toISOString().split('T')[0];

        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new Error('Invalid API key. Please check your settings.');
            } else if (response.status === 404) {
                throw new Error(`Ticker ${ticker} not found. Make sure the symbol is correct.`);
            } else {
                throw new Error(`Polygon API returned ${response.status}. ${response.statusText}`);
            }
        }

        const json = await response.json();

        if (!json.results || json.results.length === 0) {
            throw new Error(`No data found for ticker ${ticker}. Make sure the ticker symbol is correct.`);
        }

        const results = json.results;
        const timestamps = results.map(r => r.t);
        const prices = results.map(r => r.c); // Close prices

        if (!timestamps || !prices) {
            throw new Error(`Invalid data structure for ${ticker}`);
        }

        // Convert to our format
        // Polygon.io timestamps are in milliseconds, not seconds
        const data = [];
        for (let i = 0; i < timestamps.length; i++) {
            if (prices[i] !== null && !isNaN(prices[i])) {
                data.push({
                    date: new Date(timestamps[i]),
                    price: parseFloat(prices[i])
                });
            }
        }

        if (data.length === 0) {
            throw new Error(`No valid price data for ${ticker}`);
        }

        // Generate a random color for this asset
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
        const color = colors[Object.keys(customAssets).length % colors.length];

        // Cache the data
        customAssets[ticker] = {
            name: ticker.toUpperCase(),
            longName: ticker.toUpperCase(),
            color: color,
            data: data
        };

        console.log(`✓ Fetched ${data.length} data points for ${ticker} (${data[0].date.getFullYear()}-${data[data.length-1].date.getFullYear()})`);

        return customAssets[ticker];

    } catch (error) {
        console.error(`Error fetching ${ticker}:`, error);
        throw error;
    }
}

// Get custom asset price for a specific date (nearest match)
function getCustomAssetPriceForDate(ticker, targetDate) {
    if (!customAssets[ticker] || !customAssets[ticker].data) return null;

    const data = customAssets[ticker].data;
    const target = new Date(targetDate);
    const firstDate = new Date(data[0].date);

    // Custom assets have limited date ranges (2 years for Polygon free tier)
    // Return null for dates significantly before the data starts
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (target < (firstDate.getTime() - thirtyDays)) {
        return null;
    }

    let closest = data[0];
    let minDiff = Math.abs(target - new Date(data[0].date));

    for (const item of data) {
        const diff = Math.abs(target - new Date(item.date));
        if (diff < minDiff) {
            minDiff = diff;
            closest = item;
        }
    }

    return closest.price;
}

// Search for assets (built-in + custom tickers)
function searchAssets(query, isDenominator = false) {
    const results = [];
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) {
        // For denominator, include real/nominal options
        if (isDenominator) {
            results.push({
                code: 'real',
                name: 'Real USD',
                description: 'Inflation-Adjusted USD',
                type: 'builtin'
            });
            results.push({
                code: 'nominal',
                name: 'Nominal USD',
                description: 'Current USD (not adjusted)',
                type: 'builtin'
            });
        }

        // Return all built-in assets if no query
        for (const [code, meta] of Object.entries(assetMetadata)) {
            results.push({
                code: code,
                name: meta.name,
                description: meta.description,
                type: 'builtin'
            });
        }
        return results;
    }

    // For denominator, search real/nominal first
    if (isDenominator) {
        if ('real'.includes(lowerQuery) || 'inflation'.includes(lowerQuery) || 'adjusted'.includes(lowerQuery)) {
            results.push({
                code: 'real',
                name: 'Real USD',
                description: 'Inflation-Adjusted USD',
                type: 'builtin'
            });
        }
        if ('nominal'.includes(lowerQuery) || 'current'.includes(lowerQuery) || 'usd'.includes(lowerQuery)) {
            results.push({
                code: 'nominal',
                name: 'Nominal USD',
                description: 'Current USD (not adjusted)',
                type: 'builtin'
            });
        }
    }

    // Search built-in assets
    for (const [code, meta] of Object.entries(assetMetadata)) {
        const matches =
            meta.name.toLowerCase().includes(lowerQuery) ||
            code.toLowerCase().includes(lowerQuery) ||
            meta.keywords.some(kw => kw.includes(lowerQuery));

        if (matches) {
            results.push({
                code: code,
                name: meta.name,
                description: meta.description,
                type: 'builtin'
            });
        }
    }

    // Search custom assets
    for (const [ticker, asset] of Object.entries(customAssets)) {
        const matches =
            ticker.toLowerCase().includes(lowerQuery) ||
            asset.name.toLowerCase().includes(lowerQuery) ||
            (asset.longName && asset.longName.toLowerCase().includes(lowerQuery));

        if (matches) {
            results.push({
                code: ticker,
                name: asset.longName || asset.name,
                description: `Custom asset from Polygon.io`,
                type: 'custom'
            });
        }
    }

    // If query looks like a ticker (short uppercase), suggest it as a custom search
    if (lowerQuery.length >= 1 && lowerQuery.length <= 10 && results.length < 5) {
        results.push({
            code: lowerQuery.toUpperCase(),
            name: `Search Polygon.io for "${lowerQuery.toUpperCase()}"`,
            description: 'Fetch data from Polygon.io',
            type: 'search'
        });
    }

    return results;
}

// Display asset suggestions in dropdown
function displayAssetSuggestions(suggestionsDiv, results, inputElement) {
    if (results.length === 0) {
        suggestionsDiv.style.display = 'none';
        return;
    }

    suggestionsDiv.innerHTML = '';
    suggestionsDiv.style.display = 'block';

    results.forEach(result => {
        const div = document.createElement('div');
        div.className = 'asset-suggestion';
        div.innerHTML = `
            <div class="suggestion-name">${result.name}<span class="suggestion-code">${result.code.toUpperCase()}</span></div>
            <div class="suggestion-desc">${result.description}</div>
        `;

        div.addEventListener('click', async function(e) {
            e.stopPropagation();

            if (result.type === 'search') {
                // Fetch from Polygon.io
                try {
                    showLoading();
                    await fetchPolygonData(result.code);
                    inputElement.value = customAssets[result.code].longName || result.code;
                    inputElement.dataset.asset = result.code;

                    // Auto-switch denominator to Real USD for custom tickers
                    const denominatorInput = document.getElementById('denominator1');
                    if (denominatorInput && !inputElement.id.includes('denominator')) {
                        denominatorInput.value = 'Real USD (Inflation-Adjusted)';
                        denominatorInput.dataset.asset = 'real';
                    }

                    hideLoading();
                    suggestionsDiv.style.display = 'none';
                    updateChartAndCalculator();
                } catch (error) {
                    hideLoading();
                    alert(`Failed to fetch data for ${result.code}: ${error.message}\n\nPlease check the ticker symbol and try again.`);
                }
            } else {
                // Built-in or already-cached custom asset
                inputElement.value = result.name;
                inputElement.dataset.asset = result.code;
                suggestionsDiv.style.display = 'none';
                updateChartAndCalculator();
            }
        });

        suggestionsDiv.appendChild(div);
    });
}

// Event dates for period selection
const eventDates = {
    '1929-crash': new Date(1929, 9, 1),
    'gold-standard': new Date(1933, 2, 1),
    'oil-crisis': new Date(1973, 0, 1),
    '1987-crash': new Date(1987, 9, 1),
    'dotcom': new Date(2000, 2, 1),
    'housing-crisis': new Date(2007, 9, 1),
    'covid': new Date(2020, 2, 1)
};

// Initialize the application
async function init() {
    try {
        showLoading();
        await loadDataFromAPIs();

        updateStats();
        loadConfigFromURL(); // Load config from URL if present
        updateChartAndCalculator();
        setupEventListeners();
        hideLoading();
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to load data. Please refresh the page.');
    }
}

// Update chart based on current configuration
function updateChartAndCalculator() {
    const compareMode = document.getElementById('compareMode').checked;

    if (compareMode) {
        createComparisonChart();
    } else {
        const asset = document.getElementById('asset1').dataset.asset;
        const denominator = document.getElementById('denominator1').dataset.asset;

        if (!asset || !denominator) {
            console.log('Waiting for asset selection...');
            return;
        }

        createSingleAssetChart(asset, denominator);

        // Auto-calculate if investment amount is present
        autoCalculateReturn();
    }

    // Update URL to reflect current configuration
    updateURL();
}

// Load configuration from URL parameters
function loadConfigFromURL() {
    const params = new URLSearchParams(window.location.search);

    // Load date range
    const dateRange = params.get('range');
    if (dateRange) {
        document.getElementById('dateRange').value = dateRange;
    }

    const startYear = params.get('start');
    const endYear = params.get('end');
    if (startYear && endYear) {
        document.getElementById('dateRange').value = 'custom';
        document.getElementById('startYear').value = startYear;
        document.getElementById('endYear').value = endYear;
        document.getElementById('customRange').style.display = 'flex';
    }

    const eventPeriod = params.get('event');
    const eventYears = params.get('eventYears');
    if (eventPeriod) {
        document.getElementById('dateRange').value = 'event';
        document.getElementById('eventPeriod').value = eventPeriod;
        if (eventYears) {
            document.getElementById('eventYears').value = eventYears;
        }
        document.getElementById('eventRange').style.display = 'flex';
    }

    // Check if compare mode
    const compare = params.get('compare');
    if (compare === 'true') {
        document.getElementById('compareMode').checked = true;
        document.getElementById('singleAssetConfig').style.display = 'none';
        document.getElementById('compareConfig').style.display = 'block';

        // Load shared denominator
        const denominator = params.get('denom') || 'gold';
        document.getElementById('compareDenominator').value = denominator;

        // Load comparison assets
        const assets = params.getAll('asset');

        if (assets.length > 0) {
            const container = document.getElementById('compareAssets');
            container.innerHTML = ''; // Clear default rows

            for (let i = 0; i < assets.length; i++) {
                const asset = assets[i];
                const assetName = getAssetName(asset);

                const newRow = document.createElement('div');
                newRow.className = 'compare-row';
                newRow.setAttribute('data-index', i);
                newRow.innerHTML = `
                    <div class="control-group asset-search-group">
                        <label>Asset ${i + 1}:</label>
                        <div class="asset-search-container">
                            <input type="text" class="asset-search" placeholder="Search: home, gold, spy, btc-usd..." data-asset="${asset}" value="${assetName}">
                            <div class="asset-suggestions" style="display: none;"></div>
                        </div>
                    </div>
                    ${i > 0 ? '<button class="remove-button" onclick="this.parentElement.remove(); document.dispatchEvent(new Event(\'compareChanged\'));">✕</button>' : ''}
                `;
                container.appendChild(newRow);
            }
        }
    } else {
        // Single asset mode
        const asset = params.get('asset');
        const denominator = params.get('denom');
        const amount = params.get('amount');

        if (asset) {
            document.getElementById('asset1').value = asset;
        }
        if (denominator) {
            document.getElementById('denominator1').value = denominator;
        }
        if (amount) {
            document.getElementById('investmentAmount').value = amount;
        }
    }
}

// Update URL with current configuration
function updateURL() {
    const params = new URLSearchParams();

    // Add date range
    const dateRange = document.getElementById('dateRange').value;
    if (dateRange !== 'modern') { // Modern is the default
        params.set('range', dateRange);

        if (dateRange === 'custom') {
            const startYear = document.getElementById('startYear').value;
            const endYear = document.getElementById('endYear').value;
            if (startYear) params.set('start', startYear);
            if (endYear) params.set('end', endYear);
        }
    }

    // Check mode
    const compareMode = document.getElementById('compareMode').checked;

    if (compareMode) {
        params.set('compare', 'true');

        // Add shared denominator
        const denominator = document.getElementById('compareDenominator').value;
        params.set('denom', denominator);

        // Add all comparison assets
        const compareRows = document.querySelectorAll('.compare-row');
        compareRows.forEach(row => {
            const assetInput = row.querySelector('.asset-search');
            if (assetInput && assetInput.value) {
                params.append('asset', assetInput.value);
            }
        });
    } else {
        // Single asset mode
        const asset = document.getElementById('asset1').dataset.asset;
        const denominator = document.getElementById('denominator1').dataset.asset;
        const amount = document.getElementById('investmentAmount').value;

        params.set('asset', asset);
        params.set('denom', denominator);
        if (amount) {
            params.set('amount', amount);
        }
    }

    // Update URL without reloading page
    const newURL = window.location.pathname + '?' + params.toString();
    window.history.replaceState({}, '', newURL);
}

// Historical events configuration
const HISTORICAL_EVENTS = [
    { date: '1929-10-01', label: '1929 Crash', color: '#dc3545' },
    { date: '1933-03-01', label: 'Gold Standard Abandoned', color: '#ffc107' },
    { date: '1973-01-01', label: '1973 Oil Crisis', color: '#fd7e14' },
    { date: '1987-10-01', label: '1987 Crash', color: '#dc3545' },
    { date: '2000-03-01', label: 'Dot-com Bubble Peak', color: '#dc3545' },
    { date: '2007-10-01', label: '2007 Housing Bubble Peak', color: '#dc3545' },
    { date: '2008-09-01', label: '2008 Financial Crisis', color: '#dc3545' },
    { date: '2020-03-01', label: 'COVID-19 Crash', color: '#dc3545' },
];

// Parse Shiller date format (YYYY.MM)
function parseShillerDate(dateStr) {
    const parts = dateStr.toString().split('.');
    const year = parseInt(parts[0]);
    const month = parts[1] ? parseInt(parts[1]) - 1 : 0;
    return new Date(year, month, 1);
}

// Load data directly from APIs
async function loadDataFromAPIs() {
    try {
        console.log('Fetching data from APIs...');

        // Fetch all data sources in parallel
        const [stockResponse, homeResponse, goldResponse, btcResponse] = await Promise.all([
            fetch('https://posix4e.github.io/shiller_wrapper_data/data/stock_market_data.json'),
            fetch('https://posix4e.github.io/shiller_wrapper_data/data/home_price_data.json'),
            fetch('https://freegoldapi.com/data/latest.csv'),
            fetch('https://dailysatprice.com/data/latest.csv')
        ]);

        // Process stock data
        let stockJson = await stockResponse.json();
        if (!Array.isArray(stockJson)) {
            stockJson = stockJson.data || Object.values(stockJson);
        }

        stockData = stockJson
            .filter(item => item && (item.date || item.Date))
            .map(item => ({
                date: parseShillerDate(item.date || item.Date),
                sp500: parseFloat(item.sp500 || item.P || item['S&P 500']),
                cape: parseFloat(item.cape || item['CAPE Ratio']) || 0,
                dividend: parseFloat(item.dividend || item.D || item['Dividend']),
                earnings: parseFloat(item.earnings || item.E || item['Earnings']),
                cpi: parseFloat(item.cpi || item['CPI'])
            }))
            .filter(item => !isNaN(item.date.getTime()) && !isNaN(item.sp500) && item.sp500 > 0)
            .sort((a, b) => a.date - b.date);

        // Set base CPI from latest data point
        baseCPI = stockData[stockData.length - 1].cpi;

        // Process home data
        let homeParsed = await homeResponse.json();
        let homeJson = homeParsed.data || homeParsed;
        if (!Array.isArray(homeJson)) {
            homeJson = Object.values(homeJson);
        }

        homeData = homeJson
            .filter(item => item && item['Unnamed: 0'] && typeof item['Unnamed: 0'] === 'number')
            .map(item => ({
                date: new Date(item['Unnamed: 0'], 0, 1),
                realPrice: parseFloat(item['Real']),
                buildingCost: parseFloat(item['Real.1'])
            }))
            .filter(item => !isNaN(item.date.getTime()) && !isNaN(item.realPrice) && item.realPrice > 0)
            .sort((a, b) => a.date - b.date);

        // Process gold data
        const goldCsv = await goldResponse.text();
        const lines = goldCsv.trim().split('\n');

        goldData = lines
            .slice(1) // Skip header
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split(',');
                const date = new Date(parts[0].trim());
                const price = parseFloat(parts[1]);
                return { date, price };
            })
            .filter(item => !isNaN(item.date.getTime()) && !isNaN(item.price) && item.price > 0)
            .sort((a, b) => a.date - b.date);

        // Process Bitcoin data
        const btcCsv = await btcResponse.text();
        const btcLines = btcCsv.trim().split('\n');

        btcData = btcLines
            .slice(1) // Skip header
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split(',');
                const date = new Date(parts[0].trim());
                const price = parseFloat(parts[1]);
                return { date, price };
            })
            .filter(item => !isNaN(item.date.getTime()) && !isNaN(item.price) && item.price > 0)
            .sort((a, b) => a.date - b.date);

        // Set historical events
        historicalEvents = HISTORICAL_EVENTS;

        // Compute basic stats
        const latestStock = stockData[stockData.length - 1];
        const latestGoldNominal = goldData[goldData.length - 1].price;
        const latestGoldReal = latestGoldNominal * (baseCPI / latestStock.cpi);
        const currentRatio = latestStock.cape / latestGoldReal;

        // Calculate historical percentile
        const historicalRatios = stockData
            .map(stock => {
                const goldPrice = getGoldPriceForDate(stock.date);
                if (!goldPrice) return null;
                const goldReal = goldPrice * (baseCPI / stock.cpi);
                return stock.cape / goldReal;
            })
            .filter(r => r !== null && !isNaN(r))
            .sort((a, b) => a - b);

        const percentile = (historicalRatios.filter(r => r < currentRatio).length / historicalRatios.length * 100);

        stats = {
            currentCAPE: latestStock.cape,
            currentGold: latestGoldReal,
            currentRatio: currentRatio,
            percentile: percentile,
            lastUpdated: new Date().toISOString(),
            dataPoints: {
                stock: stockData.length,
                home: homeData.length,
                gold: goldData.length,
                btc: btcData.length
            }
        };

        console.log('✓ Data loaded from APIs:');
        console.log(`  - Stock data: ${stockData.length} points (${stockData[0].date.getFullYear()}-${stockData[stockData.length-1].date.getFullYear()})`);
        console.log(`  - Home data: ${homeData.length} points (${homeData[0].date.getFullYear()}-${homeData[homeData.length-1].date.getFullYear()})`);
        console.log(`  - Gold data: ${goldData.length} points (${goldData[0].date.getFullYear()}-${goldData[goldData.length-1].date.getFullYear()})`);
        console.log(`  - Bitcoin data: ${btcData.length} points (${btcData[0].date.getFullYear()}-${btcData[btcData.length-1].date.getFullYear()})`);
        console.log(`  - Base CPI: ${baseCPI.toFixed(2)}`);

    } catch (error) {
        console.error('Error loading data from APIs:', error);
        throw error;
    }
}

// Create a chart for a single asset/denominator combination
function createSingleAssetChart(asset, denominator) {
    const dataset = createDataset(asset, denominator);
    if (!dataset) return;

    // Check for error
    if (dataset.error) {
        showChartError(dataset.error);
        return;
    }

    const title = getChartTitle(asset, denominator);
    createChart([dataset], title);
}

// Create a comparison chart with multiple assets
function createComparisonChart() {
    const compareRows = document.querySelectorAll('.compare-row');
    const denominator = document.getElementById('compareDenominator').value;
    const datasets = [];
    const errors = [];

    compareRows.forEach(row => {
        const searchInput = row.querySelector('.asset-search');
        const asset = searchInput?.dataset.asset;

        if (!asset) {
            errors.push('Please select an asset');
            return;
        }

        const dataset = createDataset(asset, denominator);
        if (dataset) {
            if (dataset.error) {
                errors.push(dataset.error);
            } else {
                datasets.push(dataset);
            }
        }
    });

    // If all datasets have errors, show error message
    if (datasets.length === 0) {
        const errorMsg = errors.length > 0 ? errors.join('\n\n---\n\n') : 'No valid datasets to display';
        showChartError(errorMsg);
        return;
    }

    const denominatorName = assetMetadata[denominator]?.name ||
                           (denominator === 'real' ? 'Real USD' : 'Nominal USD');
    const title = `Asset Comparison (valued in ${denominatorName})`;
    createChart(datasets, title);
}

// Create a dataset for asset/denominator combination
function createDataset(asset, denominator) {
    const dateRange = getDateRange();
    const dataArray = getDataArrayForAsset(asset);

    if (!dataArray) {
        console.error(`No data array found for asset: ${asset}`);
        return { error: `No data available for ${assetMetadata[asset]?.name || asset}` };
    }

    const filtered = filterByDateRange(dataArray, dateRange);
    const data = [];

    for (const item of filtered) {
        const value = getAssetValue(item, asset, denominator);
        if (value !== null) {
            data.push({
                x: item.date,
                y: value
            });
        }
    }

    if (data.length === 0) {
        const assetName = assetMetadata[asset]?.name || asset;
        const denomName = assetMetadata[denominator]?.name ||
                         (denominator === 'real' ? 'Real USD' : 'Nominal USD');
        const dateRangeStr = `${dateRange.start.getFullYear()}-${dateRange.end.getFullYear()}`;

        console.error(`No valid data points for ${asset}/${denominator}`);
        return {
            error: `No data available for ${assetName} valued in ${denomName} for ${dateRangeStr}.\n\nTry:\n• Selecting a different date range\n• Choosing different assets\n• Modern History (1871+) for most comparisons`
        };
    }

    const metadata = assetMetadata[asset] || customAssets[asset];
    const label = getDatasetLabel(asset, denominator);

    // Get color from metadata or custom asset
    const color = metadata?.color || '#888888';

    return {
        label: label,
        data: data,
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    };
}

// Generic chart creation function
function createChart(datasets, title) {
    const canvas = document.getElementById('main-chart');

    if (!canvas) {
        console.error('Canvas not found: main-chart');
        return;
    }

    // Destroy existing chart if it exists
    if (currentChart) {
        currentChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    const annotations = createAnnotations();

    try {
        // Check if mobile device
        const isMobile = window.innerWidth < 768;

        currentChart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: isMobile ? 'nearest' : 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        font: {
                            size: isMobile ? 14 : 18,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: datasets.length > 1,
                        position: 'top',
                        labels: {
                            font: {
                                size: isMobile ? 10 : 12
                            },
                            boxWidth: isMobile ? 20 : 40,
                            padding: isMobile ? 10 : 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                label += context.parsed.y.toFixed(4);
                                return label;
                            }
                        }
                    },
                    annotation: {
                        annotations: annotations
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'year',
                            displayFormats: {
                                year: 'yyyy'
                            }
                        },
                        title: {
                            display: !isMobile,
                            text: 'Year'
                        },
                        ticks: {
                            font: {
                                size: isMobile ? 10 : 12
                            },
                            maxRotation: isMobile ? 45 : 0,
                            minRotation: isMobile ? 45 : 0
                        }
                    },
                    y: {
                        beginAtZero: false,
                        title: {
                            display: !isMobile,
                            text: 'Value'
                        },
                        ticks: {
                            font: {
                                size: isMobile ? 10 : 12
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error(`Error creating chart:`, error);
    }
}

// Get user-friendly label for dataset
// Get the display name for an asset
function getAssetName(asset) {
    return assetMetadata[asset]?.name || customAssets[asset]?.longName || asset.toUpperCase();
}

function getDatasetLabel(asset, denominator) {
    const assetName = getAssetName(asset);

    if (denominator === 'real') {
        return `${assetName} (Real USD)`;
    } else if (denominator === 'nominal') {
        return `${assetName} (Nominal USD)`;
    } else {
        const denominatorName = assetMetadata[denominator]?.name || customAssets[denominator]?.longName || denominator;
        return `${assetName} / ${denominatorName}`;
    }
}

// Get chart title
function getChartTitle(asset, denominator) {
    return `${getDatasetLabel(asset, denominator)} Over Time`;
}

// Filter data by date range
function filterByDateRange(data, dateRange) {
    return data.filter(item => item.date >= dateRange.start && item.date <= dateRange.end);
}


// Get date range based on selection
function getDateRange() {
    const rangeType = document.getElementById('dateRange').value;
    const now = new Date();

    switch(rangeType) {
        case 'british':
            return {
                start: new Date(1250, 0, 1),
                end: now
            };
        case 'modern':
            return {
                start: new Date(1871, 0, 1),
                end: now
            };
        case '50':
            return {
                start: new Date(now.getFullYear() - 50, 0, 1),
                end: now
            };
        case '100':
            return {
                start: new Date(now.getFullYear() - 100, 0, 1),
                end: now
            };
        case '2':
            return {
                start: new Date(now.getFullYear() - 2, 0, 1),
                end: now
            };
        case 'custom':
            const startYear = parseInt(document.getElementById('startYear').value) || 1871;
            const endYear = parseInt(document.getElementById('endYear').value) || now.getFullYear();
            return {
                start: new Date(startYear, 0, 1),
                end: new Date(endYear, 11, 31)
            };
        default:
            return {
                start: new Date(1871, 0, 1),
                end: now
            };
    }
}

// Get date range for event-based periods
function getEventDateRange() {
    const eventPeriod = document.getElementById('eventPeriod').value;
    const eventYears = parseInt(document.getElementById('eventYears').value) || 10;

    // Handle event ranges (between two events)
    if (eventPeriod === 'gold-to-oil') {
        return {
            start: new Date(eventDates['gold-standard'].getFullYear() - 10, 0, 1),
            end: new Date(eventDates['oil-crisis'].getFullYear(), 11, 31)
        };
    } else if (eventPeriod === 'oil-to-dotcom') {
        return {
            start: eventDates['oil-crisis'],
            end: eventDates['dotcom']
        };
    } else if (eventPeriod === 'dotcom-to-housing') {
        return {
            start: eventDates['dotcom'],
            end: eventDates['housing-crisis']
        };
    } else if (eventPeriod === 'housing-to-covid') {
        return {
            start: eventDates['housing-crisis'],
            end: eventDates['covid']
        };
    }

    // Handle single event periods (±X years)
    const eventKey = eventPeriod.replace('-10', '');
    const eventDate = eventDates[eventKey];

    if (!eventDate) {
        return {
            start: new Date(1871, 0, 1),
            end: new Date()
        };
    }

    return {
        start: new Date(eventDate.getFullYear() - eventYears, eventDate.getMonth(), 1),
        end: new Date(eventDate.getFullYear() + eventYears, eventDate.getMonth(), 28)
    };
}

// Create annotations for historical events
function createAnnotations() {
    const dateRange = getDateRange();
    const annotations = {};

    historicalEvents
        .filter(event => {
            const eventDate = new Date(event.date);
            return eventDate >= dateRange.start && eventDate <= dateRange.end;
        })
        .forEach((event, index) => {
            annotations[`event${index}`] = {
                type: 'line',
                xMin: event.date,
                xMax: event.date,
                borderColor: event.color,
                borderWidth: 2,
                borderDash: [5, 5],
                label: {
                    content: event.label,
                    display: true,
                    position: 'top',
                    backgroundColor: event.color,
                    color: 'white',
                    font: {
                        size: 10
                    }
                }
            };
        });

    return annotations;
}


// Update statistics panel
function updateStats() {
    if (!stats) return;

    // Update DOM
    document.getElementById('currentCAPE').textContent = stats.currentCAPE.toFixed(2);
    document.getElementById('currentGold').textContent = `$${stats.currentGold.toFixed(2)}`;
    document.getElementById('currentRatio').textContent = stats.currentRatio.toFixed(4);
    document.getElementById('percentile').textContent = `${stats.percentile.toFixed(1)}%`;

    // Color code percentile
    const percentileElement = document.getElementById('percentile');
    if (stats.percentile > 80) {
        percentileElement.style.color = '#dc3545'; // High - potentially overvalued
    } else if (stats.percentile < 20) {
        percentileElement.style.color = '#28a745'; // Low - potentially undervalued
    } else {
        percentileElement.style.color = '#667eea'; // Normal
    }
}

// Setup event listeners
function setupEventListeners() {
    // Date range controls
    document.getElementById('dateRange').addEventListener('change', function() {
        const customRange = document.getElementById('customRange');

        // Hide custom range by default
        customRange.style.display = 'none';

        if (this.value === 'custom') {
            customRange.style.display = 'flex';
        } else {
            updateChartAndCalculator();
        }
    });

    document.getElementById('applyRange').addEventListener('click', updateChartAndCalculator);

    // Compare mode toggle
    document.getElementById('compareMode').addEventListener('change', function() {
        const singleConfig = document.getElementById('singleAssetConfig');
        const compareConfig = document.getElementById('compareConfig');

        if (this.checked) {
            singleConfig.style.display = 'none';
            compareConfig.style.display = 'block';
            document.getElementById('calculatorResults').style.display = 'none';
        } else {
            singleConfig.style.display = 'block';
            compareConfig.style.display = 'none';
        }

        updateChartAndCalculator();
    });

    // Auto-update on asset/denominator changes in single mode
    // Asset search
    document.getElementById('asset1').addEventListener('input', debounce(function(e) {
        const query = e.target.value;
        const container = e.target.closest('.asset-search-container');
        const suggestionsDiv = container.querySelector('.asset-suggestions');
        const results = searchAssets(query, false);
        displayAssetSuggestions(suggestionsDiv, results, e.target);
    }, 300));

    document.getElementById('asset1').addEventListener('focus', function(e) {
        const query = e.target.value;
        const container = e.target.closest('.asset-search-container');
        const suggestionsDiv = container.querySelector('.asset-suggestions');
        const results = searchAssets(query, false);
        displayAssetSuggestions(suggestionsDiv, results, e.target);
    });

    // Denominator search
    document.getElementById('denominator1').addEventListener('input', debounce(function(e) {
        const query = e.target.value;
        const container = e.target.closest('.asset-search-container');
        const suggestionsDiv = container.querySelector('.asset-suggestions');
        const results = searchAssets(query, true);
        displayAssetSuggestions(suggestionsDiv, results, e.target);
    }, 300));

    document.getElementById('denominator1').addEventListener('focus', function(e) {
        const query = e.target.value;
        const container = e.target.closest('.asset-search-container');
        const suggestionsDiv = container.querySelector('.asset-suggestions');
        const results = searchAssets(query, true);
        displayAssetSuggestions(suggestionsDiv, results, e.target);
    });

    document.getElementById('investmentAmount').addEventListener('input', debounce(autoCalculateReturn, 500));

    // Auto-update when comparisons change
    document.getElementById('addComparison').addEventListener('click', function() {
        addComparisonRow();
        // Update chart after a short delay to let the DOM update
        setTimeout(updateChartAndCalculator, 100);
    });

    // Handle asset search inputs (using event delegation)
    document.getElementById('compareAssets').addEventListener('input', debounce(function(e) {
        if (e.target.classList.contains('asset-search')) {
            const query = e.target.value;
            const container = e.target.closest('.asset-search-container');
            const suggestionsDiv = container.querySelector('.asset-suggestions');

            const results = searchAssets(query);
            displayAssetSuggestions(suggestionsDiv, results, e.target);
        }
    }, 300));

    // Handle asset search focus (show suggestions)
    document.getElementById('compareAssets').addEventListener('focus', function(e) {
        if (e.target.classList.contains('asset-search')) {
            const query = e.target.value;
            const container = e.target.closest('.asset-search-container');
            const suggestionsDiv = container.querySelector('.asset-suggestions');

            const results = searchAssets(query);
            displayAssetSuggestions(suggestionsDiv, results, e.target);
        }
    }, true);

    // Handle clicking outside to close suggestions
    document.addEventListener('click', function(e) {
        if (!e.target.classList.contains('asset-search') && !e.target.closest('.asset-suggestions')) {
            document.querySelectorAll('.asset-suggestions').forEach(div => {
                div.style.display = 'none';
            });
        }
    });

    // Auto-update when shared denominator changes in compare mode
    document.getElementById('compareDenominator').addEventListener('change', updateChartAndCalculator);
}

// Debounce helper to avoid too many calculations while typing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Auto-calculate return if amount is present
function autoCalculateReturn() {
    const amount = parseFloat(document.getElementById('investmentAmount').value);
    if (amount > 0) {
        calculateInvestmentReturn();
    } else {
        // Hide results if no amount
        document.getElementById('calculatorResults').style.display = 'none';
    }
}

// Add a new comparison row
function addComparisonRow() {
    const container = document.getElementById('compareAssets');
    const rows = container.querySelectorAll('.compare-row');
    const newIndex = rows.length;

    if (newIndex >= 6) {
        alert('Maximum 6 assets can be compared');
        return;
    }

    const newRow = document.createElement('div');
    newRow.className = 'compare-row';
    newRow.setAttribute('data-index', newIndex);
    newRow.innerHTML = `
        <div class="control-group asset-search-group">
            <label>Asset ${newIndex + 1}:</label>
            <div class="asset-search-container">
                <input type="text" class="asset-search" placeholder="Search: home, gold, spy, btc-usd..." data-asset="">
                <div class="asset-suggestions" style="display: none;"></div>
            </div>
        </div>
        <button class="remove-button" onclick="this.parentElement.remove(); document.dispatchEvent(new Event('compareChanged'));">✕</button>
    `;

    container.appendChild(newRow);
}

// Listen for manual row removal
document.addEventListener('compareChanged', updateChartAndCalculator);

// Calculate investment return based on current chart configuration
function calculateInvestmentReturn() {
    const amount = parseFloat(document.getElementById('investmentAmount').value) || 0;
    const asset = document.getElementById('asset1').dataset.asset;
    const denominator = document.getElementById('denominator1').dataset.asset;

    // Get the current date range from the page controls
    const dateRange = getDateRange();
    const startDate = dateRange.start;
    const endDate = dateRange.end;

    if (startDate >= endDate) {
        alert('Invalid date range. Please adjust the date range controls above.');
        return;
    }

    // Get the data source
    const dataArray = getDataArrayForAsset(asset);
    if (!dataArray) {
        alert('Data not available for this asset.');
        return;
    }

    // Filter data to the date range
    const filteredData = filterByDateRange(dataArray, dateRange);

    if (filteredData.length < 2) {
        alert('Not enough data points in the selected date range. Please select a longer period.');
        return;
    }

    // Get first and last data points in the range
    const startPoint = filteredData[0];
    const endPoint = filteredData[filteredData.length - 1];

    // Get values using the generic getValue function
    const startValue = getAssetValue(startPoint, asset, denominator);
    const endValue = getAssetValue(endPoint, asset, denominator);

    if (!startValue || !endValue || startValue <= 0 || endValue <= 0) {
        alert('Invalid data for the selected dates');
        return;
    }

    // Calculate the value multiplier
    const multiplier = endValue / startValue;

    // If amount is provided, calculate dollar returns
    let finalValue = 0;
    let totalReturn = 0;
    let returnPercentage = 0;

    if (amount > 0) {
        finalValue = amount * multiplier;
        totalReturn = finalValue - amount;
        returnPercentage = ((finalValue - amount) / amount) * 100;
    } else {
        // Just show the multiplier as percentage
        returnPercentage = (multiplier - 1) * 100;
    }

    // Calculate annualized return
    const years = (endPoint.date - startPoint.date) / (1000 * 60 * 60 * 24 * 365.25);
    const annualizedReturn = years > 0 ? (Math.pow(multiplier, 1 / years) - 1) * 100 : 0;

    // Log calculation details for verification
    console.log('=== Investment Calculation ===');
    console.log(`Asset: ${asset} / ${denominator}`);
    console.log(`Period: ${startPoint.date.toLocaleDateString()} to ${endPoint.date.toLocaleDateString()}`);
    console.log(`Years: ${years.toFixed(2)}`);
    console.log(`Start Value: ${startValue.toFixed(4)}`);
    console.log(`End Value: ${endValue.toFixed(4)}`);
    console.log(`Multiplier: ${multiplier.toFixed(4)}x`);
    if (amount > 0) {
        console.log(`Initial Investment: $${amount.toFixed(2)}`);
        console.log(`Final Value: $${finalValue.toFixed(2)}`);
        console.log(`Total Return: $${totalReturn.toFixed(2)}`);
    }
    console.log(`Return Percentage: ${returnPercentage.toFixed(2)}%`);
    console.log(`Annualized Return (CAGR): ${annualizedReturn.toFixed(2)}%`);
    console.log('==============================');

    // Display results
    displayCalculatorResults({
        initialAmount: amount,
        finalValue: finalValue,
        totalReturn: totalReturn,
        returnPercentage: returnPercentage,
        annualizedReturn: annualizedReturn,
        asset: asset,
        denominator: denominator,
        startDate: startPoint.date,
        endDate: endPoint.date,
        hasAmount: amount > 0
    });
}


// Display calculator results
function displayCalculatorResults(results) {
    const resultsDiv = document.getElementById('calculatorResults');

    // Format dates
    const startDateStr = results.startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    const endDateStr = results.endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    const label = getDatasetLabel(results.asset, results.denominator);

    document.getElementById('periodDates').textContent = `${label}\n${startDateStr} → ${endDateStr}`;

    // Determine unit based on denominator
    let unit = '$';
    let unitSuffix = '';

    if (results.denominator === 'gold') {
        unit = '';
        unitSuffix = ' oz gold';
    } else if (results.denominator === 'home') {
        unit = '';
        unitSuffix = ' homes';
    } else if (results.denominator === 'sp500') {
        unit = '';
        unitSuffix = ' S&P 500 units';
    } else if (results.denominator === 'cape') {
        unit = '';
        unitSuffix = ' CAPE units';
    } else if (results.denominator === 'nominal' || results.denominator === 'real') {
        unit = '$';
        unitSuffix = '';
    }

    if (results.hasAmount) {
        document.getElementById('initialAmount').textContent = `${unit}${results.initialAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}${unitSuffix}`;
        document.getElementById('finalValue').textContent = `${unit}${results.finalValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}${unitSuffix}`;
        document.getElementById('totalReturn').textContent = `${unit}${results.totalReturn.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}${unitSuffix}`;
    } else {
        document.getElementById('initialAmount').textContent = '-';
        document.getElementById('finalValue').textContent = '-';
        document.getElementById('totalReturn').textContent = '-';
    }

    document.getElementById('returnPercentage').textContent = `${results.returnPercentage.toFixed(2)}%`;
    document.getElementById('annualizedReturn').textContent = `${results.annualizedReturn.toFixed(2)}%`;

    // Color code the returns
    const returnColor = results.returnPercentage >= 0 ? '#28a745' : '#dc3545';
    document.getElementById('totalReturn').style.color = returnColor;
    document.getElementById('returnPercentage').style.color = returnColor;
    document.getElementById('annualizedReturn').style.color = returnColor;

    resultsDiv.style.display = 'grid';
}

// Show loading state
function showLoading() {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(102, 126, 234, 0.9); display: flex; align-items: center; justify-content: center; z-index: 9999; color: white; font-size: 24px;';
        overlay.textContent = 'Loading data...';
        document.body.appendChild(overlay);
    }
}

// Hide loading state
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

// Show error message in chart area
function showChartError(message) {
    const canvas = document.getElementById('main-chart');
    if (!canvas) return;

    // Destroy existing chart if it exists
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }

    // Get canvas context and clear it
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set styles
    ctx.fillStyle = '#f8d7da';
    ctx.fillRect(0, 0, width, height);

    // Draw border
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, width, height);

    // Draw icon (warning triangle)
    ctx.fillStyle = '#dc3545';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⚠', width / 2, 80);

    // Draw error message
    ctx.fillStyle = '#721c24';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No Data Available', width / 2, 140);

    // Draw details (handle multiline)
    ctx.font = '14px Arial';
    const lines = message.split('\n');
    let y = 180;
    lines.forEach(line => {
        ctx.fillText(line, width / 2, y);
        y += 24;
    });
}

// Show error message
function showError(message) {
    const chartContainer = document.querySelector('.single-chart-container');
    if (chartContainer) {
        chartContainer.innerHTML = `<div style="color: #dc3545; text-align: center; padding: 40px; font-size: 18px;">${message}</div>`;
    }
}

// API Key Management
const API_KEY_STORAGE_KEY = 'polygon_api_key';

function getStoredApiKey() {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
}

function saveApiKey(apiKey) {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
}

function clearApiKey() {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
}

// Setup Event Listeners for Settings
function setupSettingsListeners() {
    // Settings button
    document.getElementById('settingsButton')?.addEventListener('click', function() {
        const modal = document.getElementById('settingsModal');
        const input = document.getElementById('apiKeyInput');

        // Load current API key into input
        const currentKey = getStoredApiKey();
        if (currentKey) {
            input.value = currentKey;
        }

        modal.style.display = 'flex';
    });

    // Close modal
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            document.getElementById('settingsModal').style.display = 'none';
        });
    });

    // Click outside to close
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    // Save API key
    document.getElementById('saveApiKey')?.addEventListener('click', function() {
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        if (apiKey) {
            saveApiKey(apiKey);
            alert('✅ API key saved successfully!');
            document.getElementById('settingsModal').style.display = 'none';
        } else {
            alert('⚠️ Please enter an API key');
        }
    });

    // Clear API key
    document.getElementById('clearApiKey')?.addEventListener('click', function() {
        clearApiKey();
        document.getElementById('apiKeyInput').value = '';
        alert('🗑️ API key cleared');
    });
}

// Start the application
document.addEventListener('DOMContentLoaded', function() {
    init();
    setupSettingsListeners();
});
