import type { Express } from "express";
import { createServer, type Server } from "http";
import * as https from "https";
import * as http from "http";
import * as net from "net";
import * as dns from "dns";
import { HttpsProxyAgent } from "https-proxy-agent";
import * as cheerio from "cheerio";
import { promisify } from "util";
import type { ProxyResult } from "@shared/schema";
import { proxyInputSchema } from "@shared/schema";
import { analyzeIpQuality, analyzeInternalFlags } from "./ipIntelligence";
import { detectProxyProvider } from "./proxyProvider";

const dnsReverse = promisify(dns.reverse);

// Vercel Hobby plan = 10s function timeout. Auto-detect and shrink budgets.
const IS_VERCEL = !!process.env.VERCEL;
const FAST_MODE = IS_VERCEL || process.env.FAST_MODE === "1";

const PROXY_TIMEOUT = FAST_MODE ? 6000 : 15000;
const MAX_CONCURRENT = 30;
const FETCH_TIMEOUT = FAST_MODE ? 4000 : 10000;
const LATENCY_PROBE_TIMEOUT = FAST_MODE ? 2500 : 5000;
const ANONYMITY_TIMEOUT = FAST_MODE ? 3500 : 7000;

function measureTcpLatency(host: string, port: string): Promise<number | null> {
  return new Promise((resolve) => {
    const portNum = parseInt(port);
    const t0 = Date.now();
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, LATENCY_PROBE_TIMEOUT);
    socket.connect(portNum, host, () => {
      const ms = Date.now() - t0;
      clearTimeout(timer);
      socket.destroy();
      resolve(ms);
    });
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

function httpsGetViaProxy(url: string, agent: HttpsProxyAgent<string>): Promise<{ body: string; ttfbMs: number }> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let req: any = null;
    const timer = setTimeout(() => {
      // Destroy the underlying socket — prevents dangling connections that could
      // outlive a Vercel serverless function and inflate cold-start memory.
      try { req?.destroy(); } catch { /* noop */ }
      reject(new Error("Connection timed out"));
    }, PROXY_TIMEOUT);

    req = https.get(url, { agent, rejectUnauthorized: false }, (res) => {
      const ttfbMs = Date.now() - t0;
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        clearTimeout(timer);
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ body: data, ttfbMs });
        } else {
          reject(new Error(`Proxy returned HTTP ${res.statusCode}`));
        }
      });
    });

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    req.on("timeout", () => {
      clearTimeout(timer);
      req.destroy();
      reject(new Error("Connection timed out"));
    });
  });
}

function isIPv6Address(s: string): boolean {
  return s.includes(":") && !s.startsWith("[");
}

function parseProxyString(raw: string): { host: string; port: string; username?: string; password?: string } | null {
  const s = raw.trim();

  // IPv6 bracket notation: [2001:db8::1]:8080@user:pass or [2001:db8::1]:8080:user:pass
  if (s.startsWith("[")) {
    const closeBracket = s.indexOf("]");
    if (closeBracket === -1) return null;
    const ipv6Host = s.slice(1, closeBracket); // bare IPv6 without brackets
    const rest = s.slice(closeBracket + 1);    // ":8080@user:pass" or ":8080:user:pass"
    if (!rest.startsWith(":")) return null;
    const afterBracket = rest.slice(1); // "8080@user:pass" or "8080:user:pass"

    const atIdx = afterBracket.indexOf("@");
    if (atIdx !== -1) {
      const port = afterBracket.slice(0, atIdx);
      const credentials = afterBracket.slice(atIdx + 1);
      const credColon = credentials.indexOf(":");
      if (credColon === -1) return { host: ipv6Host, port, username: credentials };
      return { host: ipv6Host, port, username: credentials.slice(0, credColon), password: credentials.slice(credColon + 1) };
    }

    const parts = afterBracket.split(":");
    const port = parts[0];
    if (parts.length >= 3) {
      return { host: ipv6Host, port, username: parts[1], password: parts.slice(2).join(":") };
    }
    return { host: ipv6Host, port };
  }

  // Format A: host:port@user:pass  OR  user:pass@host:port
  const atIdx = s.indexOf("@");
  if (atIdx !== -1) {
    const before = s.slice(0, atIdx);
    const after  = s.slice(atIdx + 1);

    const isValidPort = (v: string) => /^\d{1,5}$/.test(v) && +v > 0 && +v <= 65535;

    // Check if "before" ends with a port → host:port@user:pass
    const beforeLastColon = before.lastIndexOf(":");
    if (beforeLastColon !== -1 && isValidPort(before.slice(beforeLastColon + 1))) {
      const host = before.slice(0, beforeLastColon);
      const port = before.slice(beforeLastColon + 1);
      const credColon = after.indexOf(":");
      if (credColon === -1) return { host, port, username: after };
      return { host, port, username: after.slice(0, credColon), password: after.slice(credColon + 1) };
    }

    // Check if "after" ends with a port → user:pass@host:port
    const afterLastColon = after.lastIndexOf(":");
    if (afterLastColon !== -1 && isValidPort(after.slice(afterLastColon + 1))) {
      const host = after.slice(0, afterLastColon);
      const port = after.slice(afterLastColon + 1);
      const credColon = before.indexOf(":");
      if (credColon === -1) return { host, port, username: before };
      return { host, port, username: before.slice(0, credColon), password: before.slice(credColon + 1) };
    }

    return null;
  }

  // Format B: host:port:username:password  (all colon-separated)
  const parts = s.split(":");
  if (parts.length < 2) return null;
  const host = parts[0];
  const port = parts[1];
  if (parts.length >= 4) {
    const username = parts[2];
    const password = parts.slice(3).join(":");
    return { host, port, username, password };
  }
  // host:port only
  return { host, port };
}

