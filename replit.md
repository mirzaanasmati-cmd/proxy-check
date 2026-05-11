# ProxyCheck — Proxy Intelligence Tool

## Overview
A professional proxy intelligence tool that checks multiple proxies simultaneously, detects exit IPs, fetches fraud scores from Scamalytics, usage types from IP2Location, and provides quality scoring using a fully internal detection engine — no paid API keys required.

## Architecture
- **Frontend**: React + TypeScript with Tailwind CSS, shadcn/ui components
- **Backend**: Express.js API with SSE streaming
- **Database**: PostgreSQL for cross-session IP history tracking

## Key Features
- Accept 1-200 proxy strings (host:port:user:pass or host:port@user:pass format)
- Streaming live results via Server-Sent Events
- Proxy connectivity check with exit IP detection + latency measurement
- Geo data from 5 providers (freeipapi.app, ip-api.com, ipwho.is, ipapi.co, geoplugin.net)
- Fraud scores from Scamalytics (scraped via curl — no API key)
- Usage types from IP2Location (scraped via curl — no API key)
- **Internal Detection Engine**: ASN + ISP + PTR + usage type + port scan signals — no external API needed
- **Connection Type Detection**: Residential / Mobile / Datacenter / Corporate / Unknown
- **Reverse DNS (PTR)**: Datacenter vs residential hostname classification
- **TOR Exit Node Check**: Official Tor Project list (1hr cached)
- **Open Port Probe**: 6 common proxy ports (3128, 8080, 1080, 8888, 9050, 8118)
- **Anonymity Level Detection**: Elite / Anonymous / Transparent via HTTP header inspection
- **IP Intelligence Scoring**: 0-100 quality score, grades A+ to F, full reasoning panel
- **Stats Dashboard**: Working%, avg speed, grade distribution, anonymity breakdown, top countries
- **Table View**: Compact sortable table alternative to card grid
- **Sort Options**: By score, latency, grade, country
- Cross-session IP history with "Already Detected" badges
- Filter by: Country, Region, ISP, Usage Type, Score Range, Detected/Fresh, Safe/Risky
- Export working proxies to .txt

## File Structure
- `shared/schema.ts` - Types: ProxyResult, IpIntelligence, InternalFlags, IpQualityReason
- `server/routes.ts` - API endpoints, proxy checking, geo/fraud/usage/TOR/port checking
- `server/ipHistory.ts` - PostgreSQL IP history tracking
- `server/ipIntelligence.ts` - Scoring engine + internal flag analyzer (analyzeInternalFlags)
- `client/src/pages/home.tsx` - Full UI: ProxyCard, SignalsPanel, IntelligencePanel, filters

## External APIs Used
- **ipify.org** - Exit IP detection (via proxy)
- **freeipapi.app** - Primary geo data (FREELPAPI_KEY env var)
- **ip-api.com** - Geo fallback (rate-limited queue)
- **ipwho.is, ipapi.co, geoplugin.net** - Additional geo fallbacks
- **scamalytics.com** - Fraud score scraping via curl
- **ip2location.com** - Usage type scraping via curl
- **torproject.org** - TOR exit node list (1hr cache)
- **httpbin.org** - Anonymity detection (header inspection)

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `FREELPAPI_KEY` - freeipapi.app API key (optional — falls back to free providers)
- `SESSION_SECRET` - Session management

## No IPQS — Fully Internal Detection
IPQS was removed due to free tier rate limits (35/day). The `analyzeInternalFlags()` function in `server/ipIntelligence.ts` replaces it using:
- Known datacenter ASNs (30+ entries)
- ISP name matching (residential, mobile, cloud, VPN providers)
- PTR/reverse DNS pattern matching
- IP2Location usage type codes (DCH/ISP/MOB)
- Open port scan results
- TOR exit node list

## Running
- `npm run dev` — Express + Vite dev server on port 5000
- MAX_CONCURRENT = 30 parallel proxy checks
