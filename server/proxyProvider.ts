// Proxy provider detection — identifies known commercial proxy services
// from ASN, ISP, reverse DNS, or proxy gateway hostname patterns.

export interface ProxyProviderInfo {
  name: string;
  type: "residential" | "datacenter" | "isp" | "mobile" | "mixed";
  confidence: "high" | "medium" | "low";
  evidence: string;
}

interface ProviderRule {
  name: string;
  type: ProxyProviderInfo["type"];
  asns?: string[];                 // exact ASN match (case-insensitive)
  ispPatterns?: RegExp[];          // ISP name match
  ptrPatterns?: RegExp[];          // reverse DNS match
  hostPatterns?: RegExp[];         // proxy gateway hostname match
}

const PROVIDERS: ProviderRule[] = [
  {
    name: "Bright Data (Luminati)",
    type: "mixed",
    asns: ["AS212238"],
    ispPatterns: [/bright\s*data/i, /luminati/i, /datacamp/i],
    ptrPatterns: [/lum-/i, /\.brd\./i, /brightdata/i, /luminati/i],
    hostPatterns: [/brd\.superproxy\.io/i, /lum-superproxy/i, /brightdata/i, /luminati/i],
  },
  {
    name: "Oxylabs",
    type: "mixed",
    ispPatterns: [/oxylabs/i, /uab\s+tesonet/i],
    ptrPatterns: [/oxylabs/i],
    hostPatterns: [/oxylabs\.io/i, /pr\.oxylabs/i, /dc\.oxylabs/i],
  },
  {
    name: "Smartproxy",
    type: "mixed",
    ispPatterns: [/smartproxy/i, /tesonet/i],
    hostPatterns: [/smartproxy\.com/i, /smart-proxy/i, /gate\.smartproxy/i, /dc\.smartproxy/i],
  },
  {
    name: "IPRoyal",
    type: "mixed",
    asns: ["AS62282", "AS49981"],
    ispPatterns: [/ip\s*royal/i, /iproyal/i],
    hostPatterns: [/iproyal\.com/i, /geo\.iproyal/i],
  },
  {
    name: "SOAX",
    type: "residential",
    ispPatterns: [/soax/i],
    hostPatterns: [/soax\.com/i, /proxy\.soax/i],
  },
  {
    name: "Webshare",
    type: "datacenter",
    asns: ["AS54574"],
    ispPatterns: [/webshare/i, /prime\s*webshare/i],
    hostPatterns: [/webshare\.io/i, /\.webshare\./i],
  },
  {
    name: "NetNut",
    type: "residential",
    ispPatterns: [/netnut/i, /divinetworks/i, /divi\s*networks/i],
    hostPatterns: [/netnut\.io/i, /gw\.netnut/i],
  },
  {
    name: "Rayobyte (Blazing SEO)",
    type: "datacenter",
    asns: ["AS401116"],
    ispPatterns: [/rayobyte/i, /blazing\s*seo/i, /reliablesite/i],
    hostPatterns: [/rayobyte\.com/i, /blazingseo/i],
  },
  {
    name: "PacketStream",
    type: "residential",
    ispPatterns: [/packet\s*stream/i],
    hostPatterns: [/packetstream\.io/i, /proxy\.packetstream/i],
  },
  {
    name: "ProxyEmpire",
    type: "residential",
    ispPatterns: [/proxy\s*empire/i],
    hostPatterns: [/proxyempire\.io/i],
  },
  {
    name: "ProxyRack",
    type: "mixed",
    ispPatterns: [/proxy\s*rack/i, /proxyrack/i],
    hostPatterns: [/proxyrack\.net/i, /proxyrack\.com/i],
  },
  {
    name: "Storm Proxies",
    type: "residential",
    ispPatterns: [/storm\s*proxies/i],
    hostPatterns: [/stormproxies\.com/i],
  },
  {
    name: "MyPrivateProxy",
    type: "datacenter",
    ispPatterns: [/myprivateproxy/i, /my\s*private\s*proxy/i],
    hostPatterns: [/myprivateproxy\.net/i],
  },
  {
    name: "SquidProxies",
    type: "datacenter",
    ispPatterns: [/squid\s*proxies/i],
    hostPatterns: [/squidproxies\.com/i],
  },
  {
    name: "Massive Networks",
    type: "residential",
    ispPatterns: [/massive\s*networks/i, /joinmassive/i],
    hostPatterns: [/joinmassive\.com/i],
  },
  {
    name: "GeoNode",
    type: "residential",
    ispPatterns: [/geonode/i, /geo\s*node/i],
    hostPatterns: [/geonode\.com/i, /proxy\.geonode/i],
  },
  {
    name: "Infatica",
    type: "residential",
    ispPatterns: [/infatica/i],
    hostPatterns: [/infatica\.io/i, /proxy\.infatica/i],
  },
  {
    name: "ScraperAPI",
    type: "datacenter",
    ispPatterns: [/scraper\s*api/i],
    hostPatterns: [/scraperapi\.com/i, /proxy-server\.scraperapi/i],
  },
  {
    name: "ZenRows",
    type: "datacenter",
    ispPatterns: [/zenrows/i],
    hostPatterns: [/zenrows\.com/i, /proxy\.zenrows/i],
  },
  {
    name: "ScrapingBee",
    type: "datacenter",
    hostPatterns: [/scrapingbee\.com/i, /app\.scrapingbee/i],
  },
  {
    name: "M247 (reseller infra)",
    type: "datacenter",
    asns: ["AS9009"],
    ispPatterns: [/^m247/i, /m247\s+(ltd|europe|uk)/i],
  },
  {
    name: "Datacamp Limited",
    type: "datacenter",
    asns: ["AS60068", "AS212238"],
    ispPatterns: [/datacamp/i, /cdn77/i],
  },
  {
    name: "IPDeep",
    type: "residential",
    ispPatterns: [/ip\s*deep/i, /ipdeep/i],
    hostPatterns: [/ipdeep\.com/i, /actgate\.ipdeep/i, /\.ipdeep\./i],
  },
  {
    name: "ProxyMesh",
    type: "datacenter",
    ispPatterns: [/proxy\s*mesh/i],
    hostPatterns: [/proxymesh\.com/i, /\.proxymesh\./i],
  },
  {
    name: "ProxyScrape",
    type: "mixed",
    ispPatterns: [/proxy\s*scrape/i],
    hostPatterns: [/proxyscrape\.com/i],
  },
  {
    name: "IPBurger",
    type: "mixed",
    ispPatterns: [/ip\s*burger/i, /ipburger/i],
    hostPatterns: [/ipburger\.com/i, /\.ipburger\./i],
  },
  {
    name: "Shifter (formerly Microleaves)",
    type: "residential",
    ispPatterns: [/shifter/i, /microleaves/i],
    hostPatterns: [/shifter\.io/i, /microleaves/i],
  },
  {
    name: "ProxyCheap",
    type: "mixed",
    ispPatterns: [/proxy\s*cheap/i, /proxycheap/i],
    hostPatterns: [/proxy-cheap\.com/i, /proxycheap\.com/i],
  },
  {
    name: "RoyalProxy",
    type: "residential",
    ispPatterns: [/royal\s*proxy/i],
    hostPatterns: [/royal-proxy\.com/i, /royalproxy/i],
  },
  {
    name: "AstroProxy",
    type: "mixed",
    ispPatterns: [/astro\s*proxy/i, /astroproxy/i],
    hostPatterns: [/astroproxy\.com/i],
  },
  {
    name: "Lunaproxy",
    type: "residential",
    ispPatterns: [/lunaproxy/i, /luna\s*proxy/i],
    hostPatterns: [/lunaproxy\.com/i, /lunaproxy\.io/i],
  },
  {
    name: "PIA Proxy",
    type: "residential",
    ispPatterns: [/pia\s*proxy/i, /piaproxy/i],
    hostPatterns: [/piaproxy\.com/i],
  },
  {
    name: "922 S5 Proxy",
    type: "residential",
    ispPatterns: [/922\s*s5/i, /922proxy/i],
    hostPatterns: [/922proxy\.com/i, /922s5\./i],
  },
  {
    name: "Roxlabs",
    type: "residential",
    ispPatterns: [/roxlabs/i, /rox\s*labs/i],
    hostPatterns: [/roxlabs\.io/i, /roxlabs\.cn/i],
  },
  {
    name: "ScraperAPI Pro",
    type: "datacenter",
    hostPatterns: [/scraperapi\.com/i, /api\.scraperapi/i],
  },
  {
    name: "BrightData (general)",
    type: "mixed",
    hostPatterns: [/superproxy\.io/i, /\.zproxy\./i],
  },
];

