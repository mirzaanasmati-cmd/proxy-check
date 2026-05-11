import { z } from "zod";

export const proxyInputSchema = z.object({
  proxies: z.array(z.string().min(1)).min(1).max(200),
});

export type ProxyInput = z.infer<typeof proxyInputSchema>;

export interface InternalFlags {
  connectionType: "datacenter" | "residential" | "mobile" | "corporate" | "unknown";
  isDatacenter: boolean;
  isResidential: boolean;
  isMobile: boolean;
  hasSuspiciousPTR: boolean;
  hasOpenProxyPorts: boolean;
  isTorNode: boolean;
  confidence: "high" | "medium" | "low";
}

export interface IpQualityReason {
  type: "positive" | "negative" | "warning" | "neutral";
  label: string;
  detail: string;
}

export interface IpIntelligence {
  score: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  label: "Excellent" | "Good" | "Moderate" | "Poor" | "Risky" | "Dangerous";
  verdict: string;
  reasons: IpQualityReason[];
}

export type AnonymityLevel = "elite" | "anonymous" | "transparent";

export interface ProxyProvider {
  name: string;
  type: "residential" | "datacenter" | "isp" | "mobile" | "mixed";
  confidence: "high" | "medium" | "low";
  evidence: string;
}

export interface ProxyResult {
  proxyString: string;
  working: boolean;
  exitIp: string | null;
  exitIpVersion: "v4" | "v6" | null;
  country: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  isp: string | null;
  asn: string | null;
  usageType: string | null;
  fraudScore: string | null;
  fraudRisk: string | null;
  error: string | null;
  intelligence: IpIntelligence | null;
  internalFlags: InternalFlags | null;
  reverseDns: string | null;
  openPorts: number[];
  isTorNode: boolean;
  latencyMs: number | null;
  anonymityLevel: AnonymityLevel | null;
  provider: ProxyProvider | null;
}

export interface CheckProxiesResponse {
  results: ProxyResult[];
}
