export const config = { maxDuration: 10 };

async function checkProxyViaApi(proxy: string, index: number) {
  const parts = proxy.trim().split(':');
  if (parts.length < 2) {
    return {
      proxyString: proxy, working: false, exitIp: null, exitIpVersion: null,
      country: null, city: null, region: null, postalCode: null,
      latitude: null, longitude: null, isp: null, asn: null,
      usageType: null, fraudScore: null, fraudRisk: null,
      error: 'Invalid format', intelligence: null, internalFlags: null,
      reverseDns: null, openPorts: [], isTorNode: false,
      latencyMs: null, anonymityLevel: null, provider: null, changed: false
    };
  }

  const [host, port] = parts;
  const start = Date.now();

  try {
    // Step 1: Resolve domain to IP
    let resolvedIp = host;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      try {
        const dnsRes = await fetch(`https://dns.google/resolve?name=${host}&type=A`);
        const dnsData = await dnsRes.json();
        if (dnsData.Answer && dnsData.Answer.length > 0) {
          resolvedIp = dnsData.Answer[0].data;
        }
      } catch {}
    }

    // Step 2: proxycheck.io se check karo
    const checkController = new AbortController();
    const checkTimeout = setTimeout(() => checkController.abort(), 7000);

    const checkRes = await fetch(
      `https://proxycheck.io/v2/${resolvedIp}?vpn=1&risk=1&port=${port}&seen=1`,
      { signal: checkController.signal }
    );
    clearTimeout(checkTimeout);
    const checkData = await checkRes.json();
    const ipData = checkData[resolvedIp] || {};

    const isProxy = ipData.proxy === 'yes';
    const portOpen = isProxy || ipData.port === parseInt(port);
    const latencyMs = Date.now() - start;

    // Step 3: ip-api.com se geo info
    const geoController = new AbortController();
    const geoTimeout = setTimeout(() => geoController.abort(), 5000);
    const geoRes = await fetch(
      `http://ip-api.com/json/${resolvedIp}?fields=status,country,city,regionName,zip,isp,as,lat,lon,proxy,hosting`,
      { signal: geoController.signal }
    );
    clearTimeout(geoTimeout);
    const geo = await geoRes.json();

    const asRaw: string = geo.as || '';
    const asnMatch = asRaw.match(/^(AS\d+)/i);
    const asn = asnMatch ? asnMatch[1].toUpperCase() : (asRaw || null);

    const fraudScore = ipData.risk ? String(ipData.risk) : (isProxy ? '75' : '10');
    const fraudRisk = ipData.risk
      ? (ipData.risk >= 75 ? 'Very High' : ipData.risk >= 50 ? 'High' : ipData.risk >= 25 ? 'Medium' : 'Low')
      : (isProxy ? 'High' : 'Low');

    return {
      proxyString: proxy,
      working: portOpen,
      exitIp: resolvedIp,
      exitIpVersion: resolvedIp.includes(':') ? 'v6' : 'v4',
      country: ipData.country || geo.country || null,
      city: ipData.city || geo.city || null,
      region: ipData.region || geo.regionName || null,
      postalCode: geo.zip || null,
      latitude: geo.lat || null,
      longitude: geo.lon || null,
      isp: ipData.provider || geo.isp || null,
      asn: asn || null,
      usageType: ipData.type || (geo.hosting ? '(DCH) Data Center/Web Hosting/Transit' : '(COM) Commercial'),
      fraudScore,
      fraudRisk,
      error: portOpen ? null : 'Port closed or unreachable',
      intelligence: null,
      internalFlags: null,
      reverseDns: null,
      openPorts: portOpen ? [parseInt(port)] : [],
      isTorNode: ipData.type === 'TOR' || false,
      latencyMs: portOpen ? latencyMs : null,
      anonymityLevel: ipData.anonymity || (isProxy ? 'anonymous' : 'transparent'),
      provider: ipData.provider || null,
      changed: false
    };
  } catch (err: any) {
    return {
      proxyString: proxy, working: false, exitIp: null, exitIpVersion: null,
      country: null, city: null, region: null, postalCode: null,
      latitude: null, longitude: null, isp: null, asn: null,
      usageType: null, fraudScore: null, fraudRisk: null,
      error: err.name === 'AbortError' ? 'Timeout' : 'Connection failed',
      intelligence: null, internalFlags: null, reverseDns: null,
      openPorts: [], isTorNode: false, latencyMs: null,
      anonymityLevel: null, provider: null, changed: false
    };
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const { proxy } = body;
    if (!proxy || typeof proxy !== 'string') {
      return res.status(400).json({ error: "Missing 'proxy' string in body." });
    }
    const result = await checkProxyViaApi(proxy, 0);
    return res.status(200).json({ result });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
