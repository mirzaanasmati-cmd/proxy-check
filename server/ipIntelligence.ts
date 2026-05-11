import type { IpIntelligence, IpQualityReason, InternalFlags } from "@shared/schema";

const HIGH_RISK_ASNS = new Set([
  "AS62904", "AS9009", "AS16276", "AS14061", "AS13335", "AS20473",
  "AS63949", "AS396982", "AS398101", "AS55286", "AS36352", "AS46562",
  "AS62785", "AS30633", "AS46844", "AS197540", "AS51167", "AS62563",
  "AS208323", "AS41378", "AS212238", "AS206898", "AS24940", "AS59253",
  "AS60781", "AS202425", "AS44477", "AS210848", "AS49367", "AS35916",
]);

const TRUSTED_RESIDENTIAL_ISPS = [
  "comcast", "at&t", "verizon", "spectrum", "cox", "xfinity",
  "bt ", "sky broadband", "virgin media", "deutsche telekom",
  "vodafone", "orange", "telefonica", "rogers", "bell canada",
  "telus", "shaw", "ntt", "kddi", "softbank", "china telecom",
  "china unicom", "china mobile", "airtel", "jio", "bsnl",
  "optus", "telstra", "tpg", "claro", "telmex",
];

const MOBILE_ISPS = [
  "t-mobile", "tmobile", "sprint", "cricket", "boost mobile",
  "metro by t-mobile", "h2o", "straight talk", "simple mobile",
  "tracfone", "visible", "mint mobile", "google fi",
  "jio", "bsnl mobile", "idea", "vi ", "vodafone in", "airtel mobile",
  "mtn", "glo", "etisalat", "zong", "telenor", "jazz",
];

const CLOUD_HOSTING_ISPS = [
  "amazon", "aws", "google cloud", "microsoft azure", "digitalocean",
  "linode", "akamai", "vultr", "hetzner", "ovh", "contabo",
  "leaseweb", "choopa", "psychz", "servermania", "sharktech",
  "m247", "zenlayer", "colocrossing", "quadranet", "hostwinds",
  "ramnode", "buyvm", "frantech", "hostus", "online.net",
];

const HIGH_RISK_COUNTRIES = new Set([
  "Nigeria", "Russia", "Iran", "North Korea", "Syria",
  "Venezuela", "Cambodia", "Myanmar",
]);

const MODERATE_RISK_COUNTRIES = new Set([
  "China", "Ukraine", "Vietnam", "Pakistan", "Bangladesh", "Indonesia",
  "India", "Philippines", "Brazil", "Romania", "Bulgaria",
  "Turkey", "Thailand", "Mexico", "Colombia", "Egypt",
]);

const DATACENTER_PTR_PATTERNS = [
  /vultr/, /digitalocean/, /linode/, /amazonaws/, /compute.*amazon/,
  /hetzner/, /ovh/, /contabo/, /leaseweb/, /servermania/, /quadranet/,
  /m247/, /zenlayer/, /colocation/, /dedicated/, /server/, /hosting/,
  /static\.ip/, /vps/, /cloud/, /datacenter/, /data-center/, /node\d/,
];

const RESIDENTIAL_PTR_PATTERNS = [
  /dsl/, /cable/, /fiber/, /broadband/, /residential/, /home/, /dynamic/,
  /cpe/, /customer/, /pool/, /dhcp/, /client/, /subscriber/, /ppp/,
];

const VPN_PROXY_ISP_KEYWORDS = [
  "proxy", "vpn", "tunnel", "anonymize", "anonymous",
  "nordvpn", "expressvpn", "surfshark", "privatevpn", "mullvad",
  "hidemyass", "cyberghost", "windscribe", "protonvpn",
];