// ─── Anonymity Level Check ────────────────────────────────────────────────────
// Makes an HTTP (not HTTPS) request through the proxy to httpbin.org/get.
// Transparent proxies add X-Forwarded-For / X-Real-Ip headers revealing origin.
// Anonymous proxies send Via / Proxy headers but hide origin.
// Elite proxies pass no proxy headers at all.
async function checkAnonymityLevel(
  host: string, port: string, username?: string, password?: string
): Promise<"elite" | "anonymous" | "transparent"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("elite"), ANONYMITY_TIMEOUT);
    try {
      const auth = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
      const proxyAuth = username && password
        ? { "Proxy-Authorization": `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` }
        : {};

      const req = http.request({
        host,
        port: parseInt(port),
        method: "GET",
        path: "http://httpbin.org/get",
        headers: {
          Host: "httpbin.org",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
          ...proxyAuth,
        },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            const json = JSON.parse(data);
            const h: Record<string, string> = {};
            for (const [k, v] of Object.entries(json.headers || {})) {
              h[k.toLowerCase()] = String(v);
            }
            if (h["x-forwarded-for"] || h["x-real-ip"] || h["x-client-ip"] || h["client-ip"]) {
              resolve("transparent");
            } else if (h["via"] || h["proxy-connection"] || h["x-proxy-id"] ||
                       h["proxy-authenticate"] || h["x-forwarded-host"]) {
              resolve("anonymous");
            } else {
              resolve("elite");
            }
          } catch {
            resolve("elite");
          }
        });
      });
      req.setTimeout(ANONYMITY_TIMEOUT - 500, () => { req.destroy(); clearTimeout(timer); resolve("elite"); });
      req.on("error", () => { clearTimeout(timer); resolve("elite"); });
      req.end();
    } catch {
      clearTimeout(timer);
      resolve("elite");
    }
  });
}

