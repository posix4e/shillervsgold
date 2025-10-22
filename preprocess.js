#!/usr/bin/env node

/**
 * Data preprocessing script for Shiller vs Gold
 * Fetches data from APIs, processes it, reduces resolution, and generates static JSON files
 * Run with: node preprocess.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Output directory for processed data
const DATA_DIR = path.join(__dirname, 'data');

// Historical events
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

// Fetch data from URL
function fetchData(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Parse Shiller date format (YYYY.MM)
function parseShillerDate(dateStr) {
    const parts = dateStr.toString().split('.');
    const year = parseInt(parts[0]);
    const month = parts[1] ? parseInt(parts[1]) - 1 : 0;
    return new Date(year, month, 1);
}

// Reduce data resolution based on time period
// Recent: monthly, 10-50 years ago: quarterly, >50 years: yearly
function reduceResolution(data, getDate) {
    const now = new Date();
    const tenYearsAgo = new Date(now.getFullYear() - 10, 0, 1);
    const fiftyYearsAgo = new Date(now.getFullYear() - 50, 0, 1);

    const result = [];
    let lastQuarter = { year: -1, quarter: -1 };
    let lastYear = -1;

    for (const item of data) {
        const date = getDate(item);
        const year = date.getFullYear();
        const quarter = Math.floor(date.getMonth() / 3);

        // Last 10 years: keep all monthly data
        if (date >= tenYearsAgo) {
            result.push(item);
        }
        // 10-50 years: quarterly data
        else if (date >= fiftyYearsAgo) {
            if (year !== lastQuarter.year || quarter !== lastQuarter.quarter) {
                result.push(item);
                lastQuarter = { year, quarter };
            }
        }
        // >50 years: yearly data (keep January of each year)
        else {
            if (year !== lastYear && date.getMonth() === 0) {
                result.push(item);
                lastYear = year;
            }
        }
    }

    return result;
}

// Fetch and process stock market data
async function processStockData() {
    console.log('Fetching stock market data...');
    const url = 'https://posix4e.github.io/shiller_wrapper_data/data/stock_market_data.json';
    const json = await fetchData(url);
    let data = JSON.parse(json);

    // Handle if data is wrapped in an object
    if (!Array.isArray(data)) {
        data = data.data || Object.values(data);
    }

    const processed = data
        .filter(item => item && (item.date || item.Date)) // Filter out invalid items
        .map(item => ({
            date: parseShillerDate(item.date || item.Date),
            sp500: parseFloat(item.P || item['S&P 500']),
            cape: parseFloat(item.cape || item['CAPE Ratio']),
            dividend: parseFloat(item.D || item['Dividend']),
            earnings: parseFloat(item.E || item['Earnings']),
            cpi: parseFloat(item.cpi || item['CPI'])
        }))
        .filter(item => !isNaN(item.date.getTime()) && item.sp500 > 0)
        .sort((a, b) => a.date - b.date);

    // Reduce resolution
    const reduced = reduceResolution(processed, item => item.date);

    // Convert dates to ISO strings for JSON
    const final = reduced.map(item => ({
        ...item,
        date: item.date.toISOString()
    }));

    console.log(`Processed ${data.length} -> ${final.length} stock market data points`);
    return final;
}

// Fetch and process home price data
async function processHomeData() {
    console.log('Fetching home price data...');
    const url = 'https://posix4e.github.io/shiller_wrapper_data/data/home_price_data.json';
    const json = await fetchData(url);
    let parsed = JSON.parse(json);

    // Extract data array from metadata wrapper
    let data = parsed.data || parsed;
    if (!Array.isArray(data)) {
        data = Object.values(data);
    }

    const processed = data
        .filter(item => item && item['Unnamed: 0'] && typeof item['Unnamed: 0'] === 'number') // Filter for valid year entries
        .map(item => ({
            date: new Date(item['Unnamed: 0'], 0, 1), // Year is in Unnamed: 0
            realPrice: parseFloat(item['Real']), // Real price index in 'Real' column
            buildingCost: parseFloat(item['Real.1']) // Building cost in 'Real.1' column
        }))
        .filter(item => !isNaN(item.date.getTime()) && !isNaN(item.realPrice) && item.realPrice > 0)
        .sort((a, b) => a.date - b.date);

    // Reduce resolution
    const reduced = reduceResolution(processed, item => item.date);

    // Convert dates to ISO strings
    const final = reduced.map(item => ({
        ...item,
        date: item.date.toISOString()
    }));

    console.log(`Processed ${data.length} -> ${final.length} home price data points`);
    return final;
}

// Fetch and process gold price data
async function processGoldData() {
    console.log('Fetching gold price data...');
    const url = 'https://freegoldapi.com/data/latest.csv';
    const csv = await fetchData(url);
    const lines = csv.trim().split('\n');

    console.log(`Gold CSV has ${lines.length} lines`);
    console.log('Gold CSV header:', lines[0]);
    console.log('Gold CSV first data row:', lines[1]);

    const processed = lines
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

    console.log(`Parsed ${processed.length} valid gold price entries`);

    // Reduce resolution
    const reduced = reduceResolution(processed, item => item.date);

    // Convert dates to ISO strings
    const final = reduced.map(item => ({
        ...item,
        date: item.date.toISOString()
    }));

    console.log(`Processed ${processed.length} -> ${final.length} gold price data points`);
    return final;
}

// Get gold price for a specific date (nearest match)
function getGoldPrice(goldData, targetDate) {
    if (goldData.length === 0) return null;

    let closest = goldData[0];
    let minDiff = Math.abs(targetDate - new Date(goldData[0].date));

    for (const gold of goldData) {
        const diff = Math.abs(targetDate - new Date(gold.date));
        if (diff < minDiff) {
            minDiff = diff;
            closest = gold;
        }
    }

    return closest.price;
}

// Compute ratios and merged datasets
function computeRatios(stockData, homeData, goldData) {
    console.log('Computing ratios...');

    const capeGold = stockData.map(item => {
        const date = new Date(item.date);
        const goldPrice = getGoldPrice(goldData, date);
        if (!goldPrice || goldPrice === 0) return null;
        return {
            date: item.date,
            value: item.cape / goldPrice,
            cape: item.cape,
            gold: goldPrice
        };
    }).filter(item => item !== null);

    const homeGold = homeData.map(item => {
        const date = new Date(item.date);
        const goldPrice = getGoldPrice(goldData, date);
        if (!goldPrice || goldPrice === 0) return null;
        return {
            date: item.date,
            value: item.realPrice / goldPrice,
            homePrice: item.realPrice,
            gold: goldPrice
        };
    }).filter(item => item !== null);

    const sp500Gold = stockData.map(item => {
        const date = new Date(item.date);
        const goldPrice = getGoldPrice(goldData, date);
        if (!goldPrice || goldPrice === 0) return null;
        return {
            date: item.date,
            value: item.sp500 / goldPrice,
            sp500: item.sp500,
            gold: goldPrice
        };
    }).filter(item => item !== null);

    return { capeGold, homeGold, sp500Gold };
}

// Compute statistics
function computeStats(stockData, goldData) {
    console.log('Computing statistics...');

    if (stockData.length === 0 || goldData.length === 0) {
        return null;
    }

    const latestStock = stockData[stockData.length - 1];
    const latestGold = goldData[goldData.length - 1];
    const currentRatio = latestStock.cape / latestGold.price;

    // Calculate historical ratios for percentile
    const allRatios = stockData
        .map(item => {
            const goldPrice = getGoldPrice(goldData, new Date(item.date));
            if (!goldPrice) return null;
            return item.cape / goldPrice;
        })
        .filter(r => r !== null)
        .sort((a, b) => a - b);

    const percentile = (allRatios.filter(r => r < currentRatio).length / allRatios.length * 100);

    return {
        currentCAPE: latestStock.cape,
        currentGold: latestGold.price,
        currentRatio: currentRatio,
        percentile: percentile,
        lastUpdated: new Date().toISOString(),
        dataPoints: {
            stock: stockData.length,
            home: 0, // Will be filled later
            gold: goldData.length
        }
    };
}

// Main processing function
async function main() {
    try {
        // Create data directory
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        // Fetch and process all data
        const stockData = await processStockData();
        const homeData = await processHomeData();
        const goldData = await processGoldData();

        // Compute ratios
        const ratios = computeRatios(stockData, homeData, goldData);

        // Compute statistics
        const stats = computeStats(stockData, goldData);
        if (stats) {
            stats.dataPoints.home = homeData.length;
        } else {
            console.error('Failed to compute statistics - insufficient data');
            process.exit(1);
        }

        // Save processed data
        console.log('Saving processed data...');

        fs.writeFileSync(
            path.join(DATA_DIR, 'stock_data.json'),
            JSON.stringify(stockData, null, 2)
        );

        fs.writeFileSync(
            path.join(DATA_DIR, 'home_data.json'),
            JSON.stringify(homeData, null, 2)
        );

        fs.writeFileSync(
            path.join(DATA_DIR, 'gold_data.json'),
            JSON.stringify(goldData, null, 2)
        );

        fs.writeFileSync(
            path.join(DATA_DIR, 'cape_gold_ratio.json'),
            JSON.stringify(ratios.capeGold, null, 2)
        );

        fs.writeFileSync(
            path.join(DATA_DIR, 'home_gold_ratio.json'),
            JSON.stringify(ratios.homeGold, null, 2)
        );

        fs.writeFileSync(
            path.join(DATA_DIR, 'sp500_gold_ratio.json'),
            JSON.stringify(ratios.sp500Gold, null, 2)
        );

        fs.writeFileSync(
            path.join(DATA_DIR, 'stats.json'),
            JSON.stringify(stats, null, 2)
        );

        fs.writeFileSync(
            path.join(DATA_DIR, 'events.json'),
            JSON.stringify(HISTORICAL_EVENTS, null, 2)
        );

        console.log('\n✓ Data preprocessing complete!');
        console.log(`✓ Files saved to ${DATA_DIR}`);
        console.log(`✓ Stock data: ${stockData.length} points`);
        console.log(`✓ Home data: ${homeData.length} points`);
        console.log(`✓ Gold data: ${goldData.length} points`);
        console.log(`✓ CAPE/Gold ratio: ${ratios.capeGold.length} points`);
        console.log(`✓ Current CAPE: ${stats.currentCAPE.toFixed(2)}`);
        console.log(`✓ Current Gold: $${stats.currentGold.toFixed(2)}`);
        console.log(`✓ CAPE/Gold Ratio: ${stats.currentRatio.toFixed(4)} (${stats.percentile.toFixed(1)}th percentile)`);

    } catch (error) {
        console.error('Error during preprocessing:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main };
