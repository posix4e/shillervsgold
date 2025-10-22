// Data storage
let capeGoldData = [];
let homeGoldData = [];
let sp500GoldData = [];
let stats = null;
let historicalEvents = [];
let chart = null;

// Initialize the application
async function init() {
    try {
        showLoading();
        await Promise.all([
            loadPreprocessedData()
        ]);

        updateStats();
        createChart();
        setupEventListeners();
        hideLoading();
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to load data. Please refresh the page.');
    }
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

// Create the chart
function createChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    const chartType = document.getElementById('chartType').value;

    if (chart) {
        chart.destroy();
    }

    const datasets = getDatasets(chartType);
    const annotations = createAnnotations();

    chart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                title: {
                    display: true,
                    text: getChartTitle(chartType),
                    font: { size: 18, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'top',
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
                        display: true,
                        text: 'Year'
                    }
                },
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Ratio / Value'
                    }
                }
            }
        }
    });
}

// Get datasets based on chart type
function getDatasets(chartType) {
    const dateRange = getDateRange();

    switch(chartType) {
        case 'cape-gold':
            return getCapeGoldDataset(dateRange);
        case 'home-gold':
            return getHomeGoldDataset(dateRange);
        case 'sp500-gold':
            return getSP500GoldDataset(dateRange);
        case 'all-normalized':
            return getAllNormalizedDatasets(dateRange);
        default:
            return getCapeGoldDataset(dateRange);
    }
}

// Filter data by date range
function filterByDateRange(data, dateRange) {
    return data.filter(item => item.date >= dateRange.start && item.date <= dateRange.end);
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
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    }];
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

// All assets normalized to 100 at start date
function getAllNormalizedDatasets(dateRange) {
    const capeData = getCapeGoldDataset(dateRange)[0].data;
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
            label: 'CAPE / Gold (Normalized)',
            data: normalize(capeData),
            borderColor: '#667eea',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
        },
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

// Get chart title based on type
function getChartTitle(chartType) {
    const titles = {
        'cape-gold': 'CAPE Ratio / Gold Price Over Time',
        'home-gold': 'Real Home Price Index / Gold Price Over Time',
        'sp500-gold': 'S&P 500 / Gold Price Over Time',
        'all-normalized': 'All Assets vs Gold (Normalized to 100)'
    };
    return titles[chartType] || 'Market Valuation vs Gold';
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
    document.getElementById('chartType').addEventListener('change', createChart);
    document.getElementById('dateRange').addEventListener('change', function() {
        const customRange = document.getElementById('customRange');
        if (this.value === 'custom') {
            customRange.style.display = 'flex';
        } else {
            customRange.style.display = 'none';
            createChart();
        }
    });

    document.getElementById('applyRange').addEventListener('click', createChart);
}

// Show loading state
function showLoading() {
    const container = document.querySelector('.chart-container');
    container.innerHTML = '<div class="loading">Loading data...</div>';
}

// Hide loading state
function hideLoading() {
    // Chart replaces loading message
}

// Show error message
function showError(message) {
    const container = document.querySelector('.chart-container');
    container.innerHTML = `<div class="loading" style="color: #dc3545;">${message}</div>`;
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