export async function checkSingleProxy(proxyString: string): Promise<ProxyResult> {
  const parsed = parseProxyString(proxyString);
  const nullResult = (error: string): ProxyResult => ({
    proxyString, working: false, exitIp: null, exitIpVersion: null,
    country: null, city: null, region: null, postalCode: null, latitude: null, longitude: null,
    isp: null, asn: null, usageType: null, fraudScore: null, fraudRisk: null,
    error, intelligence: null, internalFlags: null, reverseDns: null,
    openPorts: [], isTorNode: false, latencyMs: null, anonymityLevel: null,
    provider: null,
  });

  if (!parsed) return nullResult("Invalid proxy format. Use host:port:user:pass or host:port@user:pass");

  const { host, port, username, password } = parsed;

  const portNum = parseInt(port);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) return nullResult("Invalid port number");

  // IPv6 hosts must be wrapped in brackets in URLs
  const hostForUrl = isIPv6Address(host) ? `[${host}]` : host;
  let proxyUrl: string;
  if (username && password) {
    proxyUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${hostForUrl}:${port}`;
  } else {
    proxyUrl = `http://${hostForUrl}:${port}`;
  }

  const agent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });
  let exitIp: string | null = null;
  let exitIpVersion: "v4" | "v6" | null = null;

  // Measure raw TCP latency in PARALLEL with exit IP fetch — independent operations,
  // no need to serialize. Saves up to LATENCY_PROBE_TIMEOUT seconds on Vercel Hobby.
  const latencyPromise = measureTcpLatency(host, port);
  let latencyMs: number | null = null;

  try {
    // api64.ipify.org returns IPv6 if the proxy supports it, IPv4 otherwise
    const [_lat, exitFetch] = await Promise.all([
      latencyPromise.then(v => { latencyMs = v; }),
      httpsGetViaProxy("https://api64.ipify.org?format=json", agent),
    ]);
    const data = JSON.parse(exitFetch.body) as { ip: string };
    exitIp = data.ip;
    // Detect version: IPv6 contains colons, IPv4 does not
    exitIpVersion = exitIp.includes(":") ? "v6" : "v4";
  } catch (err: any) {
    // Make sure latency promise resolves before returning to avoid dangling sockets
    latencyMs = await latencyPromise.catch(() => null);
    return nullResult(err.message || "Connection failed");
  }

  // On Vercel Hobby: skip anonymity check (saves up to 3.5s — separate HTTP req through proxy)
  const parallel: Promise<any>[] = [
    fetchGeoData(exitIp),
    fetchScamalytics(exitIp),
    fetchIP2Location(exitIp),
    fetchReverseDNS(exitIp),
    getTorExitNodes(),
    probeOpenPorts(exitIp),
  ];
  if (!FAST_MODE) parallel.push(checkAnonymityLevel(host, port, username, password));

  // Global hard cap on parallel enrichment block — prevents Vercel Hobby 10s timeout.
  // Exit IP fetch already consumed up to 6s; we leave ~3s for enrichment + 1s overhead.
  const PARALLEL_BUDGET = FAST_MODE ? 3000 : 9000;
  const budgetGuard = (p: Promise<any>): Promise<any> =>
    Promise.race([p, new Promise(resolve => setTimeout(() => resolve(undefined), PARALLEL_BUDGET))]);

  const settled = await Promise.allSettled(parallel.map(budgetGuard));
  const [geoData, scamalyticsData, ip2locationData, rdnsResult, torNodes, openPortsResult, anonymityResult] = settled as any[];

  const geo = (geoData.status === "fulfilled" && geoData.value)
    ? geoData.value
    : { country: null, city: null, region: null, postalCode: null, latitude: null, longitude: null, isp: null, asn: null };
  const scam = (scamalyticsData.status === "fulfilled" && scamalyticsData.value) ? scamalyticsData.value : { fraudScore: null, fraudRisk: null };
  const ip2loc = (ip2locationData.status === "fulfilled" && ip2locationData.value) ? ip2locationData.value : { usageType: null };
  const reverseDns = rdnsResult.status === "fulfilled" ? rdnsResult.value ?? null : null;
  const torSet = (torNodes.status === "fulfilled" && torNodes.value) ? torNodes.value : new Set<string>();
  const openPorts = (openPortsResult.status === "fulfilled" && openPortsResult.value) ? openPortsResult.value : [];
  const isTorNode = torSet.has(exitIp);
  const anonymityLevel = anonymityResult && anonymityResult.status === "fulfilled" ? anonymityResult.value ?? null : null;

  // Nominatim reverse geocode: accurate city / state / postal / street from OSM.
  // Skipped in FAST_MODE — adds 1-3s sequential after geo lookup.
  const nominatim = (!FAST_MODE && geo.latitude != null && geo.longitude != null)
    ? await fetchReverseGeocode(geo.latitude, geo.longitude)
    : null;

  // Prefer Nominatim for address fields (much more accurate than IP geo providers)
  const city = nominatim?.city || geo.city || null;
  const region = nominatim?.region || geo.region || null;
  const postalCode = nominatim?.postalCode || geo.postalCode || null;
  const latitude = geo.latitude;
  const longitude = geo.longitude;

  const internalFlags = analyzeInternalFlags({
    isp: geo.isp,
    asn: geo.asn,
    usageType: ip2loc.usageType,
    reverseDns,
    openPorts,
    isTorNode,
  });

  const intelligence = analyzeIpQuality({
    exitIp,
    country: geo.country,
    city,
    isp: geo.isp,
    asn: geo.asn,
    usageType: ip2loc.usageType,
    fraudScore: scam.fraudScore,
    fraudRisk: scam.fraudRisk,
    internalFlags,
    reverseDns,
    isTorNode,
    openPorts,
  });

  const provider = detectProxyProvider({
    asn: geo.asn, isp: geo.isp, reverseDns, host,
  });

  return {
    proxyString,
    working: true,
    exitIp,
    exitIpVersion,
    country: geo.country,
    city,
    region,
    postalCode,
    latitude,
    longitude,
    isp: geo.isp,
    asn: geo.asn,
    usageType: ip2loc.usageType,
    fraudScore: scam.fraudScore,
    fraudRisk: scam.fraudRisk,
    error: null,
    intelligence,
    internalFlags,
    reverseDns,
    openPorts,
    isTorNode,
    latencyMs,
    anonymityLevel,
    provider,
  };
}


// ─── ip-api.com rate-limit-aware queue ────────────────────────────────────────
// Free tier: 45 req/min. Queue processes calls sequentially and respects
// the X-Rl (remaining) and X-Ttl (seconds to reset) headers returned by the API.
class IpApiQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = false;
  private lastCallAt = 0;
  private readonly minIntervalMs = 50; // High speed fallback, practically no delay

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await fn()); } catch (e) { reject(e); }
      });
      this.drain();
    });
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const wait = Math.max(0, this.lastCallAt + this.minIntervalMs - Date.now());
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      const task = this.queue.shift()!;
      this.lastCallAt = Date.now();
      await task();
    }
    this.running = false;
  }
}

