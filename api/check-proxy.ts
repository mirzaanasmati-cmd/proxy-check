export const config = { maxDuration: 10 };

async function resolveHost(host: string): Promise<string> {
  try {
    // Use DNS over HTTPS to resolve domain to IP
    const res = await fetch(`https://dns.google/resolve?name=${host}&type=A`);
    const data = await res.json();
    if (data.Answer && data.Answer.length > 0) {
      return data.Answer[0].data;
    }
  } catch {}
  return host;
}

async function checkProxyViaApi(proxy: string, index: number) {
  const parts = proxy.trim().split(':');
  if (parts.length < 2) {
    return { index, ip: proxy, port: '', status: 'dead', error: 'Invalid format', changed: false };
  }

  const [host, port, username, password] = parts;
  const start = Date.now();

  try {
    // Resolve domain to IP if needed
    const ip = host.match(/^\d+\.\d+\.\d+\.\d+$/) ? host : await resolveHost(host);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,city,isp,proxy,hosting,query`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const responseTime = Date.now() - start;

    if (!response.ok) {
      return { index, ip: host, port, username, password, status: 'dead', error: 'API error', changed: false };
    }

    const data = await response.json();

    if (data.status === 'fail') {
      return { index, ip: host, port, username, password, status: 'dead', error: 'IP lookup failed', changed: false };
    }

    return {
      index,
      ip: host,
      port,
      username,
      password,
      status: 'working',
      responseTime,
      country: data.country,
      city: data.city,
      isp: data.isp,
      anonymityLevel: data.proxy ? 'Anonymous' : 'Transparent',
      isVpn: data.proxy || false,
      isDatacenter: data.hosting || false,
      isTor: false,
      fraudScore: data.proxy ? 75 : 10,
      changed: false,
    };
  } catch (err: any) {
    return {
      index,
      ip: host,
      port,
      username,
      password,
      status: 'dead',
      error: err.name === 'AbortError' ? 'Timeout' : 'Connection failed',
      changed: false,
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
    const { proxies, proxy } = body;

    if (proxy && typeof proxy === 'string') {
      const result = await checkProxyViaApi(proxy, 0);
      return res.status(200).json({ result });
    }

    if (!proxies || !Array.isArray(proxies)) {
      return res.status(400).json({ error: 'Send proxies array or single proxy string' });
    }

    const results = [];
    const batchSize = 5;

    for (let i = 0; i < proxies.length; i += batchSize) {
      const batch = proxies.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((p: string, bi: number) => checkProxyViaApi(p, i + bi))
      );
      results.push(...batchResults);
      if (i + batchSize < proxies.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return res.status(200).json({ results });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
