# Shiller vs Gold

A web-based visualization tool that combines Robert Shiller's CAPE ratio and home price data with historical gold prices to show relative market valuations over time. Similar to [strategyrainbow.com](https://strategyrainbow.com), this tool helps identify periods of market overvaluation or undervaluation.

## Features

- **Multiple Chart Types:**
  - CAPE / Gold Ratio: Stock market valuation relative to gold
  - Home Price / Gold Ratio: Real estate valuation relative to gold
  - S&P 500 / Gold Ratio: Direct stock-to-gold comparison
  - All Assets Normalized: Compare all three metrics on the same scale

- **Flexible Date Ranges:**
  - View all available data (1871-present)
  - Last 50 or 100 years
  - Custom date range selection

- **Historical Event Annotations:**
  - 1929 Stock Market Crash
  - 1933 Gold Standard Abandoned
  - 1973 Oil Crisis
  - 1987 Black Monday
  - 2000 Dot-com Bubble
  - 2007 Housing Bubble Peak
  - 2008 Financial Crisis
  - 2020 COVID-19 Crash

- **Real-time Statistics:**
  - Current CAPE ratio
  - Current gold price
  - CAPE/Gold ratio
  - Historical percentile ranking

## Data Sources

- **Shiller Data**: [Shiller Wrapper Data](https://posix4e.github.io/shiller_wrapper_data/)
  - Stock market data (1871-present)
  - Home price data (1890-present)
  - Source: Robert Shiller's research at Yale University

- **Gold Prices**: [FreeGoldAPI](https://freegoldapi.com/)
  - Historical gold prices (1258-2025)
  - Updated daily at 6 AM UTC

## How to Use

1. Open `index.html` in a web browser
2. Select a chart type from the dropdown menu
3. Choose a date range to analyze
4. View historical events marked on the chart
5. Check the statistics panel for current valuations and percentile rankings

## Interpretation

- **High CAPE/Gold Ratio** (>80th percentile): May indicate stock market overvaluation relative to gold
- **Low CAPE/Gold Ratio** (<20th percentile): May indicate stock market undervaluation relative to gold
- **Historical Events**: Vertical dashed lines show major economic events for context

## Technical Details

- Built with vanilla JavaScript, HTML, and CSS
- Uses Chart.js for visualization
- **Preprocessed data** for instant loading and better performance
- Data resolution optimized: monthly (last 10 years), quarterly (10-50 years ago), yearly (>50 years)
- No backend required - runs entirely in the browser

## Architecture

The project uses a **preprocessing approach** similar to strategyrainbow.com:

1. **Data Preprocessing (`preprocess.js`)**:
   - Fetches data from Shiller Wrapper Data and FreeGoldAPI
   - Reduces data resolution for optimal performance
   - Computes all ratios (CAPE/Gold, Home/Gold, S&P500/Gold)
   - Generates static JSON files in `/data` directory

2. **GitHub Actions Automation (`.github/workflows/deploy.yml`)**:
   - Runs daily at 7 AM UTC (after gold prices update)
   - Fetches and preprocesses all data
   - Deploys updated site to GitHub Pages

3. **Frontend (`app.js`)**:
   - Loads preprocessed JSON files instantly
   - No API calls or CSV parsing in browser
   - Fast, responsive chart rendering

## Local Development

### First-time setup

1. Generate preprocessed data:
   ```bash
   node preprocess.js
   ```

2. Start a local server:
   ```bash
   # Python 3
   python -m http.server 8000

   # Node.js
   npm run serve

   # Or use npx
   npx serve
   ```

3. Visit `http://localhost:8000` in your browser

### Testing changes

The site works entirely with the preprocessed data in the `/data` directory. To update the data, run `node preprocess.js` again.

## Deployment

### GitHub Pages (Recommended)

1. Push to GitHub
2. Enable GitHub Pages in repository settings
3. The GitHub Action will automatically:
   - Fetch and preprocess data daily
   - Deploy to GitHub Pages
   - Keep data updated without manual intervention

### Other Hosting

Deploy as a static site to any hosting service:
- Netlify (with build command: `node preprocess.js`)
- Vercel (with build command: `node preprocess.js`)
- AWS S3 + CloudFront
- Any static web host

**Important**: Make sure to run `node preprocess.js` before deployment to generate the `/data` directory.

## Credits

- Data from Robert Shiller's research at Yale University
- Gold price data from FreeGoldAPI
- Inspired by [strategyrainbow.com](https://strategyrainbow.com)
- Built by the same team behind [btc-mnav-rainbow](https://github.com/posix4e/btc-mnav-rainbow)

## License

MIT License - Feel free to use and modify as needed.