const ipApiQueue = new IpApiQueue();

type GeoResult = {
  country: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  isp: string | null;
  asn: string | null;
};

const IP_API_FIELDS = "country,city,regionName,zip,isp,as,lat,lon,status,message";

async function doIpApiCall(ip: string): Promise<GeoResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=${IP_API_FIELDS}`, { signal: controller.signal });
    clearTimeout(timer);

    const data = await res.json() as any;

    if (data.status === "fail" && data.message === "ratelimit") {
      return { country: null, city: null, region: null, postalCode: null, latitude: null, longitude: null, isp: null, asn: null };
    }

    if (data.status === "success") return parseGeoResponse(data);
    return { country: null, city: null, region: null, postalCode: null, latitude: null, longitude: null, isp: null, asn: null };
  } catch {
    clearTimeout(timer);
    return { country: null, city: null, region: null, postalCode: null, latitude: null, longitude: null, isp: null, asn: null };
  }
}

function parseGeoResponse(data: any): GeoResult {
  const asRaw: string = data.as || "";
  const asnMatch = asRaw.match(/^(AS\d+)/i);
  const asn = asnMatch ? asnMatch[1].toUpperCase() : (asRaw || null);
  return {
    country: data.country || null,
    city: data.city || null,
    region: data.regionName || null,
    postalCode: data.zip || null,
    latitude: data.lat != null ? parseFloat(data.lat) : null,
    longitude: data.lon != null ? parseFloat(data.lon) : null,
    isp: data.isp || null,
    asn: asn || null,
  };
}

// ─── Geo Lookup: FreelanceAPI primary + free fallbacks ────────────────────────
// FAST_MODE-aware fetch helpers (Vercel Hobby = 10s budget)
const FAST_TIMEOUT = FAST_MODE ? 4000 : 8000;
const TOR_FETCH_TIMEOUT = FAST_MODE ? 3000 : 8000;
const REVERSE_GEO_TIMEOUT = FAST_MODE ? 3000 : 6000;

async function fetchGeoData(ip: string): Promise<GeoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FAST_TIMEOUT);

  // #1 — freeipapi.app
  const freelpApi = async (): Promise<GeoResult> => {
    const key = process.env.FREELPAPI_KEY;
    if (!key) throw new Error("no key");
    const res = await fetch(`https://api.freeipapi.app/api/v1/lookup?ip=${ip}`, {
      headers: { "Authorization": `Bearer ${key}`, "Accept": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;
    if (data && (data.country || data.countryName)) {
      return {
        country: data.country || data.countryName || null,
        city: data.cityName || data.city || null,
        region: data.regionName || data.region || null,
        postalCode: data.zipCode || data.zip || data.postalCode || null,
        latitude: data.latitude != null ? parseFloat(data.latitude) : null,
        longitude: data.longitude != null ? parseFloat(data.longitude) : null,
        isp: data.isp || data.asnOrganization || data.org || null,
        asn: data.asn ? `AS${data.asn}` : null,
      };
    }
    throw new Error("fail");
  };

  // #2 — ip-api.com via rate-limit queue (free, 45/min)
  const ipApiPrimary = async (): Promise<GeoResult> => {
    const res = await ipApiQueue.enqueue(() => doIpApiCall(ip));
    if (res && res.country) return res;
    throw new Error("fail");
  };

  // #3 — ipwho.is (10k/month free)
  const ipWhoIs = async (): Promise<GeoResult> => {
    const res = await fetch(`https://ipwho.is/${ip}`, { signal: controller.signal });
    const data = await res.json() as any;
    if (data && data.success && data.country) {
      return {
        country: data.country || null,
        city: data.city || null,
        region: data.region || null,
        postalCode: data.postal || null,
        latitude: data.latitude != null ? parseFloat(data.latitude) : null,
        longitude: data.longitude != null ? parseFloat(data.longitude) : null,
        isp: data.connection?.isp || null,
        asn: data.connection?.asn ? `AS${data.connection.asn}` : null,
      };
    }
    throw new Error("fail");
  };

  // #4 — ipapi.co (1k/day free)
  const ipapiCo = async (): Promise<GeoResult> => {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
    const data = await res.json() as any;
    if (data && data.country_name) {
      return {
        country: data.country_name || null,
        city: data.city || null,
        region: data.region || null,
        postalCode: data.postal || null,
        latitude: data.latitude != null ? parseFloat(data.latitude) : null,
        longitude: data.longitude != null ? parseFloat(data.longitude) : null,
        isp: data.org || null,
        asn: data.asn || null,
      };
    }
    throw new Error("fail");
  };

  // #5 — geoplugin.net (completely free, no limits)
  const geoPlugin = async (): Promise<GeoResult> => {
    const res = await fetch(`http://www.geoplugin.net/json.gp?ip=${ip}`, { signal: controller.signal });
    const data = await res.json() as any;
    if (data && data.geoplugin_countryName) {
      return {
        country: data.geoplugin_countryName || null,
        city: data.geoplugin_city || null,
        region: data.geoplugin_regionName || null,
        postalCode: data.geoplugin_zipcode || null,
        latitude: data.geoplugin_latitude != null ? parseFloat(data.geoplugin_latitude) : null,
        longitude: data.geoplugin_longitude != null ? parseFloat(data.geoplugin_longitude) : null,
        isp: null,
        asn: null,
      };
    }
    throw new Error("fail");
  };

  const wrap = (name: string, fn: () => Promise<GeoResult>) =>
    fn().then(r => { console.log(`[geo] ${ip} won: ${name}`); return r; })
        .catch(e => { console.log(`[geo] ${ip} failed: ${name} → ${e?.message?.slice(0,60)}`); throw e; });

  try {
    const result = await Promise.any([
      wrap("freeipapi", freelpApi),
      wrap("ip-api-queue", ipApiPrimary),
      wrap("ipwho.is", ipWhoIs),
      wrap("ipapi.co", ipapiCo),
      wrap("geoplugin", geoPlugin),
    ]);
    clearTimeout(timeout);
    return result;
  } catch (e: any) {
    clearTimeout(timeout);
    console.log(`[geo] ${ip} ALL FAILED:`, e?.message);
    return { country: null, city: null, region: null, postalCode: null, latitude: null, longitude: null, isp: null, asn: null };
  }
}