// ─── Internal Flag Analyzer ───────────────────────────────────────────────────
// Determines connection type using only data we collect ourselves:
// ASN, ISP name, PTR patterns, open ports, TOR list, IP2Location usage type
export function analyzeInternalFlags(params: {
  isp: string | null;
  asn: string | null;
  usageType: string | null;
  reverseDns: string | null;
  openPorts: number[];
  isTorNode: boolean;
}): InternalFlags {
  const ispLower = (params.isp || "").toLowerCase();
  const usageLower = (params.usageType || "").toLowerCase();
  const ptr = (params.reverseDns || "").toLowerCase();

  const isVpnIsp = VPN_PROXY_ISP_KEYWORDS.some(k => ispLower.includes(k));
  const isCloudIsp = CLOUD_HOSTING_ISPS.some(t => ispLower.includes(t));
  const isResidentialIsp = TRUSTED_RESIDENTIAL_ISPS.some(t => ispLower.includes(t));
  const isMobileIsp = MOBILE_ISPS.some(t => ispLower.includes(t));

  const isDatacenterUsage = usageLower.includes("dch") || usageLower.includes("data center") || usageLower.includes("hosting");
  const isResidentialUsage = usageLower.includes("isp") || usageLower.includes("fixed") || usageLower.includes("residential");
  const isMobileUsage = usageLower.includes("mob") || usageLower.includes("mobile");

  const isDatacenterPtr = ptr ? DATACENTER_PTR_PATTERNS.some(p => p.test(ptr)) : false;
  const isResidentialPtr = ptr ? RESIDENTIAL_PTR_PATTERNS.some(p => p.test(ptr)) : false;

  const hasHighRiskAsn = params.asn ? HIGH_RISK_ASNS.has(params.asn.toUpperCase()) : false;

  const isDatacenter = !!(isVpnIsp || isCloudIsp || isDatacenterUsage || (isDatacenterPtr && !isResidentialIsp) || hasHighRiskAsn);
  const isResidential = !!(!isDatacenter && (isResidentialIsp || isResidentialUsage || isResidentialPtr));
  const isMobile = !!(!isDatacenter && (isMobileIsp || isMobileUsage));

  const hasSuspiciousPTR = isDatacenterPtr && !isResidentialIsp;
  const hasOpenProxyPorts = params.openPorts.length > 0;

  let connectionType: InternalFlags["connectionType"];
  if (params.isTorNode) {
    connectionType = "datacenter";
  } else if (isVpnIsp) {
    connectionType = "datacenter";
  } else if (isMobile) {
    connectionType = "mobile";
  } else if (isResidential) {
    connectionType = "residential";
  } else if (isDatacenter) {
    connectionType = "datacenter";
  } else if (ispLower.includes("corporate") || ispLower.includes("enterprise") || ispLower.includes("business")) {
    connectionType = "corporate";
  } else {
    connectionType = "unknown";
  }

  const signalCount = [
    isVpnIsp, isCloudIsp, isDatacenterUsage, isResidentialIsp,
    isMobileIsp, isDatacenterPtr, isResidentialPtr, hasHighRiskAsn,
  ].filter(Boolean).length;
  const confidence: InternalFlags["confidence"] = signalCount >= 3 ? "high" : signalCount >= 1 ? "medium" : "low";

  return {
    connectionType,
    isDatacenter,
    isResidential,
    isMobile,
    hasSuspiciousPTR,
    hasOpenProxyPorts,
    isTorNode: params.isTorNode,
    confidence,
  };
}

