// Data storage
let capeGoldData = [];
let homeGoldData = [];
let sp500GoldData = [];
let stats = null;
let historicalEvents = [];
let charts = {};

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
        await Promise.all([
            loadPreprocessedData()
        ]);

        updateStats();
        createMainChart();
        setupEventListeners();
        hideLoading();
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to load data. Please refresh the page.');
    }
}

// Create the main chart
function createMainChart() {
    const canvas = document.getElementById('main-chart');

    if (!canvas) {
        console.error('Main chart canvas not found');
        return;
    }

    // Destroy existing chart if it exists
    if (charts['main']) {
        charts['main'].destroy();
    }

    const ctx = canvas.getContext('2d');
    const dateRange = getDateRange();
    const datasets = getSelectedDatasets(dateRange);
    const annotations = createAnnotations();

    // Check if mobile device
    const isMobile = window.innerWidth < 768;

    charts['main'] = new Chart(ctx, {
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
                    text: 'Historical Market Data',
                    font: {
                        size: isMobile ? 16 : 20,
                        weight: 'bold'
                    }
                },
                legend: {
                    display: true,
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
                            label += context.parsed.y.toFixed(2);
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
                        text: 'Value (USD / Ratio)'
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
}

// Build a dataset for a specific asset/denominator combination
function buildAssetDataset(assetType, assetName, denominator, dateRange) {
    // Define colors for each asset
    const colors = {
        gold: { border: '#ffc107', background: 'rgba(255, 193, 7, 0.1)' },
        housing: { border: '#28a745', background: 'rgba(40, 167, 69, 0.1)' },
        sp500: { border: '#dc3545', background: 'rgba(220, 53, 69, 0.1)' },
        cape: { border: '#667eea', background: 'rgba(102, 126, 234, 0.1)' }
    };

    // Handle Gold/Gold edge case - would always be 1.0
    if (assetType === 'gold' && denominator === 'gold') {
        return null; // Skip this combination
    }

    // Select the appropriate data source
    let sourceData;
    if (assetType === 'cape') {
        sourceData = capeGoldData;
    } else if (assetType === 'housing') {
        sourceData = homeGoldData;
    } else if (assetType === 'sp500') {
        sourceData = sp500GoldData;
    } else if (assetType === 'gold') {
        // Gold data is in all datasets, use cape data
        sourceData = capeGoldData;
    }

    if (!sourceData || sourceData.length === 0) {
        return null;
    }

    // Filter by date range
    const filtered = filterByDateRange(sourceData, dateRange);

    // Build the data points based on asset and denominator
    const data = filtered.map(item => {
        let value;

        if (denominator === 'gold') {
            // Asset priced in gold ounces (ratio)
            if (assetType === 'cape') {
                value = item.value; // CAPE/Gold ratio already calculated
            } else if (assetType === 'housing') {
                value = item.value; // Housing/Gold ratio already calculated
            } else if (assetType === 'sp500') {
                value = item.value; // SP500/Gold ratio already calculated
            }
        } else if (denominator === 'real') {
            // Asset priced in real (CPI-adjusted) dollars
            if (assetType === 'cape') {
                value = item.cape; // CAPE is already a ratio, show as-is
            } else if (assetType === 'housing') {
                value = item.homePriceReal;
            } else if (assetType === 'sp500') {
                value = item.sp500Real;
            } else if (assetType === 'gold') {
                value = item.goldReal;
            }
        } else if (denominator === 'nominal') {
            // Asset priced in nominal dollars
            if (assetType === 'cape') {
                value = item.cape; // CAPE is already a ratio, show as-is
            } else if (assetType === 'housing') {
                value = item.homePriceNominal;
            } else if (assetType === 'sp500') {
                value = item.sp500Nominal;
            } else if (assetType === 'gold') {
                value = item.goldNominal;
            }
        }

        return {
            x: item.date,
            y: value || 0
        };
    }).filter(point => point.y > 0);

    // Build label
    let denominatorLabel;
    if (denominator === 'gold') {
        denominatorLabel = 'Gold oz';
    } else if (denominator === 'real') {
        denominatorLabel = 'Real $';
    } else {
        denominatorLabel = 'Nominal $';
    }

    const label = `${assetName} (${denominatorLabel})`;

    // Return the dataset
    return {
        label: label,
        data: data,
        borderColor: colors[assetType].border,
        backgroundColor: colors[assetType].background,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    };
}

// Get selected datasets based on asset and denominator selection
function getSelectedDatasets(dateRange) {
    const datasets = [];

    // Get selected denominator
    const denominator = document.querySelector('input[name="denominator"]:checked')?.value || 'real';

    // Get selected assets and build datasets
    const assets = [
        { id: 'asset-gold', type: 'gold', name: 'Gold' },
        { id: 'asset-housing', type: 'housing', name: 'Housing' },
        { id: 'asset-sp500', type: 'sp500', name: 'S&P 500' },
        { id: 'asset-cape', type: 'cape', name: 'CAPE Ratio' }
    ];

    assets.forEach(asset => {
        if (document.getElementById(asset.id)?.checked) {
            const dataset = buildAssetDataset(asset.type, asset.name, denominator, dateRange);
            if (dataset) {
                datasets.push(dataset);
            }
        }
    });

    return datasets;
}

// Load preprocessed data from static JSON files
async function loadPreprocessedData() {
    try {
        const [capeGold, homeGold, sp500Gold, statsData, eventsData] = await Promise.all([
            fetch('data/cape_gold_ratio.json').then(r => r.json()),
            fetch('data/home_gold_ratio.json').then(r => r.json()),
            fetch('data/sp500_gold_ratio.json').then(r => r.json()),
            fetch('data/stats.json').then(r => r.json()),
            fetch('data/events.json').then(r => r.json())
        ]);

        // Convert date strings back to Date objects
        capeGoldData = capeGold.map(item => ({
            ...item,
            date: new Date(item.date)
        }));

        homeGoldData = homeGold.map(item => ({
            ...item,
            date: new Date(item.date)
        }));

        sp500GoldData = sp500Gold.map(item => ({
            ...item,
            date: new Date(item.date)
        }));

        stats = statsData;
        historicalEvents = eventsData;

        console.log(`Loaded preprocessed data:`);
        console.log(`- CAPE/Gold: ${capeGoldData.length} points`);
        console.log(`- Home/Gold: ${homeGoldData.length} points`);
        console.log(`- S&P500/Gold: ${sp500GoldData.length} points`);
        console.log(`- Last updated: ${new Date(stats.lastUpdated).toLocaleString()}`);
    } catch (error) {
        console.error('Error loading preprocessed data:', error);
        throw error;
    }
}

// Create a single chart
function createChart(chartType) {
    const canvasId = `chart-${chartType}`;
    const canvas = document.getElementById(canvasId);

    if (!canvas) {
        console.error(`Canvas not found: ${canvasId}`);
        return;
    }

    // Destroy existing chart if it exists
    if (charts[chartType]) {
        charts[chartType].destroy();
    }

    const ctx = canvas.getContext('2d');
    const datasets = getDatasets(chartType);
    const annotations = createAnnotations();

    try {
        // Check if mobile device
        const isMobile = window.innerWidth < 768;

        charts[chartType] = new Chart(ctx, {
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
                        text: getChartTitle(chartType),
                        font: {
                            size: isMobile ? 14 : 18,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
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
                                label += context.parsed.y.toFixed(2);
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
                            text: 'Ratio / Value'
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
        console.error(`Error creating chart ${chartType}:`, error);
    }
}

// Get datasets based on chart type
function getDatasets(chartType) {
    const dateRange = getDateRange();

    switch(chartType) {
        case 'home-gold':
            return getHomeGoldDataset(dateRange);
        case 'sp500-gold':
            return getSP500GoldDataset(dateRange);
        case 'all-normalized':
            return getAllNormalizedDatasets(dateRange);
        case 'cape-usd':
            return getCapeUSDDataset(dateRange);
        case 'home-usd':
            return getHomeUSDDataset(dateRange);
        case 'sp500-usd':
            return getSP500USDDataset(dateRange);
        case 'gold-usd':
            return getGoldUSDDataset(dateRange);
        default:
            return getHomeGoldDataset(dateRange);
    }
}

// Filter data by date range
function filterByDateRange(data, dateRange) {
    return data.filter(item => item.date >= dateRange.start && item.date <= dateRange.end);
}

// Home Price / Gold ratio dataset
function getHomeGoldDataset(dateRange) {
    const filtered = filterByDateRange(homeGoldData, dateRange);
    const data = filtered.map(item => ({
        x: item.date,
        y: item.value
    }));

    return [{
        label: 'Home Price / Gold Ratio',
        data: data,
        borderColor: '#28a745',
        backgroundColor: 'rgba(40, 167, 69, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    }];
}

// S&P 500 / Gold ratio dataset
function getSP500GoldDataset(dateRange) {
    const filtered = filterByDateRange(sp500GoldData, dateRange);
    const data = filtered.map(item => ({
        x: item.date,
        y: item.value
    }));

    return [{
        label: 'S&P 500 / Gold Ratio',
        data: data,
        borderColor: '#dc3545',
        backgroundColor: 'rgba(220, 53, 69, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    }];
}

// CAPE / Gold ratio dataset
function getCapeGoldDataset(dateRange) {
    const filtered = filterByDateRange(capeGoldData, dateRange);
    const data = filtered.map(item => ({
        x: item.date,
        y: item.value
    }));

    return [{
        label: 'CAPE / Gold Ratio',
        data: data,
        borderColor: '#9b59b6',
        backgroundColor: 'rgba(155, 89, 182, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    }];
}

// All assets normalized to 100 at start date
function getAllNormalizedDatasets(dateRange) {
    const homeData = getHomeGoldDataset(dateRange)[0].data;
    const sp500Data = getSP500GoldDataset(dateRange)[0].data;

    // Normalize each dataset to 100 at start
    const normalize = (data) => {
        if (data.length === 0) return [];
        const baseValue = data[0].y;
        return data.map(item => ({
            x: item.x,
            y: (item.y / baseValue) * 100
        }));
    };

    return [
        {
            label: 'Home / Gold (Normalized)',
            data: normalize(homeData),
            borderColor: '#28a745',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
        },
        {
            label: 'S&P 500 / Gold (Normalized)',
            data: normalize(sp500Data),
            borderColor: '#dc3545',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
        }
    ];
}

// Get date range based on selection
function getDateRange() {
    const rangeType = document.getElementById('dateRange').value;
    const now = new Date();

    switch(rangeType) {
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
        case 'event':
            return getEventDateRange();
        case 'custom':
            const startYear = parseInt(document.getElementById('startYear').value) || 1871;
            const endYear = parseInt(document.getElementById('endYear').value) || now.getFullYear();
            return {
                start: new Date(startYear, 0, 1),
                end: new Date(endYear, 11, 31)
            };
        default: // 'all'
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

// USD-based dataset functions
function getCapeUSDDataset(dateRange) {
    const filtered = filterByDateRange(capeGoldData, dateRange);
    const data = filtered.map(item => ({
        x: item.date,
        y: item.cape || 0
    }));

    return [{
        label: 'CAPE Ratio',
        data: data,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    }];
}

function getHomeUSDDataset(dateRange) {
    const filtered = filterByDateRange(homeGoldData, dateRange);
    const data = filtered.map(item => ({
        x: item.date,
        y: item.homePriceReal || 0
    }));

    return [{
        label: 'Real Home Price Index',
        data: data,
        borderColor: '#28a745',
        backgroundColor: 'rgba(40, 167, 69, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    }];
}

function getSP500USDDataset(dateRange) {
    const filtered = filterByDateRange(sp500GoldData, dateRange);
    const data = filtered.map(item => ({
        x: item.date,
        y: item.sp500Real || 0
    }));

    return [{
        label: 'S&P 500 (Real)',
        data: data,
        borderColor: '#dc3545',
        backgroundColor: 'rgba(220, 53, 69, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    }];
}

function getGoldUSDDataset(dateRange) {
    const filtered = filterByDateRange(capeGoldData, dateRange); // Using cape data which has gold prices
    const data = filtered.map(item => ({
        x: item.date,
        y: item.goldReal || 0
    }));

    return [{
        label: 'Gold Price (Real, USD)',
        data: data,
        borderColor: '#ffc107',
        backgroundColor: 'rgba(255, 193, 7, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    }];
}

// Get chart title based on type
function getChartTitle(chartType) {
    const titles = {
        'home-gold': 'Real Home Price Index / Gold Price Over Time',
        'sp500-gold': 'S&P 500 / Gold Price Over Time',
        'all-normalized': 'All Assets vs Gold (Normalized to 100)',
        'cape-usd': 'CAPE Ratio Over Time',
        'home-usd': 'Real Home Price Index Over Time',
        'sp500-usd': 'S&P 500 (Real) Over Time',
        'gold-usd': 'Gold Price in USD Over Time'
    };
    return titles[chartType] || 'Market Valuation';
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
    document.getElementById('dateRange').addEventListener('change', function() {
        const customRange = document.getElementById('customRange');
        const eventRange = document.getElementById('eventRange');

        // Hide all range controls first
        customRange.style.display = 'none';
        eventRange.style.display = 'none';

        if (this.value === 'custom') {
            customRange.style.display = 'flex';
        } else if (this.value === 'event') {
            eventRange.style.display = 'flex';
        } else {
            createMainChart();
        }
    });

    document.getElementById('applyRange').addEventListener('click', createMainChart);
    document.getElementById('applyEvent').addEventListener('click', createMainChart);

    // Update charts when event period or years changes
    document.getElementById('eventPeriod').addEventListener('change', createMainChart);
    document.getElementById('eventYears').addEventListener('change', createMainChart);

    // Update chart when asset checkboxes change
    document.getElementById('asset-gold')?.addEventListener('change', createMainChart);
    document.getElementById('asset-housing')?.addEventListener('change', createMainChart);
    document.getElementById('asset-sp500')?.addEventListener('change', createMainChart);
    document.getElementById('asset-cape')?.addEventListener('change', createMainChart);

    // Update chart when denominator radio buttons change
    document.getElementById('denom-real')?.addEventListener('change', createMainChart);
    document.getElementById('denom-nominal')?.addEventListener('change', createMainChart);
    document.getElementById('denom-gold')?.addEventListener('change', createMainChart);

    // Calculator event listener
    document.getElementById('calculateBtn').addEventListener('click', calculateInvestmentReturn);
}

// Calculate investment return
function calculateInvestmentReturn() {
    const amount = parseFloat(document.getElementById('investmentAmount').value);
    const assetType = document.getElementById('assetType').value;
    const returnMode = document.getElementById('returnMode').value;

    // Validate inputs
    if (!amount || amount <= 0) {
        alert('Please enter a valid investment amount');
        return;
    }

    // Get the current date range from the page controls
    const dateRange = getDateRange();
    const startDate = dateRange.start;
    const endDate = dateRange.end;

    if (startDate >= endDate) {
        alert('Invalid date range. Please adjust the date range controls above.');
        return;
    }

    // Get the appropriate dataset based on asset type
    let data;
    let assetName;

    switch(assetType) {
        case 'gold':
            data = capeGoldData; // Has gold prices
            assetName = 'Gold';
            break;
        case 'home':
            data = homeGoldData; // Has home prices
            assetName = 'Housing';
            break;
        case 'sp500':
            data = sp500GoldData; // Has S&P 500 prices
            assetName = 'S&P 500';
            break;
        default:
            alert('Invalid asset type');
            return;
    }

    // Filter data to the date range
    const filteredData = filterByDateRange(data, dateRange);

    if (filteredData.length < 2) {
        alert('Not enough data points in the selected date range. Please select a longer period.');
        return;
    }

    // Get first and last data points in the range
    const startPoint = filteredData[0];
    const endPoint = filteredData[filteredData.length - 1];

    // Calculate returns
    const startPrice = getAssetPrice(startPoint, assetType, returnMode);
    const endPrice = getAssetPrice(endPoint, assetType, returnMode);

    if (!startPrice || !endPrice || startPrice <= 0 || endPrice <= 0) {
        alert('Invalid price data for the selected dates');
        return;
    }

    const finalValue = (amount / startPrice) * endPrice;
    const totalReturn = finalValue - amount;
    const returnPercentage = ((finalValue - amount) / amount) * 100;

    // Calculate annualized return
    const years = (endPoint.date - startPoint.date) / (1000 * 60 * 60 * 24 * 365.25);
    const annualizedReturn = years > 0 ? (Math.pow(finalValue / amount, 1 / years) - 1) * 100 : 0;

    // Verification: Calculate what the final value SHOULD be with compound interest
    const verificationValue = amount * Math.pow(1 + (annualizedReturn / 100), years);
    const verificationDiff = Math.abs(verificationValue - finalValue);

    // Log calculation details for verification
    console.log('=== Investment Calculation Verification ===');
    console.log(`Asset: ${assetName}`);
    console.log(`Return Mode: ${returnMode === 'real' ? 'Real (Inflation-Adjusted)' : 'Nominal (Actual Dollars)'}`);
    console.log(`Period: ${startPoint.date.toLocaleDateString()} to ${endPoint.date.toLocaleDateString()}`);
    console.log(`Years: ${years.toFixed(2)}`);
    console.log(`Start Price: $${startPrice.toFixed(2)}`);
    console.log(`End Price: $${endPrice.toFixed(2)}`);
    console.log(`Price Ratio: ${(endPrice / startPrice).toFixed(4)}x`);
    console.log(`Initial Investment: $${amount.toFixed(2)}`);
    console.log(`Final Value: $${finalValue.toFixed(2)}`);
    console.log(`Total Return: $${totalReturn.toFixed(2)} (${returnPercentage.toFixed(2)}%)`);
    console.log(`Annualized Return (CAGR): ${annualizedReturn.toFixed(2)}%`);
    console.log('--- Verification ---');
    console.log(`Compound interest check: $${amount.toFixed(2)} × (1 + ${(annualizedReturn/100).toFixed(6)})^${years.toFixed(2)}`);
    console.log(`Expected final value: $${verificationValue.toFixed(2)}`);
    console.log(`Actual final value: $${finalValue.toFixed(2)}`);
    console.log(`Difference: $${verificationDiff.toFixed(2)} ${verificationDiff < 0.01 ? '✓ PASS' : '⚠ CHECK'}`);
    console.log('========================================');

    // Display results
    displayCalculatorResults({
        initialAmount: amount,
        finalValue: finalValue,
        totalReturn: totalReturn,
        returnPercentage: returnPercentage,
        annualizedReturn: annualizedReturn,
        assetName: assetName,
        returnMode: returnMode,
        startDate: startPoint.date,
        endDate: endPoint.date
    });
}

// Find closest data point to a given date
function findClosestDataPoint(data, targetDate, assetType) {
    let closest = null;
    let minDiff = Infinity;

    for (const point of data) {
        const diff = Math.abs(point.date - targetDate);
        if (diff < minDiff) {
            minDiff = diff;
            closest = point;
        }
    }

    return closest;
}

// Get the asset price from a data point
function getAssetPrice(dataPoint, assetType, returnMode) {
    const mode = returnMode || 'real'; // Default to real if not specified
    const suffix = mode === 'real' ? 'Real' : 'Nominal';

    switch(assetType) {
        case 'gold':
            return dataPoint['gold' + suffix];
        case 'home':
            return dataPoint['homePrice' + suffix];
        case 'sp500':
            return dataPoint['sp500' + suffix];
        default:
            return null;
    }
}

// Display calculator results
function displayCalculatorResults(results) {
    const resultsDiv = document.getElementById('calculatorResults');

    // Format dates
    const startDateStr = results.startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    const endDateStr = results.endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    const modeLabel = results.returnMode === 'real' ? '(Real)' : '(Nominal)';

    document.getElementById('periodDates').textContent = `${startDateStr} → ${endDateStr} ${modeLabel}`;
    document.getElementById('initialAmount').textContent = `$${results.initialAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('finalValue').textContent = `$${results.finalValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('totalReturn').textContent = `$${results.totalReturn.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('returnPercentage').textContent = `${results.returnPercentage.toFixed(2)}%`;
    document.getElementById('annualizedReturn').textContent = `${results.annualizedReturn.toFixed(2)}%`;

    // Color code the returns
    const returnColor = results.totalReturn >= 0 ? '#28a745' : '#dc3545';
    document.getElementById('totalReturn').style.color = returnColor;
    document.getElementById('returnPercentage').style.color = returnColor;
    document.getElementById('annualizedReturn').style.color = returnColor;

    resultsDiv.style.display = 'grid';
}

// Show loading state
function showLoading() {
    const grid = document.querySelector('.charts-grid');
    if (grid) {
        // Just add a loading overlay without destroying canvases
        let overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(102, 126, 234, 0.9); display: flex; align-items: center; justify-content: center; z-index: 9999; color: white; font-size: 24px;';
            overlay.textContent = 'Loading data...';
            document.body.appendChild(overlay);
        }
    }
}

// Hide loading state
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

// Show error message
function showError(message) {
    const grid = document.querySelector('.charts-grid');
    if (grid) {
        grid.innerHTML = `<div class="loading" style="color: #dc3545; grid-column: 1/-1; text-align: center; padding: 40px;">${message}</div>`;
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