// ─── BigDataCloud Reverse Geocoding (free, no API key, no rate limit) ─────────
// Returns accurate city / state / postal code from lat/lon.
// Also fetches richer locality info to build an approximate "street area".
type ReverseGeoResult = {
  city: string | null;
  region: string | null;
  postalCode: string | null;
};

async function fetchReverseGeocode(lat: number, lon: number): Promise<ReverseGeoResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVERSE_GEO_TIMEOUT);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`[reverse-geo] ${lat},${lon} HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as any;

    const city = data.city || data.locality || null;
    const region = data.principalSubdivision || null;
    const postalCode = data.postcode || null;

    if (!city && !region && !postalCode) return null;
    return { city, region, postalCode };
  } catch (e: any) {
    console.log(`[reverse-geo] ${lat},${lon} error: ${e?.message?.slice(0, 60)}`);
    return null;
  }
}

// ─── TOR Exit Node Cache ──────────────────────────────────────────────────────
let torExitNodes: Set<string> = new Set();
let torCacheTime = 0;
const TOR_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getTorExitNodes(): Promise<Set<string>> {
  if (Date.now() - torCacheTime < TOR_CACHE_TTL && torExitNodes.size > 0) return torExitNodes;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TOR_FETCH_TIMEOUT);
    const res = await fetch("https://check.torproject.org/torbulkexitlist", { signal: controller.signal });
    clearTimeout(t);
    const text = await res.text();
    torExitNodes = new Set(text.split("\n").map(l => l.trim()).filter(l => /^\d+\.\d+\.\d+\.\d+$/.test(l)));
    torCacheTime = Date.now();
    console.log(`[tor] Cached ${torExitNodes.size} exit nodes`);
  } catch (e) {
    console.log("[tor] Failed to fetch exit list:", (e as any)?.message);
  }
  return torExitNodes;
}

// ─── Reverse DNS / PTR Record ─────────────────────────────────────────────────
async function fetchReverseDNS(ip: string): Promise<string | null> {
  try {
    const hosts = await Promise.race<string[]>([
      dnsReverse(ip),
      new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    return hosts && hosts.length > 0 ? hosts[0] : null;
  } catch {
    return null;
  }
}

// ─── Open Proxy Port Probe ────────────────────────────────────────────────────
const PROXY_PORTS = [3128, 8080, 1080, 8888, 9050, 8118];

async function probePort(ip: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (result: boolean) => {
      sock.destroy();
      resolve(result);
    };
    sock.setTimeout(1500);
    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
    sock.connect(port, ip);
  });
}

async function probeOpenPorts(ip: string): Promise<number[]> {
  const results = await Promise.all(PROXY_PORTS.map(port => probePort(ip, port).then(open => open ? port : null)));
  return results.filter((p): p is number => p !== null);
}

async function curlFetch(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FAST_MODE ? FETCH_TIMEOUT : FETCH_TIMEOUT + 2000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

async function fetchScamalytics(ip: string): Promise<{ fraudScore: string | null; fraudRisk: string | null }> {
  // Try real Scamalytics API first if credentials are configured.
  const scamUser = process.env.SCAMALYTICS_USERNAME;
  const scamKey = process.env.SCAMALYTICS_KEY;
  if (scamUser && scamKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const res = await fetch(
        `https://api11.scamalytics.com/v3/${encodeURIComponent(scamUser)}/?key=${encodeURIComponent(scamKey)}&ip=${ip}`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json() as any;
        const sc = json?.scamalytics || {};
        if (sc.status === "ok") {
          const score = typeof sc.scamalytics_score === "number" ? sc.scamalytics_score : parseInt(sc.scamalytics_score);
          const riskRaw: string = (sc.scamalytics_risk || "").toString();
          if (!isNaN(score)) {
            const fraudRisk = riskRaw
              ? riskRaw.charAt(0).toUpperCase() + riskRaw.slice(1).toLowerCase()
              : (score >= 75 ? "Very High" : score >= 50 ? "High" : score >= 25 ? "Medium" : "Low");
            console.log(`[fraud] ${ip} (scamalytics) score=${score} risk=${fraudRisk}`);
            return { fraudScore: String(score), fraudRisk };
          }
        }
        console.log(`[fraud] ${ip} (scamalytics) bad response: ${JSON.stringify(json).slice(0, 160)}`);
      } else {
        console.log(`[fraud] ${ip} (scamalytics) HTTP ${res.status}`);
      }
    } catch (e: any) {
      console.log(`[fraud] ${ip} (scamalytics) error: ${e?.message?.slice(0, 80)}`);
    }
    // fall through to proxycheck.io fallback below
  }

  // Fallback: proxycheck.io free tier (no key, ~100/day limit)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(`https://proxycheck.io/v2/${ip}?risk=1&vpn=1`, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`[fraud] ${ip} HTTP ${res.status}`);
      return { fraudScore: null, fraudRisk: null };
    }
    const json = await res.json() as Record<string, unknown>;
    if (json.status !== "ok") {
      console.log(`[fraud] ${ip} status=${json.status} msg=${(json.message as string || "").slice(0, 80)}`);
      return { fraudScore: null, fraudRisk: null };
    }
    const data = json[ip] as Record<string, unknown> | undefined;
    if (!data) {
      console.log(`[fraud] ${ip} no data block (keys: ${Object.keys(json).join(",")})`);
      return { fraudScore: null, fraudRisk: null };
    }
    const risk = typeof data.risk === "number" ? data.risk : null;
    if (risk === null) {
      console.log(`[fraud] ${ip} no risk field (data keys: ${Object.keys(data).join(",")})`);
      return { fraudScore: null, fraudRisk: null };
    }
    const fraudRisk =
      risk >= 75 ? "Very High" :
      risk >= 50 ? "High" :
      risk >= 25 ? "Medium" : "Low";
    console.log(`[fraud] ${ip} risk=${risk} → ${fraudRisk}`);
    return { fraudScore: String(risk), fraudRisk };
  } catch (e: any) {
    console.log(`[fraud] ${ip} error: ${e?.message?.slice(0, 80)}`);
    return { fraudScore: null, fraudRisk: null };
  }
}