export function detectProxyProvider(input: {
  asn?: string | null;
  isp?: string | null;
  reverseDns?: string | null;
  host?: string | null;
}): ProxyProviderInfo | null {
  const { asn, isp, reverseDns, host } = input;
  const asnUp = (asn || "").toUpperCase();

  for (const p of PROVIDERS) {
    // ASN match → high confidence
    if (asnUp && p.asns?.some(a => a.toUpperCase() === asnUp)) {
      return { name: p.name, type: p.type, confidence: "high", evidence: `ASN ${asnUp}` };
    }
    // ISP name match → high confidence (brand names rarely false-positive)
    if (isp && p.ispPatterns?.some(rx => rx.test(isp))) {
      const matched = p.ispPatterns.find(rx => rx.test(isp));
      return { name: p.name, type: p.type, confidence: "high", evidence: `ISP "${isp}" matches ${matched}` };
    }
    // Proxy gateway hostname → high confidence (user explicitly used their endpoint)
    if (host && p.hostPatterns?.some(rx => rx.test(host))) {
      return { name: p.name, type: p.type, confidence: "high", evidence: `Gateway hostname "${host}"` };
    }
    // PTR / reverse DNS → medium confidence
    if (reverseDns && p.ptrPatterns?.some(rx => rx.test(reverseDns))) {
      return { name: p.name, type: p.type, confidence: "medium", evidence: `Reverse DNS "${reverseDns}"` };
    }
  }

  return null;
}