export function analyzeIpQuality(params: {
  exitIp: string;
  country: string | null;
  city: string | null;
  isp: string | null;
  asn: string | null;
  usageType: string | null;
  fraudScore: string | null;
  fraudRisk: string | null;
  internalFlags: InternalFlags;
  reverseDns: string | null;
  isTorNode: boolean;
  openPorts: number[];
}): IpIntelligence {
  const reasons: IpQualityReason[] = [];
  let score = 72;

  const { internalFlags } = params;

  // ─── 1. TOR Exit Node ─────────────────────────────────────────────────────
  if (params.isTorNode) {
    score -= 48;
    reasons.push({ type: "negative", label: "TOR Exit Node Confirmed", detail: "This IP is on the official Tor Project exit node list — blocked by virtually all serious platforms worldwide" });
  }

  // ─── 2. Connection Type (Internal Detection) ──────────────────────────────
  if (internalFlags.connectionType === "residential") {
    score += 18;
    reasons.push({ type: "positive", label: "Residential Connection", detail: "Multiple signals confirm this is a genuine residential IP — appears as a legitimate home user, extremely hard to detect" });
  } else if (internalFlags.connectionType === "mobile") {
    score += 15;
    reasons.push({ type: "positive", label: "Mobile Carrier IP", detail: "Mobile carrier IP — shared across thousands of users, near-impossible to fingerprint as a proxy" });
  } else if (internalFlags.connectionType === "datacenter") {
    score -= 22;
    reasons.push({ type: "negative", label: "Datacenter / Hosting IP", detail: "Signals confirm this is a datacenter/hosting IP — immediately detectable as non-residential by fraud detection systems" });
  } else if (internalFlags.connectionType === "corporate") {
    score -= 6;
    reasons.push({ type: "warning", label: "Corporate Network", detail: "Corporate/business network detected — may trigger additional verification on consumer platforms" });
  } else {
    reasons.push({ type: "neutral", label: "Connection Type: Unknown", detail: "Could not definitively determine connection type from available signals — treat with caution" });
  }

  // ─── 3. Scamalytics Fraud Score ───────────────────────────────────────────
  const fraudRaw = params.fraudScore ? parseInt(params.fraudScore) : null;
  const fraud = fraudRaw !== null && Number.isFinite(fraudRaw) ? fraudRaw : null;
  if (fraud !== null) {
    if (fraud <= 5) {
      score += 12;
      reasons.push({ type: "positive", label: `Scamalytics Score: ${fraud}/100 (Excellent)`, detail: "Near-zero fraud signals on Scamalytics — this IP has an excellent reputation across their global database" });
    } else if (fraud <= 20) {
      score += 6;
      reasons.push({ type: "positive", label: `Scamalytics Score: ${fraud}/100 (Low)`, detail: "Low Scamalytics fraud risk — minimal suspicious activity history" });
    } else if (fraud <= 50) {
      score -= 8;
      reasons.push({ type: "warning", label: `Scamalytics Score: ${fraud}/100 (Moderate)`, detail: "Moderate Scamalytics risk — some fraud signals detected, monitor carefully" });
    } else if (fraud <= 75) {
      score -= 22;
      reasons.push({ type: "negative", label: `Scamalytics Score: ${fraud}/100 (High)`, detail: "High Scamalytics fraud score — significant fraud history detected, high detection risk" });
    } else {
      score -= 38;
      reasons.push({ type: "negative", label: `Scamalytics Score: ${fraud}/100 (Critical)`, detail: "Critical Scamalytics fraud score — this IP is actively blacklisted across most major platforms" });
    }
  }

  // ─── 4. Reverse DNS / PTR Analysis ────────────────────────────────────────
  if (params.reverseDns) {
    if (internalFlags.hasSuspiciousPTR) {
      score -= 12;
      reasons.push({ type: "negative", label: "Datacenter PTR Record", detail: `Reverse DNS shows "${params.reverseDns}" — datacenter hostname pattern is instantly identifiable by anti-bot systems` });
    } else if (RESIDENTIAL_PTR_PATTERNS.some(p => p.test(params.reverseDns!.toLowerCase()))) {
      score += 8;
      reasons.push({ type: "positive", label: "Residential PTR Record", detail: `Reverse DNS shows "${params.reverseDns}" — residential hostname confirms genuine ISP assignment` });
    } else {
      reasons.push({ type: "neutral", label: `PTR Record: ${params.reverseDns}`, detail: "PTR record found but does not match known datacenter or residential patterns" });
    }
  } else {
    reasons.push({ type: "neutral", label: "No Reverse DNS (PTR)", detail: "No PTR record — common for both residential dynamic IPs and some hosting providers" });
  }

  // ─── 5. Open Proxy Port Detection ────────────────────────────────────────
  const portNames: Record<number, string> = { 3128: "Squid", 8080: "HTTP Proxy", 1080: "SOCKS5", 8888: "Alt HTTP", 9050: "TOR SOCKS", 8118: "Privoxy" };
  if (params.openPorts.length > 0) {
    const named = params.openPorts.map(p => `${portNames[p] || p} (${p})`).join(", ");
    score -= params.openPorts.length >= 2 ? 25 : 15;
    reasons.push({ type: "negative", label: `Open Proxy Ports: ${params.openPorts.map(p => portNames[p] || p).join(", ")}`, detail: `Live port scan found: ${named} — this IP is running active proxy software` });
  } else {
    score += 5;
    reasons.push({ type: "positive", label: "No Open Proxy Ports", detail: "Port scan found no active proxy services (3128, 8080, 1080, etc.)" });
  }

  // ─── 6. ISP & ASN ────────────────────────────────────────────────────────
  const ispLower = (params.isp || "").toLowerCase();
  const isVpnIsp = VPN_PROXY_ISP_KEYWORDS.some(k => ispLower.includes(k));
  const isCloudIsp = CLOUD_HOSTING_ISPS.some(t => ispLower.includes(t));
  const isResidentialIsp = TRUSTED_RESIDENTIAL_ISPS.some(t => ispLower.includes(t));

  if (isVpnIsp) {
    score -= 22;
    reasons.push({ type: "negative", label: "VPN/Proxy Provider ISP", detail: `"${params.isp}" is identified as a VPN/proxy provider — extremely high detection risk` });
  } else if (isCloudIsp) {
    score -= 10;
    reasons.push({ type: "negative", label: "Cloud Hosting ISP", detail: `"${params.isp}" is a major cloud provider — flagged by all major fraud systems as non-residential` });
  } else if (isResidentialIsp) {
    score += 8;
    reasons.push({ type: "positive", label: "Residential ISP", detail: `"${params.isp}" is a known residential carrier — appears as a legitimate consumer connection` });
  }

  if (params.asn && HIGH_RISK_ASNS.has(params.asn.toUpperCase())) {
    score -= 10;
    reasons.push({ type: "negative", label: `High-Risk ASN: ${params.asn}`, detail: `${params.asn} is a known high-risk autonomous system frequently appearing in proxy/VPN abuse databases` });
  }

  // ─── 7. Usage Type (IP2Location) ─────────────────────────────────────────
  if (params.usageType) {
    const usage = params.usageType.toLowerCase();
    if (usage.includes("isp") || usage.includes("fixed") || usage.includes("residential")) {
      score += 8;
      reasons.push({ type: "positive", label: "ISP/Residential (IP2Location)", detail: "IP2Location classifies this as a residential/ISP IP — confirms legitimate consumer connection" });
    } else if (usage.includes("mobile") || usage.includes("mob")) {
      score += 7;
      reasons.push({ type: "positive", label: "Mobile Carrier (IP2Location)", detail: "IP2Location classifies this as a mobile IP — among the hardest to fingerprint and block" });
    } else if (usage.includes("dch") || usage.includes("data center") || usage.includes("hosting")) {
      score -= 12;
      reasons.push({ type: "negative", label: "Data Center (IP2Location)", detail: "IP2Location confirms datacenter/hosting — this classification appears in fraud prevention databases worldwide" });
    }
  }

  // ─── 8. Country Risk ─────────────────────────────────────────────────────
  if (params.country) {
    if (HIGH_RISK_COUNTRIES.has(params.country)) {
      score -= 12;
      reasons.push({ type: "warning", label: `High-Risk Country: ${params.country}`, detail: `${params.country} has elevated fraud rates — IPs here face extra scrutiny and may trigger geo-blocking` });
    } else if (MODERATE_RISK_COUNTRIES.has(params.country)) {
      score -= 6;
      reasons.push({ type: "warning", label: `Moderate-Risk Region: ${params.country}`, detail: `${params.country} has moderate fraud risk — may trigger additional verification on some platforms` });
    } else if (["United States", "Canada", "United Kingdom", "Australia", "Germany", "France", "Japan", "South Korea", "Netherlands", "Sweden", "Norway", "Switzerland"].includes(params.country)) {
      score += 6;
      reasons.push({ type: "positive", label: `Trusted Country: ${params.country}`, detail: `${params.country} is a low-risk, high-trust region — IPs here are generally accepted by fraud detection systems` });
    }
  }


  // ─── Final Score Clamp & Grade ────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));

  let grade: IpIntelligence["grade"];
  let label: IpIntelligence["label"];
  if (score >= 90) { grade = "A+"; label = "Excellent"; }
  else if (score >= 75) { grade = "A"; label = "Good"; }
  else if (score >= 58) { grade = "B"; label = "Moderate"; }
  else if (score >= 40) { grade = "C"; label = "Poor"; }
  else if (score >= 22) { grade = "D"; label = "Risky"; }
  else { grade = "F"; label = "Dangerous"; }

  let verdict: string;
  if (score >= 85) {
    verdict = "Excellent IP — strong legitimacy signals across all checks. Very low risk of detection.";
  } else if (score >= 70) {
    verdict = "Good IP — generally safe with only minor concerns. Suitable for most use cases.";
  } else if (score >= 55) {
    verdict = "Average IP — usable but carries notable risk factors. Monitor performance carefully.";
  } else if (score >= 38) {
    verdict = "Below Average — multiple risk signals confirmed. Use only when necessary.";
  } else if (score >= 20) {
    verdict = "Risky IP — high probability of detection across major platforms. Avoid sensitive operations.";
  } else {
    verdict = "Dangerous IP — extreme risk level. Likely blacklisted on most major services.";
  }

  return {
    score,
    grade,
    label,
    verdict,
    reasons: reasons.sort((a, b) => {
      const order = { negative: 0, warning: 1, neutral: 2, positive: 3 };
      return order[a.type] - order[b.type];
    }),
  };
}