const USAGE_TYPE_MAP: Record<string, string> = {
  "COM": "Commercial",
  "ORG": "Organization",
  "GOV": "Government",
  "MIL": "Military",
  "EDU": "University/College/School",
  "LIB": "Library",
  "CDN": "Content Delivery Network",
  "ISP": "Fixed Line ISP",
  "MOB": "Mobile ISP",
  "DCH": "Data Center/Web Hosting/Transit",
  "SES": "Search Engine Spider",
  "RSV": "Reserved",
};

async function fetchIP2Location(ip: string): Promise<{ usageType: string | null }> {
  try {
    const html = await curlFetch(`https://www.ip2location.com/demo/${ip}`);
    if (!html) throw new Error("Empty response");

    let usageType: string | null = null;

    const usageMatch = html.match(/"usage_type"\s*:\s*"([^"]+)"/);
    if (usageMatch) {
      const code = usageMatch[1].trim();
      usageType = USAGE_TYPE_MAP[code]
        ? `(${code}) ${USAGE_TYPE_MAP[code]}`
        : code;
    }

    if (!usageType) {
      const $ = cheerio.load(html);
      $("tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length >= 2) {
          const label = $(cells[0]).text().trim().toLowerCase();
          if (label.includes("usage type") && !label.includes("proxy") && !label.includes("as ")) {
            usageType = $(cells[1]).text().trim();
          }
        }
      });
    }

    return { usageType: usageType || "COM (Commercial)" };
  } catch {
    return { usageType: "COM (Commercial)" };
  }
}

async function processWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  maxConcurrent: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrent, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Single IP lookup — no proxy needed, just gathers full intelligence on a raw IP
  app.post("/api/lookup-ip", async (req, res) => {
    try {
      const { ip } = req.body ?? {};
      const result = await lookupIp(ip);
      if (!("working" in result)) return res.status(400).json(result);
      return res.json({ result });
    } catch (err: any) {
      console.error("Error in IP lookup:", err);
      return res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // Single-proxy endpoint — Vercel-friendly (one proxy per request, fits in <10s)
  app.post("/api/check-proxy", async (req, res) => {
    try {
      const { proxy } = req.body ?? {};
      if (!proxy || typeof proxy !== "string") {
        return res.status(400).json({ error: "Missing 'proxy' string in body." });
      }
      const result = await checkSingleProxy(proxy);
      return res.json({ result });
    } catch (err: any) {
      console.error("Error checking single proxy:", err);
      return res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.post("/api/check-proxies", async (req, res) => {
    try {
      const parsed = proxyInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid input. Provide an array of 1-200 proxy strings.",
          details: parsed.error.issues,
        });
      }

      const { proxies } = parsed.data;
      const uniqueProxies = Array.from(new Set(proxies.filter((p) => p.trim().length > 0)));

      if (uniqueProxies.length === 0) {
        return res.status(400).json({ error: "No valid proxy strings provided." });
      }

      const results = await processWithConcurrency(
        uniqueProxies,
        checkSingleProxy,
        MAX_CONCURRENT
      );

      return res.json({ results });
    } catch (err: any) {
      console.error("Error checking proxies:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Streaming SSE route — results appear one by one as each proxy is checked
  app.post("/api/check-proxies-stream", async (req, res) => {
    try {
      const parsed = proxyInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input. Provide an array of 1-200 proxy strings." });
      }

      const { proxies } = parsed.data;
      const uniqueProxies = Array.from(new Set(proxies.filter((p) => p.trim().length > 0)));

      if (uniqueProxies.length === 0) {
        return res.status(400).json({ error: "No valid proxy strings provided." });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const sendEvent = (payload: object) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      sendEvent({ type: "total", total: uniqueProxies.length });

      let nextIndex = 0;
      async function worker() {
        while (nextIndex < uniqueProxies.length) {
          const idx = nextIndex++;
          const result = await checkSingleProxy(uniqueProxies[idx]);
          sendEvent({ type: "result", result });
        }
      }

      const workers = Array.from(
        { length: Math.min(MAX_CONCURRENT, uniqueProxies.length) },
        () => worker()
      );
      await Promise.all(workers);

      sendEvent({ type: "done" });
      res.end();
    } catch (err: any) {
      console.error("Error in streaming check:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
        res.end();
      }
    }
  });

  // ── Real IP Stability Test (parallel batch — Vercel-friendly, returns single JSON) ──
  app.post("/api/test-ip-stability", async (req, res) => {
    try {
      const { proxy, count = 12 } = req.body ?? {};
      const result = await runIpStabilityTest(proxy, count);
      if ("error" in result) return res.status(400).json(result);
      return res.json(result);
    } catch (err: any) {
      console.error("Error in stability test:", err);
      return res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  return httpServer;
}

// ─── Single IP lookup (no proxy) — for "IP Lookup" mode ──────────────────────
export async function lookupIp(ip: string): Promise<ProxyResult | { error: string }> {
  if (!ip || typeof ip !== "string") return { error: "Missing 'ip'" };
  const cleaned = ip.trim();
  // Basic IPv4 / IPv6 validation
  const isV4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(cleaned);
  const isV6 = cleaned.includes(":") && /^[0-9a-fA-F:]+$/.test(cleaned);
  if (!isV4 && !isV6) return { error: "Invalid IP address" };

  const exitIpVersion: "v4" | "v6" = isV6 ? "v6" : "v4";

  // Same global parallel budget as proxy check — keeps lookupIp under Vercel Hobby 10s cap.
  const LOOKUP_PARALLEL_BUDGET = FAST_MODE ? 7000 : 9000;
  const lookupBudgetGuard = (p: Promise<any>): Promise<any> =>
    Promise.race([p, new Promise(resolve => setTimeout(() => resolve(undefined), LOOKUP_PARALLEL_BUDGET))]);

  const [geoData, scamalyticsData, ip2locationData, rdnsResult, torNodes, openPortsResult] =
    await Promise.allSettled([
      fetchGeoData(cleaned),
      fetchScamalytics(cleaned),
      fetchIP2Location(cleaned),
      fetchReverseDNS(cleaned),
      getTorExitNodes(),
      probeOpenPorts(cleaned),
    ].map(lookupBudgetGuard));

  const geo = (geoData.status === "fulfilled" && geoData.value)
    ? geoData.value
    : { country: null, city: null, region: null, postalCode: null, latitude: null, longitude: null, isp: null, asn: null };
  const scam = (scamalyticsData.status === "fulfilled" && scamalyticsData.value) ? scamalyticsData.value : { fraudScore: null, fraudRisk: null };
  const ip2loc = (ip2locationData.status === "fulfilled" && ip2locationData.value) ? ip2locationData.value : { usageType: null };
  const reverseDns = rdnsResult.status === "fulfilled" ? rdnsResult.value ?? null : null;
  const torSet = (torNodes.status === "fulfilled" && torNodes.value) ? torNodes.value : new Set<string>();
  const openPorts = (openPortsResult.status === "fulfilled" && openPortsResult.value) ? openPortsResult.value : [];
  const isTorNode = torSet.has(cleaned);

  const nominatim = (!FAST_MODE && geo.latitude != null && geo.longitude != null)
    ? await fetchReverseGeocode(geo.latitude, geo.longitude)
    : null;

  const city = nominatim?.city || geo.city || null;
  const region = nominatim?.region || geo.region || null;
  const postalCode = nominatim?.postalCode || geo.postalCode || null;

  const internalFlags = analyzeInternalFlags({
    isp: geo.isp, asn: geo.asn, usageType: ip2loc.usageType, reverseDns, openPorts, isTorNode,
  });

  const intelligence = analyzeIpQuality({
    exitIp: cleaned, country: geo.country, city, isp: geo.isp, asn: geo.asn,
    usageType: ip2loc.usageType, fraudScore: scam.fraudScore, fraudRisk: scam.fraudRisk,
    internalFlags, reverseDns, isTorNode, openPorts,
  });

  return {
    proxyString: cleaned,
    working: true,
    exitIp: cleaned,
    exitIpVersion,
    country: geo.country,
    city, region, postalCode,
    latitude: geo.latitude,
    longitude: geo.longitude,
    isp: geo.isp,
    asn: geo.asn,
    usageType: ip2loc.usageType,
    fraudScore: scam.fraudScore,
    fraudRisk: scam.fraudRisk,
    error: null,
    intelligence,
    internalFlags,
    reverseDns,
    openPorts,
    isTorNode,
    latencyMs: null,
    anonymityLevel: null,
    provider: detectProxyProvider({ asn: geo.asn, isp: geo.isp, reverseDns, host: null }),
  };
}

// Reusable IP stability test (parallel) — used by Express route AND Vercel serverless function
export interface IpStabilityRequest { index: number; total: number; ip: string | null; ms: number; changed: boolean; error?: string }
export interface IpStabilityResult {
  requests: IpStabilityRequest[];
  stable: boolean;
  uniqueIps: string[];
  changedAtRequest: number | null;
  totalRequests: number;
  successCount: number;
}

export async function runIpStabilityTest(
  proxy: string,
  count: number = 12
): Promise<IpStabilityResult | { error: string }> {
  if (!proxy || typeof proxy !== "string") return { error: "Missing proxy" };
  // Cap at 8 on Vercel Hobby — 12+ parallel sockets through one proxy can exceed 10s
  const maxRequests = FAST_MODE ? 8 : 15;
  const defaultRequests = FAST_MODE ? 6 : 12;
  const requested = parseInt(String(count)) || defaultRequests;
  const numRequests = Math.min(Math.max(requested, 3), maxRequests);
  const parsed = parseProxyString(proxy);
  if (!parsed) return { error: "Invalid proxy string" };

  const { host, port, username, password } = parsed;
  const hostForUrl = isIPv6Address(host) ? `[${host}]` : host;
  const proxyUrl = username && password
    ? `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${hostForUrl}:${port}`
    : `http://${hostForUrl}:${port}`;

  const probe = async (i: number): Promise<IpStabilityRequest> => {
    const t0 = Date.now();
    try {
      const agent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });
      const { body: raw } = await httpsGetViaProxy("https://api64.ipify.org?format=json", agent);
      const ms = Date.now() - t0;
      let ip: string | null = null;
      try { ip = (JSON.parse(raw) as { ip: string }).ip; } catch { /* skip */ }
      if (!ip) throw new Error("Could not parse IP from response");
      return { index: i + 1, total: numRequests, ip, ms, changed: false };
    } catch (err: any) {
      return { index: i + 1, total: numRequests, ip: null, ms: Date.now() - t0, error: err.message };
    }
  };

  // Parallel execution — fits within Vercel 10s timeout (max time = single request)
  const requests = await Promise.all(Array.from({ length: numRequests }, (_, i) => probe(i)));
  requests.sort((a, b) => a.index - b.index);

  const seenIps = requests.filter(r => r.ip).map(r => r.ip!) as string[];
  const firstIp = seenIps[0] ?? null;
  let changedAtRequest: number | null = null;
  for (const r of requests) {
    if (r.ip && firstIp && r.ip !== firstIp) {
      r.changed = true;
      if (changedAtRequest === null) changedAtRequest = r.index;
    }
  }
  const uniqueIps = [...new Set(seenIps)];
  return {
    requests,
    stable: uniqueIps.length <= 1,
    uniqueIps,
    changedAtRequest,
    totalRequests: numRequests,
    successCount: seenIps.length,
  };
}
