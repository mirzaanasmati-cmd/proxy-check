import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { ProxyResult, IpIntelligence, IpQualityReason, AnonymityLevel, InternalFlags } from "@shared/schema";
import {
  Shield,
  Globe,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Network,
  Server,
  MapPin,
  Building2,
  Fingerprint,
  Activity,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Download,
  SlidersHorizontal,
  History,
  Eye,
  EyeOff,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  Radar,
  Zap,
  LayoutGrid,
  List,
  ArrowUpDown,
  BarChart3,
  Home as HomeIcon,
  Smartphone,
  Monitor,
  HelpCircle,
  Search,
  Sparkles,
  Gamepad2,
  Radio,
  Bug,
  Users2,
  AlertOctagon,
  Globe2,
  Star,
  Lightbulb,
  RefreshCw,
  Sun,
  Moon,
  Hash,
  Navigation,
} from "lucide-react";

const MAX_PROXIES = 200;

function CopyButton({ text, label, onCopied }: { text: string; label: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopied?.();
  }, [text, onCopied]);

  return (
    <Button
      size="sm" variant="ghost" onClick={handleCopy}
      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
      data-testid={`button-copy-${label}`}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function getFraudScoreColor(score: string | null) {
  if (!score) return "text-muted-foreground";
  const n = parseInt(score);
  if (n <= 25) return "text-emerald-400";
  if (n <= 50) return "text-yellow-400";
  if (n <= 75) return "text-orange-400";
  return "text-red-400";
}
function getFraudScoreBg(score: string | null) {
  if (!score) return "bg-muted";
  const n = parseInt(score);
  if (n <= 25) return "bg-emerald-500/10";
  if (n <= 50) return "bg-yellow-500/10";
  if (n <= 75) return "bg-orange-500/10";
  return "bg-red-500/10";
}
function getUsageTypeBadgeClass(type: string | null) {
  if (!type) return "bg-muted text-muted-foreground";
  const l = type.toLowerCase();
  if (l.includes("data center") || l.includes("datacenter") || l.includes("dch") || l.includes("hosting"))
    return "bg-purple-500/15 text-purple-400 border-purple-500/20";
  if (l.includes("fixed") || l.includes("isp") || l.includes("residential"))
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  if (l.includes("mobile") || l.includes("cellular") || l.includes("mob"))
    return "bg-blue-500/15 text-blue-400 border-blue-500/20";
  return "bg-muted text-muted-foreground";
}

function getGradeColor(grade: string) {
  switch (grade) {
    case "A+": return { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/25", ring: "ring-emerald-500/20" };
    case "A": return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", ring: "ring-emerald-500/15" };
    case "B": return { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", ring: "ring-yellow-500/15" };
    case "C": return { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", ring: "ring-orange-500/15" };
    case "D": return { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", ring: "ring-red-500/15" };
    case "F": return { text: "text-red-500", bg: "bg-red-500/15", border: "border-red-500/30", ring: "ring-red-500/25" };
    default: return { text: "text-muted-foreground", bg: "bg-muted", border: "border-border", ring: "" };
  }
}

function getReasonIcon(type: IpQualityReason["type"]) {
  switch (type) {
    case "positive": return <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />;
    case "negative": return <TrendingDown className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />;
    case "warning": return <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />;
    case "neutral": return <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />;
  }
}

function getReasonColors(type: IpQualityReason["type"]) {
  switch (type) {
    case "positive": return "border-emerald-500/15 bg-emerald-500/5";
    case "negative": return "border-red-500/15 bg-red-500/5";
    case "warning": return "border-amber-500/15 bg-amber-500/5";
    case "neutral": return "border-border bg-muted/30";
  }
}

function getLatencyColor(ms: number) {
  if (ms < 150) return { text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" };
  if (ms < 400) return { text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" };
  return { text: "text-red-400", bg: "bg-red-500/10 border-red-500/20" };
}

function getAnonymityStyle(level: AnonymityLevel) {
  switch (level) {
    case "elite": return { text: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20", icon: <EyeOff className="h-3 w-3" />, label: "Elite" };
    case "anonymous": return { text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", icon: <Eye className="h-3 w-3" />, label: "Anonymous" };
    case "transparent": return { text: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: <AlertTriangle className="h-3 w-3" />, label: "Transparent" };
  }
}

function StatsDashboard({ results }: { results: ProxyResult[] }) {
  const [expanded, setExpanded] = useState(false);
  const working = results.filter(r => r.working);
  const failed = results.filter(r => !r.working);
  const total = results.length;

  const latencies = working.filter(r => r.latencyMs !== null).map(r => r.latencyMs!);
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : null;

  const gradeCounts: Record<string, number> = { "A+": 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
  working.forEach(r => { if (r.intelligence) gradeCounts[r.intelligence.grade]++; });

  const ipv6Count = working.filter(r => r.exitIpVersion === "v6").length;
  const ipv4Count = working.filter(r => r.exitIpVersion === "v4").length;

  const countryMap: Record<string, number> = {};
  working.forEach(r => { if (r.country) countryMap[r.country] = (countryMap[r.country] || 0) + 1; });
  const topCountries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const gradeOrder = ["A+", "A", "B", "C", "D", "F"] as const;
  const gradeBarColors: Record<string, string> = {
    "A+": "bg-emerald-500", A: "bg-emerald-400", B: "bg-yellow-400",
    C: "bg-orange-400", D: "bg-red-400", F: "bg-red-600",
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="panel-stats-dashboard">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
        data-testid="button-toggle-stats"
      >
        <BarChart3 className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex items-center gap-4 flex-1 min-w-0 overflow-x-auto">
          <span className="text-xs font-semibold text-foreground shrink-0">Overview</span>
          <span className="text-xs text-muted-foreground shrink-0">
            <span className="text-emerald-400 font-bold">{working.length}</span> working
            <span className="mx-1.5 text-border">·</span>
            <span className="text-red-400 font-bold">{failed.length}</span> failed
          </span>
          {avgLatency !== null && (
            <span className="text-xs text-muted-foreground shrink-0">
              <span className={`font-bold ${getLatencyColor(avgLatency).text}`}>{avgLatency}ms</span> avg
            </span>
          )}
          {(ipv6Count > 0 || ipv4Count > 0) && (
            <span className="text-xs text-muted-foreground shrink-0">
              {ipv4Count > 0 && <><span className="text-sky-400 font-bold">{ipv4Count}</span> IPv4</>}
              {ipv4Count > 0 && ipv6Count > 0 && <span className="mx-1 text-border">·</span>}
              {ipv6Count > 0 && <><span className="text-violet-400 font-bold">{ipv6Count}</span> IPv6</>}
            </span>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-border p-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">AI Grade Distribution</p>
            <div className="space-y-1.5">
              {gradeOrder.map(grade => {
                const count = gradeCounts[grade];
                const pct = working.length > 0 ? (count / working.length) * 100 : 0;
                const colors = getGradeColor(grade);
                return (
                  <div key={grade} className="flex items-center gap-2" data-testid={`stat-grade-${grade}`}>
                    <span className={`w-6 text-[11px] font-bold text-right shrink-0 ${colors.text}`}>{grade}</span>
                    <div className="flex-1 h-2 rounded-full bg-background overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${gradeBarColors[grade]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-4 text-[11px] tabular-nums text-muted-foreground text-right shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {topCountries.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Top Countries</p>
                <div className="space-y-1.5">
                  {topCountries.map(([country, count]) => (
                    <div key={country} className="flex items-center gap-2">
                      <span className="text-[11px] text-foreground flex-1 truncate">{country}</span>
                      <div className="w-16 h-1.5 rounded-full bg-background overflow-hidden">
                        <div className="h-full rounded-full bg-primary/50" style={{ width: `${(count / working.length) * 100}%` }} />
                      </div>
                      <span className="text-[11px] tabular-nums text-muted-foreground w-4 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TableCopyCell({ text, onCopied }: { text: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopied?.();
  }, [text, onCopied]);
  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
    </button>
  );
}

function TableView({ results }: { results: ProxyResult[] }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card" data-testid="table-view">
      <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed min-w-[820px]">
          <colgroup>
            <col style={{ width: "36px" }} />
            <col style={{ width: "70px" }} />
            <col style={{ width: "190px" }} />
            <col style={{ width: "150px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "150px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "72px" }} />
            <col style={{ width: "56px" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">#</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Proxy</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Exit IP</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Country</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">City</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">ISP</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Speed</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Fraud</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const latStyle = r.latencyMs !== null ? getLatencyColor(r.latencyMs) : null;
              return (
                <tr
                  key={r.proxyString + i}
                  className="border-b border-border/40 hover:bg-muted/15 transition-colors"
                  data-testid={`table-row-${i}`}
                >
                  <td className="px-3 py-2.5 text-muted-foreground/50 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    {r.working
                      ? <span className="inline-flex items-center gap-1 text-emerald-400 font-medium"><CheckCircle2 className="h-3 w-3" /><span>OK</span></span>
                      : <span className="inline-flex items-center gap-1 text-red-400 font-medium"><XCircle className="h-3 w-3" /><span>Fail</span></span>
                    }
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="flex items-center gap-0.5 min-w-0">
                      <span className="font-mono text-[11px] text-muted-foreground truncate block flex-1 min-w-0" title={r.proxyString}>{r.proxyString}</span>
                      <TableCopyCell text={r.proxyString} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    {r.exitIp ? (
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-mono text-[11px] truncate flex-1 min-w-0 text-foreground" title={r.exitIp}>{r.exitIp}</span>
                        {r.exitIpVersion && (
                          <span className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded ${r.exitIpVersion === "v6" ? "bg-violet-500/15 text-violet-400" : "bg-sky-500/10 text-sky-400"}`}>
                            {r.exitIpVersion === "v6" ? "v6" : "v4"}
                          </span>
                        )}
                        <span className="shrink-0"><TableCopyCell text={r.exitIp} /></span>
                      </div>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <span className="text-[11px] truncate block" title={r.country ?? ""}>{r.country || <span className="text-muted-foreground/40">—</span>}</span>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <span className="text-[11px] text-muted-foreground truncate block" title={r.city ?? ""}>{r.city || <span className="text-muted-foreground/40">—</span>}</span>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <span className="text-[11px] text-muted-foreground truncate block" title={r.isp ?? ""}>{r.isp || <span className="text-muted-foreground/40">—</span>}</span>
                  </td>
                  <td className="px-3 py-2.5 overflow-hidden">
                    {r.usageType
                      ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground truncate block" title={r.usageType}>{r.usageType}</span>
                      : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {latStyle && r.latencyMs !== null
                      ? <span className={`font-semibold ${latStyle.text}`}>{r.latencyMs}ms</span>
                      : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {r.fraudScore !== null
                      ? <span className={`font-semibold ${getFraudScoreColor(r.fraudScore)}`}>{r.fraudScore}</span>
                      : <span className="text-muted-foreground/40">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SignalsPanel({ result }: { result: ProxyResult }) {
  const [expanded, setExpanded] = useState(false);
  const { internalFlags, reverseDns, openPorts, isTorNode } = result;
  if (!internalFlags) return null;

  const portNames: Record<number, string> = { 3128: "Squid/3128", 8080: "HTTP/8080", 1080: "SOCKS5/1080", 8888: "HTTP/8888", 9050: "TOR/9050", 8118: "Privoxy/8118" };

  const hasThreat = isTorNode || openPorts.length > 0 || internalFlags.isDatacenter || internalFlags.hasSuspiciousPTR;

  const connTypeConfig = {
    residential: { icon: <HomeIcon className="h-3.5 w-3.5" />, label: "Residential", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    mobile: { icon: <Smartphone className="h-3.5 w-3.5" />, label: "Mobile", cls: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
    datacenter: { icon: <Monitor className="h-3.5 w-3.5" />, label: "Datacenter", cls: "text-red-400 bg-red-500/10 border-red-500/20" },
    corporate: { icon: <Building2 className="h-3.5 w-3.5" />, label: "Corporate", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    unknown: { icon: <HelpCircle className="h-3.5 w-3.5" />, label: "Unknown", cls: "text-muted-foreground bg-muted/40 border-border" },
  };
  const connCfg = connTypeConfig[internalFlags.connectionType];

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden" data-testid="panel-signals">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors"
        data-testid="button-toggle-signals"
      >
        <div className="flex items-center gap-2">
          <Radar className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-xs font-semibold text-sky-400">Detection Signals</span>
          {hasThreat && <span className="inline-flex h-1.5 w-1.5 rounded-full bg-red-400" />}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 ${connCfg.cls}`}>
            {connCfg.icon}{connCfg.label}
          </span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-muted/30 px-2.5 py-2">
              <p className="text-[9px] text-muted-foreground uppercase mb-1">TOR Exit Node</p>
              {isTorNode ? (
                <p className="text-[11px] font-semibold text-red-400 flex items-center gap-1"><ShieldAlert className="h-3 w-3" />Confirmed TOR</p>
              ) : (
                <p className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Clean</p>
              )}
            </div>
            <div className="rounded-md bg-muted/30 px-2.5 py-2">
              <p className="text-[9px] text-muted-foreground uppercase mb-1">PTR Record</p>
              {reverseDns ? (
                <p className={`text-[11px] font-medium truncate ${internalFlags.hasSuspiciousPTR ? "text-red-400" : "text-foreground"}`} title={reverseDns}>{reverseDns}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">No PTR record</p>
              )}
            </div>
          </div>

          <div className="rounded-md bg-muted/30 px-2.5 py-2">
            <p className="text-[9px] text-muted-foreground uppercase mb-1.5">Open Proxy Ports</p>
            {openPorts.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {openPorts.map(p => (
                  <span key={p} className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                    <Wifi className="h-2.5 w-2.5" />{portNames[p] || p}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1"><ShieldCheck className="h-3 w-3" />No open proxy ports</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {(["isDatacenter", "isResidential", "isMobile"] as const).map(flag => {
              const cfg = {
                isDatacenter: { label: "Datacenter", active: internalFlags.isDatacenter, good: false },
                isResidential: { label: "Residential", active: internalFlags.isResidential, good: true },
                isMobile: { label: "Mobile", active: internalFlags.isMobile, good: true },
              }[flag];
              return (
                <div key={flag} className={`rounded-md px-2 py-1.5 text-center border ${cfg.active ? (cfg.good ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20") : "bg-muted/20 border-border"}`}>
                  <p className="text-[9px] text-muted-foreground uppercase">{cfg.label}</p>
                  <p className={`text-[11px] font-bold ${cfg.active ? (cfg.good ? "text-emerald-400" : "text-red-400") : "text-muted-foreground/40"}`}>{cfg.active ? "Yes" : "No"}</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Detection confidence: <span className={`font-semibold ${internalFlags.confidence === "high" ? "text-emerald-400" : internalFlags.confidence === "medium" ? "text-amber-400" : "text-muted-foreground"}`}>{internalFlags.confidence}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

function IntelligencePanel({ intel }: { intel: IpIntelligence }) {
  const [expanded, setExpanded] = useState(false);
  const colors = getGradeColor(intel.grade);
  const positiveCount = intel.reasons.filter(r => r.type === "positive").length;
  const negativeCount = intel.reasons.filter(r => r.type === "negative").length;
  const warningCount = intel.reasons.filter(r => r.type === "warning").length;

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} overflow-hidden`} data-testid="panel-intelligence">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
        data-testid="button-toggle-intelligence"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${colors.bg} border ${colors.border}`}>
            <Brain className={`h-5 w-5 ${colors.text}`} />
          </div>
          <div className="text-left min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${colors.text}`}>{intel.grade}</span>
              <span className={`text-sm font-semibold ${colors.text}`}>{intel.label}</span>
              <span className="text-xs text-muted-foreground">({intel.score}/100)</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{intel.verdict}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            {positiveCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                <TrendingUp className="h-2.5 w-2.5" />{positiveCount}
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="h-2.5 w-2.5" />{warningCount}
              </span>
            )}
            {negativeCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                <TrendingDown className="h-2.5 w-2.5" />{negativeCount}
              </span>
            )}
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-2" data-testid="panel-intelligence-details">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-1.5 flex-1 rounded-full bg-background overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  intel.score >= 75 ? "bg-emerald-500" :
                  intel.score >= 55 ? "bg-yellow-500" :
                  intel.score >= 35 ? "bg-orange-500" : "bg-red-500"
                }`}
                style={{ width: `${intel.score}%` }}
              />
            </div>
            <span className={`text-xs font-bold tabular-nums ${colors.text}`}>{intel.score}</span>
          </div>

          {intel.lastSeenAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background/50 rounded-md px-3 py-2 mb-2">
              <History className="h-3 w-3" />
              <span>Last seen: <span className="text-foreground font-medium">{new Date(intel.lastSeenAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span></span>
              {intel.checkCount > 1 && <span className="ml-auto text-amber-400 font-medium">{intel.checkCount}x detected</span>}
            </div>
          )}

          {intel.reasons.map((reason, i) => (
            <div key={i} className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${getReasonColors(reason.type)}`} data-testid={`reason-${reason.type}-${i}`}>
              {getReasonIcon(reason.type)}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{reason.label}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{reason.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterDropdown({
  label, options, selected, onToggle, onClear, testId,
}: {
  label: string; options: string[]; selected: Set<string>;
  onToggle: (v: string) => void; onClear: () => void; testId: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors
            ${selected.size > 0
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/20"
            }`}
          data-testid={testId}
        >
          <SlidersHorizontal className="h-3 w-3" />
          {label}
          {selected.size > 0 && <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{selected.size}</Badge>}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 max-h-60 overflow-y-auto">
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-3 text-center">No options yet</p>
        ) : (
          <>
            {selected.size > 0 && (
              <button onClick={onClear}
                className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                Clear selection
              </button>
            )}
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-accent/50">
                <Checkbox checked={selected.has(opt)} onCheckedChange={() => onToggle(opt)} />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ScoreRangeFilter({ range, onChange }: { range: [number, number]; onChange: (v: [number, number]) => void }) {
  const isDefault = range[0] === 0 && range[1] === 100;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors
            ${!isDefault
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/20"
            }`}
          data-testid="filter-score-range"
        >
          <Fingerprint className="h-3 w-3" />
          Score {!isDefault && `${range[0]}–${range[1]}`}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-3 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Fraud Score Range</span>
          <span className="text-xs tabular-nums text-muted-foreground">{range[0]} – {range[1]}</span>
        </div>
        <Slider min={0} max={100} step={1} value={range} onValueChange={(v) => onChange(v as [number, number])} />
        <div className="flex gap-1">
          {[
            { label: "Low (0–25)", v: [0, 25] as [number, number] },
            { label: "Med (26–75)", v: [26, 75] as [number, number] },
            { label: "High (76–100)", v: [76, 100] as [number, number] },
          ].map(({ label, v }) => (
            <button
              key={label}
              onClick={() => onChange(v)}
              className="flex-1 rounded border border-border px-1 py-1 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Real IP Stability Test ───────────────────────────────────────────────────
interface StabilityRequest { index: number; total: number; ip: string | null; ms: number; changed: boolean; error?: string }
interface StabilityDone { stable: boolean; uniqueIps: string[]; changedAtRequest: number | null; totalRequests: number; successCount: number }

function IPStabilityTest({ proxyString, testAllSignal = 0, staggerIndex = 0 }: {
  proxyString: string;
  testAllSignal?: number;
  staggerIndex?: number;
}) {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [requests, setRequests] = useState<StabilityRequest[]>([]);
  const [summary, setSummary] = useState<StabilityDone | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevSignal = useRef(0);
  const staggerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (testAllSignal === 0 || testAllSignal === prevSignal.current) return;
    prevSignal.current = testAllSignal;
    if (staggerTimer.current) clearTimeout(staggerTimer.current);
    abortRef.current?.abort();
    const delay = Math.min(staggerIndex * 500, 4000);
    staggerTimer.current = setTimeout(() => { run(); }, delay);
    return () => { if (staggerTimer.current) clearTimeout(staggerTimer.current); };
  }, [testAllSignal]);

  const run = async () => {
    setPhase("running");
    setRequests([]);
    setSummary(null);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch("/api/test-ip-stability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxy: proxyString, count: 12 }),
        signal: abort.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (abort.signal.aborted) return;
      if (data?.error) throw new Error(data.error);
      setRequests((data.requests || []) as StabilityRequest[]);
      setSummary({
        stable: !!data.stable,
        uniqueIps: data.uniqueIps || [],
        changedAtRequest: data.changedAtRequest ?? null,
        totalRequests: data.totalRequests || 0,
        successCount: data.successCount || 0,
      });
      setPhase("done");
    } catch (e: any) {
      if (e.name !== "AbortError") setPhase("done");
    }
  };

  const reset = () => { abortRef.current?.abort(); setPhase("idle"); setRequests([]); setSummary(null); };

  if (phase === "idle") {
    return (
      <button
        onClick={run}
        className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary hover:bg-primary/10 hover:border-primary/50 transition-colors"
        data-testid="button-stability-test"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Test IP Stability (12 real requests)
      </button>
    );
  }

  const progress = requests.length;
  const total = requests[0]?.total ?? 12;

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${phase === "running" ? "animate-spin text-primary" : "text-muted-foreground"}`} />
          <span className="text-xs font-medium">IP Stability Test</span>
          {phase === "running" && <span className="text-xs text-muted-foreground tabular-nums">{progress}/{total}</span>}
        </div>
        <div className="flex items-center gap-2">
          {phase === "done" && summary && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              summary.stable ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"
            }`}>
              {summary.stable ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldAlert className="h-2.5 w-2.5" />}
              {summary.stable ? "IP Stable" : "IP Rotates"}
            </span>
          )}
          <button onClick={reset} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {phase === "running" && (
        <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(progress / total) * 100}%` }} />
        </div>
      )}

      {/* Request timeline */}
      <div className="flex flex-wrap gap-1">
        {requests.map(req => (
          <div
            key={req.index}
            title={req.error ? `#${req.index}: ${req.error}` : `#${req.index}: ${req.ip} (${req.ms}ms)`}
            className={`w-6 h-6 rounded text-[9px] font-bold flex items-center justify-center border ${
              req.error
                ? "bg-muted/30 border-border text-muted-foreground"
                : req.changed
                ? "bg-red-500/15 border-red-500/30 text-red-400"
                : "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
            }`}
          >
            {req.error ? "✗" : req.changed ? "!" : "✓"}
          </div>
        ))}
        {phase === "running" && Array.from({ length: Math.max(0, total - progress) }).map((_, i) => (
          <div key={`pending-${i}`} className="w-6 h-6 rounded border border-dashed border-border bg-muted/10 animate-pulse" />
        ))}
      </div>

      {/* Summary */}
      {phase === "done" && summary && (
        <div className="space-y-1.5 pt-0.5 border-t border-border">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded bg-muted/20 px-2 py-1.5">
              <p className="text-base font-bold tabular-nums text-foreground">{summary.successCount}</p>
              <p className="text-[9px] text-muted-foreground">Requests OK</p>
            </div>
            <div className="rounded bg-muted/20 px-2 py-1.5">
              <p className={`text-base font-bold tabular-nums ${summary.uniqueIps.length > 1 ? "text-red-400" : "text-emerald-400"}`}>{summary.uniqueIps.length}</p>
              <p className="text-[9px] text-muted-foreground">Unique IPs</p>
            </div>
            <div className="rounded bg-muted/20 px-2 py-1.5">
              <p className={`text-base font-bold tabular-nums ${summary.changedAtRequest ? "text-red-400" : "text-emerald-400"}`}>
                {summary.changedAtRequest ? `#${summary.changedAtRequest}` : "—"}
              </p>
              <p className="text-[9px] text-muted-foreground">Changed at</p>
            </div>
          </div>
          {summary.uniqueIps.length > 1 && (
            <div className="rounded-md bg-red-500/5 border border-red-500/15 px-2.5 py-2 space-y-1">
              <p className="text-[10px] font-medium text-red-400">IPs observed during test:</p>
              {summary.uniqueIps.map((ip, i) => (
                <code key={ip} className="block text-xs font-mono text-red-300">
                  {i === 0 ? "First: " : `Change ${i}: `}{ip}
                </code>
              ))}
            </div>
          )}
          {summary.stable && (
            <p className="text-[10px] text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Exit IP remained <strong>{summary.uniqueIps[0]}</strong> across all {summary.successCount} requests
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI: Use Case Tags ────────────────────────────────────────────────────────
interface UseCase { label: string; cls: string; icon: React.ReactNode }

function computeUseCaseTags(r: ProxyResult): UseCase[] {
  if (!r.working) return [];
  const score = r.intelligence?.score ?? 0;
  const isElite = r.anonymityLevel === "elite";
  const isAnon = r.anonymityLevel === "anonymous";
  const isResidential = r.internalFlags?.isResidential ?? false;
  const isMobile = r.internalFlags?.isMobile ?? false;
  const latency = r.latencyMs ?? 9999;
  const fraudNum = r.fraudScore !== null ? parseInt(r.fraudScore) : 50;
  if (r.isTorNode || score < 25 || fraudNum > 80) {
    return [{ label: "High Risk", cls: "bg-red-500/10 text-red-400 border-red-500/20", icon: <ShieldAlert className="h-2.5 w-2.5" /> }];
  }
  const cases: UseCase[] = [];
  if (latency < 400 && score > 70 && (isElite || isAnon))
    cases.push({ label: "Gaming", cls: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: <Gamepad2 className="h-2.5 w-2.5" /> });
  if ((isResidential || isMobile) && (isElite || isAnon) && score > 65 && latency < 1500)
    cases.push({ label: "Streaming", cls: "bg-sky-500/10 text-sky-400 border-sky-500/20", icon: <Radio className="h-2.5 w-2.5" /> });
  if ((isResidential || isMobile) && (isElite || isAnon) && score > 55)
    cases.push({ label: "Social Media", cls: "bg-pink-500/10 text-pink-400 border-pink-500/20", icon: <Users2 className="h-2.5 w-2.5" /> });
  if ((isElite || isAnon) && score > 45)
    cases.push({ label: "Scraping", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: <Bug className="h-2.5 w-2.5" /> });
  return cases.slice(0, 3);
}

// ─── AI: NL Query Parser ──────────────────────────────────────────────────────
interface NLFilters {
  countries: string[];
  anonymity: "all" | "elite" | "anonymous" | "transparent";
  connType: "all" | "residential" | "mobile" | "datacenter";
  quality: "all" | "good" | "risky";
  speed: "all" | "fast";
  noTor: boolean;
  ipVersion: "all" | "v4" | "v6";
}
const NL_COUNTRY_MAP: Record<string, string> = {
  us: "United States", usa: "United States", america: "United States",
  uk: "United Kingdom", gb: "United Kingdom", britain: "United Kingdom", england: "United Kingdom",
  de: "Germany", germany: "Germany",
  fr: "France", france: "France",
  jp: "Japan", japan: "Japan",
  ca: "Canada", canada: "Canada",
  nl: "Netherlands", netherlands: "Netherlands",
  au: "Australia", australia: "Australia",
  in: "India", india: "India",
  ru: "Russia", russia: "Russia",
  br: "Brazil", brazil: "Brazil",
  cn: "China", china: "China",
  it: "Italy", italy: "Italy",
  sg: "Singapore", singapore: "Singapore",
  se: "Sweden", sweden: "Sweden",
  tr: "Turkey", turkey: "Turkey",
  mx: "Mexico", mexico: "Mexico",
};
function parseNLQuery(q: string): NLFilters | null {
  if (!q.trim()) return null;
  const l = q.toLowerCase();
  const words = l.split(/\s+/);
  const countries: string[] = [];
  for (const [k, v] of Object.entries(NL_COUNTRY_MAP)) {
    if (l.includes(k) && !countries.includes(v)) countries.push(v);
  }
  let anonymity: NLFilters["anonymity"] = "all";
  if (words.includes("elite")) anonymity = "elite";
  else if (words.includes("anonymous") || words.includes("anon")) anonymity = "anonymous";
  else if (words.includes("transparent")) anonymity = "transparent";
  let connType: NLFilters["connType"] = "all";
  if (l.includes("residential") || l.includes("home")) connType = "residential";
  else if (l.includes("mobile") || l.includes("cellular")) connType = "mobile";
  else if (l.includes("datacenter") || l.includes("data center") || words.includes("dc") || words.includes("vps")) connType = "datacenter";
  let quality: NLFilters["quality"] = "all";
  if (l.includes("clean") || l.includes("safe") || l.includes("good") || l.includes("trusted")) quality = "good";
  else if (l.includes("risky") || l.includes("bad") || l.includes("dangerous")) quality = "risky";
  const speed: NLFilters["speed"] = (l.includes("fast") || l.includes("quick") || l.includes("speed") || l.includes("low latency")) ? "fast" : "all";
  const noTor = l.includes("no tor") || l.includes("notor") || l.includes("no-tor");
  let ipVersion: NLFilters["ipVersion"] = "all";
  if (l.includes("ipv6") || words.includes("v6")) ipVersion = "v6";
  else if (l.includes("ipv4") || words.includes("v4")) ipVersion = "v4";
  const hasAny = countries.length > 0 || anonymity !== "all" || connType !== "all" || quality !== "all" || speed !== "all" || noTor || ipVersion !== "all";
  return hasAny ? { countries, anonymity, connType, quality, speed, noTor, ipVersion } : null;
}

// ─── Info Row ─────────────────────────────────────────────────────────────────
function _AIInsightsPanel_REMOVED({ results }: { results: ProxyResult[] }) {
  const [expanded, setExpanded] = useState(false);
  const working = results.filter(r => r.working);
  if (working.length === 0) return null;

  const scores = working.filter(r => r.intelligence).map(r => r.intelligence!.score);
  const poolScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const poolColor = poolScore === null ? "text-muted-foreground" : poolScore >= 75 ? "text-emerald-400" : poolScore >= 60 ? "text-yellow-400" : poolScore >= 45 ? "text-orange-400" : "text-red-400";
  const poolLabel = poolScore === null ? "" : poolScore >= 75 ? "Excellent Pool" : poolScore >= 60 ? "Good Pool" : poolScore >= 45 ? "Moderate Pool" : "Poor Pool";

  const ipCounts: Record<string, number> = {};
  working.forEach(r => { if (r.exitIp) ipCounts[r.exitIp] = (ipCounts[r.exitIp] || 0) + 1; });
  const duplicateIps = Object.entries(ipCounts).filter(([, c]) => c > 1);

  const torCount = working.filter(r => r.isTorNode).length;
  const highFraud = working.filter(r => r.fraudScore !== null && parseInt(r.fraudScore) > 70).length;

  const ispCounts: Record<string, number> = {};
  working.forEach(r => { if (r.isp) ispCounts[r.isp] = (ispCounts[r.isp] || 0) + 1; });
  const topIsp = Object.entries(ispCounts).sort((a, b) => b[1] - a[1])[0];
  const topIspPct = topIsp ? Math.round((topIsp[1] / working.length) * 100) : 0;

  const typeCount = { residential: 0, mobile: 0, datacenter: 0, other: 0 };
  working.forEach(r => {
    if (r.internalFlags?.isResidential) typeCount.residential++;
    else if (r.internalFlags?.isMobile) typeCount.mobile++;
    else if (r.internalFlags?.isDatacenter) typeCount.datacenter++;
    else typeCount.other++;
  });

  const bestScraping = working
    .filter(r => (r.anonymityLevel === "elite" || r.anonymityLevel === "anonymous") && r.intelligence && r.intelligence.score > 50)
    .sort((a, b) => (b.intelligence?.score ?? 0) - (a.intelligence?.score ?? 0))[0];
  const bestSpeed = working.filter(r => r.latencyMs !== null).sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999))[0];
  const bestStreaming = working
    .filter(r => (r.internalFlags?.isResidential || r.internalFlags?.isMobile) && (r.anonymityLevel === "elite" || r.anonymityLevel === "anonymous") && r.intelligence && r.intelligence.score > 60)
    .sort((a, b) => (b.intelligence?.score ?? 0) - (a.intelligence?.score ?? 0))[0];

  const warningCount = duplicateIps.length + (torCount > 0 ? 1 : 0) + (highFraud > 0 ? 1 : 0) + (topIspPct > 70 ? 1 : 0);

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 overflow-hidden" data-testid="panel-ai-insights">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary/10 transition-colors"
        data-testid="button-toggle-insights"
      >
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex items-center gap-3 flex-1 min-w-0 overflow-x-auto">
          <span className="text-xs font-semibold text-primary shrink-0">AI Insights</span>
          {poolScore !== null && (
            <span className="text-xs text-muted-foreground shrink-0">
              Pool: <span className={`font-bold ${poolColor}`}>{poolScore}/100</span>
              <span className={`ml-1 ${poolColor} text-[11px]`}>({poolLabel})</span>
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-xs text-amber-400 flex items-center gap-1 shrink-0">
              <AlertOctagon className="h-3 w-3" />{warningCount} warning{warningCount > 1 ? "s" : ""}
            </span>
          )}
          {duplicateIps.length > 0 && (
            <span className="text-xs text-orange-400 shrink-0">{duplicateIps.length} duplicate exit IP{duplicateIps.length > 1 ? "s" : ""}</span>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-primary/15 p-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-4">
            {warningCount > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Anomaly Detection</p>
                <div className="space-y-1.5">
                  {duplicateIps.map(([ip, count]) => (
                    <div key={ip} className="flex items-start gap-2 rounded-md bg-orange-500/10 border border-orange-500/20 px-2.5 py-2">
                      <AlertOctagon className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-300">IP <code className="font-mono">{ip}</code> shared by <strong>{count}</strong> proxies</p>
                    </div>
                  ))}
                  {torCount > 0 && (
                    <div className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-2">
                      <ShieldAlert className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-300"><strong>{torCount}</strong> TOR exit node{torCount > 1 ? "s" : ""} — avoid for sensitive tasks</p>
                    </div>
                  )}
                  {highFraud > 0 && (
                    <div className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-2">
                      <Fingerprint className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-300"><strong>{highFraud}</strong> proxy{highFraud > 1 ? "ies" : "y"} with fraud score &gt;70</p>
                    </div>
                  )}
                  {topIspPct > 70 && topIsp && (
                    <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-300"><strong>{topIspPct}%</strong> from same ISP ({topIsp[0]}) — low diversity</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Connection Distribution</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: "Residential", count: typeCount.residential, cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
                  { label: "Mobile", count: typeCount.mobile, cls: "bg-sky-500/10 border-sky-500/20 text-sky-400" },
                  { label: "Datacenter", count: typeCount.datacenter, cls: "bg-red-500/10 border-red-500/20 text-red-400" },
                  { label: "Unknown", count: typeCount.other, cls: "bg-muted/30 border-border text-muted-foreground" },
                ].map(item => (
                  <div key={item.label} className={`rounded-md border px-2 py-2 text-center ${item.cls}`}>
                    <p className="text-base font-bold tabular-nums">{item.count}</p>
                    <p className="text-[9px] font-medium opacity-80">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Smart Recommendations</p>
            <div className="space-y-2">
              {bestScraping ? (
                <div className="flex items-center gap-3 rounded-md bg-emerald-500/5 border border-emerald-500/15 px-3 py-2">
                  <Bug className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-muted-foreground">Best for Web Scraping</p>
                    <code className="text-xs font-mono text-emerald-300 truncate block">{bestScraping.exitIp}</code>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${getGradeColor(bestScraping.intelligence!.grade).text}`}>{bestScraping.intelligence!.grade}</span>
                </div>
              ) : <p className="text-xs text-muted-foreground italic">No scraping-suitable proxy found</p>}

              {bestSpeed ? (
                <div className="flex items-center gap-3 rounded-md bg-purple-500/5 border border-purple-500/15 px-3 py-2">
                  <Zap className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-muted-foreground">Fastest Proxy</p>
                    <code className="text-xs font-mono text-purple-300 truncate block">{bestSpeed.exitIp}</code>
                  </div>
                  <span className="text-xs font-bold text-purple-400 shrink-0">{bestSpeed.latencyMs}ms</span>
                </div>
              ) : null}

              {bestStreaming ? (
                <div className="flex items-center gap-3 rounded-md bg-sky-500/5 border border-sky-500/15 px-3 py-2">
                  <Radio className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-muted-foreground">Best for Streaming</p>
                    <code className="text-xs font-mono text-sky-300 truncate block">{bestStreaming.exitIp}</code>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${getGradeColor(bestStreaming.intelligence!.grade).text}`}>{bestStreaming.intelligence!.grade}</span>
                </div>
              ) : <p className="text-xs text-muted-foreground italic">No streaming-suitable proxy found</p>}

              {!bestScraping && !bestStreaming && !bestSpeed && (
                <div className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
                  <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">No specific recommendations — check proxy quality</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string | null; testId: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-muted-foreground/60 shrink-0">{icon}</span>
      <span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
      <p className="text-xs font-medium truncate flex-1 text-right" data-testid={testId}>{value || <span className="text-muted-foreground/40">—</span>}</p>
    </div>
  );
}

function ProxyCard({ result, index, isInCompare, canCompare, onToggleCompare, testAllSignal, staggerIndex }: {
  result: ProxyResult;
  index: number;
  isInCompare: boolean;
  canCompare: boolean;
  onToggleCompare: () => void;
  testAllSignal?: number;
  staggerIndex?: number;
}) {
  const intel = result.intelligence;
  const gradeColors = intel ? getGradeColor(intel.grade) : null;

  return (
    <Card
      className={`relative border-card-border bg-card p-0 ${isInCompare ? "ring-2 ring-primary/50" : ""}`}
      data-testid={`card-proxy-result-${index}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {result.working
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
          <span className={`text-xs font-semibold ${result.working ? "text-emerald-400" : "text-red-400"}`}>
            {result.working ? "Working" : "Failed"}
          </span>
          {intel && (
            <Badge variant="outline" className={`${gradeColors?.bg} ${gradeColors?.text} ${gradeColors?.border} shrink-0 font-bold text-[11px] px-1.5`} data-testid={`badge-grade-${index}`}>
              {intel.grade}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleCompare}
            disabled={!isInCompare && !canCompare}
            title={isInCompare ? "Remove from comparison" : canCompare ? "Add to compare" : "Already comparing 2 proxies"}
            data-testid={`button-compare-${index}`}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              isInCompare
                ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25"
                : canCompare
                ? "border-border text-muted-foreground hover:text-primary hover:border-primary/30"
                : "border-border text-muted-foreground/30 cursor-not-allowed"
            }`}
          >
            <BarChart3 className="h-2.5 w-2.5" />
            {isInCompare ? "Selected" : "Compare"}
          </button>
          <span className="text-[11px] text-muted-foreground/50">#{index + 1}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Network className="h-3 w-3" /><span>Proxy</span>
          </div>
          <CopyButton text={result.proxyString} label={`proxy-${index}`} />
        </div>
        <code className="block rounded bg-muted/40 px-3 py-2 font-mono text-[11px] break-all text-muted-foreground" data-testid={`text-proxy-string-${index}`}>
          {result.proxyString}
        </code>


        {result.working && result.exitIp && (
          <>
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Globe className="h-3 w-3" /><span>Exit IP</span>
                  {result.exitIpVersion && (
                    <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${result.exitIpVersion === "v6" ? "bg-violet-500/15 text-violet-400" : "bg-sky-500/10 text-sky-400"}`}>
                      {result.exitIpVersion === "v6" ? "IPv6" : "IPv4"}
                    </span>
                  )}
                </div>
                <CopyButton text={result.exitIp} label={`ip-${index}`} />
              </div>
              <code
                className="block rounded px-3 py-2 font-mono text-sm font-semibold tracking-wide bg-primary/8 border border-primary/15 text-foreground"
                data-testid={`text-exit-ip-${index}`}
              >
                {result.exitIp}
              </code>
            </div>


            {(result.latencyMs !== null || result.anonymityLevel) && (
              <div className="flex items-center gap-2 flex-wrap">
                {result.latencyMs !== null && (() => {
                  const lc = getLatencyColor(result.latencyMs!);
                  return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${lc.bg} ${lc.text}`} data-testid={`badge-latency-${index}`}>
                      <Zap className="h-3 w-3" />{result.latencyMs}ms
                    </span>
                  );
                })()}
                {result.anonymityLevel && (() => {
                  const as_ = getAnonymityStyle(result.anonymityLevel);
                  return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${as_.bg} ${as_.text}`} data-testid={`badge-anonymity-${index}`}>
                      {as_.icon}{as_.label}
                    </span>
                  );
                })()}
              </div>
            )}

            <div className="divide-y divide-border/50 rounded-md border border-border/60 bg-background/50 overflow-hidden">
              <InfoRow icon={<MapPin className="h-3 w-3" />} label="Country" value={result.country} testId={`text-country-${index}`} />
              <InfoRow icon={<Building2 className="h-3 w-3" />} label="State" value={result.region} testId={`text-state-${index}`} />
              <InfoRow icon={<MapPin className="h-3 w-3" />} label="City" value={result.city} testId={`text-city-${index}`} />
              <InfoRow icon={<Hash className="h-3 w-3" />} label="Postal Code" value={result.postalCode} testId={`text-postal-${index}`} />
              {(result.latitude != null && result.longitude != null) && (
                <InfoRow
                  icon={<Navigation className="h-3 w-3" />}
                  label="Coordinates"
                  value={`${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}`}
                  testId={`text-coords-${index}`}
                />
              )}
              <InfoRow icon={<Server className="h-3 w-3" />} label="ISP" value={result.isp} testId={`text-isp-${index}`} />
              <div className="flex items-center gap-2 px-3 py-1.5">
                <span className="text-muted-foreground/60 shrink-0"><Activity className="h-3 w-3" /></span>
                <span className="text-xs text-muted-foreground shrink-0 w-20">Usage Type</span>
                <span className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${getUsageTypeBadgeClass(result.usageType)}`} data-testid={`text-usage-type-${index}`}>
                  {result.usageType || "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5">
                <span className="text-muted-foreground/60 shrink-0"><Fingerprint className="h-3 w-3" /></span>
                <span className="text-xs text-muted-foreground shrink-0 w-20">Fraud Score</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className={`text-xs font-bold tabular-nums ${getFraudScoreColor(result.fraudScore)}`} data-testid={`text-fraud-score-${index}`}>
                    {result.fraudScore !== null ? result.fraudScore : "—"}
                  </span>
                  {result.fraudRisk && <span className="text-[11px] text-muted-foreground">({result.fraudRisk})</span>}
                </div>
              </div>
              <InfoRow
                icon={<Building2 className="h-3 w-3" />}
                label="Provider"
                value={result.provider?.name ?? "Unknown"}
                testId={`text-provider-${index}`}
              />
            </div>

            <IPStabilityTest proxyString={result.proxyString} testAllSignal={testAllSignal} staggerIndex={staggerIndex} />
            <SignalsPanel result={result} />
          </>
        )}

        {!result.working && result.error && (
          <div className="flex items-start gap-2 rounded-md bg-red-500/5 border border-red-500/10 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400" data-testid={`text-error-${index}`}>{result.error}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Comparison Mode ──────────────────────────────────────────────────────────
function numWinner(a: number | null, b: number | null, mode: "higher" | "lower"): "a" | "b" | "tie" | null {
  if (a === null && b === null) return null;
  if (a === null) return "b";
  if (b === null) return "a";
  if (a === b) return "tie";
  return mode === "higher" ? (a > b ? "a" : "b") : (a < b ? "a" : "b");
}

const ANONYMITY_RANK: Record<string, number> = { elite: 3, anonymous: 2, transparent: 1 };
const GRADE_RANK: Record<string, number> = { "A+": 6, A: 5, B: 4, C: 3, D: 2, F: 1 };

function CmpCell({ value, isWinner, isTie, isLoser }: { value: React.ReactNode; isWinner: boolean; isTie: boolean; isLoser: boolean }) {
  return (
    <div className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium text-center transition-colors ${
      isWinner ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 ring-1 ring-emerald-500/20"
      : isTie ? "bg-muted/30 border border-border text-foreground"
      : isLoser ? "bg-red-500/5 border border-red-500/10 text-muted-foreground"
      : "bg-muted/20 border border-border text-foreground"
    }`}>
      {value}
    </div>
  );
}

function ComparisonModal({ a, b, onClose }: { a: ProxyResult; b: ProxyResult; onClose: () => void }) {
  const aScore = a.intelligence?.score ?? null;
  const bScore = b.intelligence?.score ?? null;
  const aGradeRank = a.intelligence ? (GRADE_RANK[a.intelligence.grade] ?? 0) : null;
  const bGradeRank = b.intelligence ? (GRADE_RANK[b.intelligence.grade] ?? 0) : null;
  const aFraud = a.fraudScore !== null ? parseInt(a.fraudScore) : null;
  const bFraud = b.fraudScore !== null ? parseInt(b.fraudScore) : null;
  const aAnonRank = a.anonymityLevel ? (ANONYMITY_RANK[a.anonymityLevel] ?? 0) : null;
  const bAnonRank = b.anonymityLevel ? (ANONYMITY_RANK[b.anonymityLevel] ?? 0) : null;

  const rows: Array<{ label: string; aVal: React.ReactNode; bVal: React.ReactNode; winner: "a" | "b" | "tie" | null }> = [
    {
      label: "Status",
      aVal: <span className={a.working ? "text-emerald-400" : "text-red-400"}>{a.working ? "✓ Working" : "✗ Failed"}</span>,
      bVal: <span className={b.working ? "text-emerald-400" : "text-red-400"}>{b.working ? "✓ Working" : "✗ Failed"}</span>,
      winner: a.working === b.working ? "tie" : a.working ? "a" : "b",
    },
    {
      label: "AI Score",
      aVal: aScore !== null ? `${aScore}/100` : "N/A",
      bVal: bScore !== null ? `${bScore}/100` : "N/A",
      winner: numWinner(aScore, bScore, "higher"),
    },
    {
      label: "Grade",
      aVal: a.intelligence?.grade ?? "N/A",
      bVal: b.intelligence?.grade ?? "N/A",
      winner: numWinner(aGradeRank, bGradeRank, "higher"),
    },
    {
      label: "Latency",
      aVal: a.latencyMs !== null ? `${a.latencyMs}ms` : "N/A",
      bVal: b.latencyMs !== null ? `${b.latencyMs}ms` : "N/A",
      winner: numWinner(a.latencyMs, b.latencyMs, "lower"),
    },
    {
      label: "Anonymity",
      aVal: a.anonymityLevel ?? "N/A",
      bVal: b.anonymityLevel ?? "N/A",
      winner: numWinner(aAnonRank, bAnonRank, "higher"),
    },
    {
      label: "Fraud Score",
      aVal: aFraud !== null ? `${aFraud} (${a.fraudRisk ?? "?"})` : "N/A",
      bVal: bFraud !== null ? `${bFraud} (${b.fraudRisk ?? "?"})` : "N/A",
      winner: numWinner(aFraud, bFraud, "lower"),
    },
    {
      label: "TOR Node",
      aVal: a.isTorNode ? "⚠️ Yes" : "✓ No",
      bVal: b.isTorNode ? "⚠️ Yes" : "✓ No",
      winner: a.isTorNode === b.isTorNode ? "tie" : !a.isTorNode ? "a" : "b",
    },
    {
      label: "Country",
      aVal: a.country ?? "N/A",
      bVal: b.country ?? "N/A",
      winner: null,
    },
    {
      label: "ISP",
      aVal: <span className="text-xs">{a.isp ?? "N/A"}</span>,
      bVal: <span className="text-xs">{b.isp ?? "N/A"}</span>,
      winner: null,
    },
    {
      label: "Usage Type",
      aVal: <span className="text-xs">{a.usageType ?? "N/A"}</span>,
      bVal: <span className="text-xs">{b.usageType ?? "N/A"}</span>,
      winner: null,
    },
    {
      label: "Connection",
      aVal: a.internalFlags?.isResidential ? "Residential" : a.internalFlags?.isMobile ? "Mobile" : a.internalFlags?.isDatacenter ? "Datacenter" : "Unknown",
      bVal: b.internalFlags?.isResidential ? "Residential" : b.internalFlags?.isMobile ? "Mobile" : b.internalFlags?.isDatacenter ? "Datacenter" : "Unknown",
      winner: null,
    },
    {
      label: "Exit IP",
      aVal: <code className="text-xs font-mono">{a.exitIp ?? "N/A"}</code>,
      bVal: <code className="text-xs font-mono">{b.exitIp ?? "N/A"}</code>,
      winner: null,
    },
    {
      label: "AI Use Cases",
      aVal: (
        <div className="flex flex-wrap gap-1 justify-center">
          {computeUseCaseTags(a).map(t => <span key={t.label} className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${t.cls}`}>{t.icon}{t.label}</span>)}
          {computeUseCaseTags(a).length === 0 && <span className="text-muted-foreground text-xs">—</span>}
        </div>
      ),
      bVal: (
        <div className="flex flex-wrap gap-1 justify-center">
          {computeUseCaseTags(b).map(t => <span key={t.label} className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${t.cls}`}>{t.icon}{t.label}</span>)}
          {computeUseCaseTags(b).length === 0 && <span className="text-muted-foreground text-xs">—</span>}
        </div>
      ),
      winner: null,
    },
  ];

  const aWins = rows.filter(r => r.winner === "a").length;
  const bWins = rows.filter(r => r.winner === "b").length;
  const overallWinner = aWins > bWins ? "a" : bWins > aWins ? "b" : "tie";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" data-testid="modal-comparison">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-xl border border-border bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Proxy Comparison</h2>
            {overallWinner !== "tie" && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs gap-1">
                <Star className="h-2.5 w-2.5" />
                Proxy {overallWinner === "a" ? "A" : "B"} wins ({overallWinner === "a" ? aWins : bWins} metrics)
              </Badge>
            )}
            {overallWinner === "tie" && (
              <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-border text-xs">Tie ({aWins} each)</Badge>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" data-testid="button-close-compare">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Proxy headers */}
        <div className="flex gap-3 px-5 py-3 border-b border-border shrink-0 bg-muted/20">
          <div className="w-28 shrink-0" />
          <div className={`flex-1 rounded-lg border px-3 py-2 text-center ${overallWinner === "a" ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-background"}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Proxy A</p>
            <code className="text-xs font-mono text-foreground break-all">{a.proxyString}</code>
            {overallWinner === "a" && <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">🏆 Winner</p>}
          </div>
          <div className={`flex-1 rounded-lg border px-3 py-2 text-center ${overallWinner === "b" ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-background"}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Proxy B</p>
            <code className="text-xs font-mono text-foreground break-all">{b.proxyString}</code>
            {overallWinner === "b" && <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">🏆 Winner</p>}
          </div>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-1.5">
          {rows.map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-[11px] text-muted-foreground font-medium">{row.label}</div>
              <CmpCell
                value={row.aVal}
                isWinner={row.winner === "a"}
                isTie={row.winner === "tie"}
                isLoser={row.winner === "b"}
              />
              <CmpCell
                value={row.bVal}
                isWinner={row.winner === "b"}
                isTie={row.winner === "tie"}
                isLoser={row.winner === "a"}
              />
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Green = better value · Red = worse value</p>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

function IpLookupResultPanel({ result }: { result: ProxyResult }) {
  const intel = result.intelligence;
  const flags = result.internalFlags;
  const gradeColor = intel
    ? intel.score >= 85 ? "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400"
    : intel.score >= 65 ? "from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400"
    : intel.score >= 45 ? "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30 text-yellow-400"
    : "from-red-500/20 to-red-500/5 border-red-500/30 text-red-400"
    : "from-muted/30 to-muted/5 border-border text-muted-foreground";

  const Row = ({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) => (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/40 last:border-b-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs text-right ${mono ? "font-mono" : ""} text-foreground/90 break-all`}>
        {value ?? <span className="text-muted-foreground/60">—</span>}
      </span>
    </div>
  );

  const fraud = result.fraudScore !== null ? Number(result.fraudScore) : null;
  const fraudColor = fraud === null ? "text-muted-foreground"
    : fraud <= 25 ? "text-emerald-400"
    : fraud <= 50 ? "text-yellow-400"
    : fraud <= 75 ? "text-orange-400"
    : "text-red-400";

  return (
    <div className="rounded-xl border border-border/60 bg-background/50 overflow-hidden" data-testid="panel-ip-lookup-result">
      {/* Header bar */}
      <div className={`relative bg-gradient-to-r ${gradeColor} border-b px-4 py-3 sm:px-5`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <code className="text-base font-mono font-bold tracking-tight" data-testid="text-lookup-ip">{result.exitIp}</code>
                <Badge variant="outline" className="text-[10px] h-5 border-current/30 bg-background/30">
                  {result.exitIpVersion?.toUpperCase()}
                </Badge>
                {result.isTorNode && (
                  <Badge variant="outline" className="text-[10px] h-5 border-red-500/40 bg-red-500/10 text-red-400">
                    TOR Exit
                  </Badge>
                )}
              </div>
              <p className="text-[11px] mt-0.5 opacity-80">
                {result.country ?? "Unknown"} {result.city ? `· ${result.city}` : ""}
              </p>
            </div>
          </div>
          {intel && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider opacity-70">Quality</p>
                <p className="text-2xl font-bold leading-none tabular-nums">{intel.score}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-background/30 border border-current/20">
                <span className="text-xl font-bold">{intel.grade}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/40">
        {/* Geo / Network */}
        <div className="p-4 sm:p-5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Globe className="h-3 w-3" /> Location & Network
          </h4>
          <Row label="Country" value={result.country} />
          <Row label="Region" value={result.region} />
          <Row label="City" value={result.city} />
          <Row label="Postal" value={result.postalCode} mono />
          <Row label="Coordinates" value={result.latitude != null && result.longitude != null
            ? `${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}`
            : null} mono />
          <Row label="ISP" value={result.isp} />
          <Row label="ASN" value={result.asn} mono />
          <Row label="Reverse DNS" value={result.reverseDns} mono />
          <Row label="Usage Type" value={result.usageType} />
          <Row label="Provider" value={result.provider?.name ?? "Unknown"} />
        </div>

        {/* Fraud / Signals */}
        <div className="p-4 sm:p-5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3" /> Risk & Signals
          </h4>
          <Row
            label="Scamalytics Score"
            value={fraud !== null
              ? <span className={`font-bold ${fraudColor}`}>{fraud}/100 <span className="text-muted-foreground font-normal">({result.fraudRisk})</span></span>
              : null}
          />
          <Row
            label="Connection Type"
            value={flags?.connectionType
              ? <span className="capitalize">{flags.connectionType}</span>
              : null}
          />
          <Row
            label="TOR Exit Node"
            value={result.isTorNode
              ? <span className="text-red-400 font-medium">Yes</span>
              : <span className="text-emerald-400">No</span>}
          />
          <Row
            label="Open Proxy Ports"
            value={result.openPorts.length > 0
              ? <span className="text-orange-400">{result.openPorts.join(", ")}</span>
              : <span className="text-emerald-400">None</span>}
          />
          <Row
            label="Datacenter"
            value={flags
              ? (flags.isDatacenter ? <span className="text-orange-400">Yes</span> : <span className="text-emerald-400">No</span>)
              : null}
          />
          <Row
            label="Residential"
            value={flags
              ? (flags.isResidential ? <span className="text-emerald-400">Yes</span> : <span className="text-muted-foreground">No</span>)
              : null}
          />
          <Row
            label="Mobile"
            value={flags
              ? (flags.isMobile ? <span className="text-blue-400">Yes</span> : <span className="text-muted-foreground">No</span>)
              : null}
          />
        </div>
      </div>

      {/* Quality verdict + reasons */}
      {intel && (
        <div className="border-t border-border/40 p-4 sm:p-5 bg-card/30">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Verdict — {intel.label}
            </h4>
          </div>
          <p className="text-xs text-foreground/80 mb-3 leading-relaxed">{intel.verdict}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {intel.reasons.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-[11px] border ${
                  r.type === "positive" ? "border-emerald-500/20 bg-emerald-500/5"
                  : r.type === "negative" ? "border-red-500/20 bg-red-500/5"
                  : r.type === "warning" ? "border-yellow-500/20 bg-yellow-500/5"
                  : "border-border/40 bg-muted/10"
                }`}
              >
                <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                  r.type === "positive" ? "bg-emerald-400"
                  : r.type === "negative" ? "bg-red-400"
                  : r.type === "warning" ? "bg-yellow-400"
                  : "bg-muted-foreground"
                }`} />
                <div className="min-w-0">
                  <p className="font-medium text-foreground/90">{r.label}</p>
                  <p className="text-muted-foreground leading-snug">{r.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [proxyText, setProxyText] = useState("");
  const [results, setResults] = useState<ProxyResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [totalProxies, setTotalProxies] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const [filterCountries, setFilterCountries] = useState<Set<string>>(new Set());
  const [filterCities, setFilterCities] = useState<Set<string>>(new Set());
  const [filterIsps, setFilterIsps] = useState<Set<string>>(new Set());
  const [filterUsageTypes, setFilterUsageTypes] = useState<Set<string>>(new Set());
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [filterGrade, setFilterGrade] = useState<"all" | "good" | "risky">("all");
  const [filterIpVersion, setFilterIpVersion] = useState<"all" | "v4" | "v6">("v4");
  const [filterConnectionType, setFilterConnectionType] = useState<"all" | "residential" | "mobile" | "datacenter">("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [sortBy, setSortBy] = useState<"default" | "score" | "latency" | "grade" | "country">("default");
  const [compareKeys, setCompareKeys] = useState<string[]>([]);
  const [testAllSignal, setTestAllSignal] = useState(0);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // IP Lookup mode
  const [inputMode, setInputMode] = useState<"proxies" | "ip">("proxies");
  const [ipInput, setIpInput] = useState("");
  const [ipLookupResult, setIpLookupResult] = useState<ProxyResult | null>(null);
  const [ipLookupError, setIpLookupError] = useState<string | null>(null);
  const [isLookingUpIp, setIsLookingUpIp] = useState(false);

  const { toast } = useToast();

  const handleIpLookup = async () => {
    const ip = ipInput.trim();
    if (!ip) {
      toast({ title: "No IP", description: "Please enter an IP address.", variant: "destructive" });
      return;
    }
    setIsLookingUpIp(true);
    setIpLookupResult(null);
    setIpLookupError(null);
    try {
      const res = await fetch("/api/lookup-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setIpLookupError(data?.error || `HTTP ${res.status}`);
        return;
      }
      setIpLookupResult(data.result);
    } catch (err: any) {
      setIpLookupError(err?.message || "Request failed");
    } finally {
      setIsLookingUpIp(false);
    }
  };

  const handleCheck = async () => {
    const lines = proxyText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length === 0) {
      toast({ title: "No Proxies", description: "Please enter at least one proxy string.", variant: "destructive" });
      return;
    }
    if (lines.length > MAX_PROXIES) {
      toast({ title: "Too Many Proxies", description: `Maximum ${MAX_PROXIES} proxies allowed.`, variant: "destructive" });
      return;
    }

    setResults([]);
    setCheckedCount(0);
    setTotalProxies(lines.length);
    setIsChecking(true);
    setFilterCountries(new Set());
    setFilterCities(new Set());
    setFilterIsps(new Set());
    setFilterUsageTypes(new Set());
    setScoreRange([0, 100]);
    setFilterGrade("all");
    setFilterConnectionType("all");
    setCompareKeys([]);
    setShowCompareModal(false);

    const abort = new AbortController();
    abortRef.current = abort;

    // Deduplicate proxies (same as server did)
    const uniqueProxies = Array.from(new Set(lines));
    setTotalProxies(uniqueProxies.length);

    // Parallel single-proxy fetches with concurrency limit (works on Replit + Vercel serverless)
    const CONCURRENCY = 10;
    let nextIdx = 0;
    let firstError: string | null = null;

    const worker = async () => {
      while (nextIdx < uniqueProxies.length) {
        if (abort.signal.aborted) return;
        const idx = nextIdx++;
        const proxy = uniqueProxies[idx];
        try {
          const res = await fetch("/api/check-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ proxy }),
            signal: abort.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          if (abort.signal.aborted) return;
          if (json?.result) {
            setResults((prev) => [...prev, json.result]);
          }
          setCheckedCount((prev) => prev + 1);
        } catch (err: any) {
          if (err?.name === "AbortError") return;
          if (!firstError) firstError = err?.message || "Request failed";
          setCheckedCount((prev) => prev + 1);
        }
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, uniqueProxies.length) }, () => worker())
      );
      if (!abort.signal.aborted) {
        toast({
          title: "Scan Complete",
          description: `Done checking ${uniqueProxies.length} ${uniqueProxies.length === 1 ? "proxy" : "proxies"}.${firstError ? ` (some errors: ${firstError})` : ""}`,
        });
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    } finally {
      setIsChecking(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsChecking(false);
  };

  const toggleCompare = (key: string) => {
    setCompareKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : prev.length < 2 ? [...prev, key] : prev);
  };

  // ── Normalize any proxy line to canonical host:port:user:pass format ──
  const normalizeProxyLine = (raw: string): string => {
    const s = raw.trim();
    if (!s) return s;
    const isValidPort = (v: string) => /^\d{1,5}$/.test(v) && +v > 0 && +v <= 65535;
    const toCanonical = (host: string, port: string, user?: string, pass?: string) =>
      user && pass ? `${host}:${port}:${user}:${pass}` : user ? `${host}:${port}:${user}` : `${host}:${port}`;

    // IPv6 bracket notation — pass through unchanged
    if (s.startsWith("[")) return s;

    const atIdx = s.indexOf("@");
    if (atIdx !== -1) {
      const before = s.slice(0, atIdx);
      const after  = s.slice(atIdx + 1);
      const beforeLastColon = before.lastIndexOf(":");
      // host:port@user:pass
      if (beforeLastColon !== -1 && isValidPort(before.slice(beforeLastColon + 1))) {
        const host = before.slice(0, beforeLastColon);
        const port = before.slice(beforeLastColon + 1);
        const c = after.indexOf(":");
        return toCanonical(host, port, c === -1 ? after : after.slice(0, c), c === -1 ? undefined : after.slice(c + 1));
      }
      // user:pass@host:port
      const afterLastColon = after.lastIndexOf(":");
      if (afterLastColon !== -1 && isValidPort(after.slice(afterLastColon + 1))) {
        const host = after.slice(0, afterLastColon);
        const port = after.slice(afterLastColon + 1);
        const c = before.indexOf(":");
        return toCanonical(host, port, c === -1 ? before : before.slice(0, c), c === -1 ? undefined : before.slice(c + 1));
      }
      return s;
    }
    // Already host:port[:user[:pass]] — pass through
    return s;
  };

  const normalizeAll = () =>
    setProxyText(prev => prev.split("\n").map(normalizeProxyLine).join("\n"));

  const handleClear = () => {
    handleStop();
    setProxyText("");
    setResults([]);
    setCheckedCount(0);
    setTotalProxies(0);
    setFilterCountries(new Set());
    setFilterCities(new Set());
    setFilterIsps(new Set());
    setFilterUsageTypes(new Set());
    setScoreRange([0, 100]);
    setFilterGrade("all");
    setFilterConnectionType("all");
    setCompareKeys([]);
    setShowCompareModal(false);
  };

  const handleExport = () => {
    const working = results.filter((r) => r.working).map((r) => r.proxyString).join("\n");
    const blob = new Blob([working], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "working-proxies.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const availableCountries = useMemo(() => {
    const s = new Set<string>();
    results.forEach((r) => { if (r.working && r.country) s.add(r.country); });
    return Array.from(s).sort();
  }, [results]);

  const availableCities = useMemo(() => {
    const s = new Set<string>();
    results.forEach((r) => { if (r.working && r.city) s.add(r.city); });
    return Array.from(s).sort();
  }, [results]);

  const availableIsps = useMemo(() => {
    const s = new Set<string>();
    results.forEach((r) => { if (r.working && r.isp) s.add(r.isp); });
    return Array.from(s).sort();
  }, [results]);

  const availableUsageTypes = useMemo(() => {
    const s = new Set<string>();
    results.forEach((r) => { if (r.working && r.usageType) s.add(r.usageType); });
    return Array.from(s).sort();
  }, [results]);

  const clearAllFilters = () => {
    setFilterCountries(new Set());
    setFilterCities(new Set());
    setFilterIsps(new Set());
    setFilterUsageTypes(new Set());
    setScoreRange([0, 100]);
    setFilterGrade("all");
    setFilterIpVersion("v4");
    setFilterConnectionType("all");
  };

  const hasActiveFilters =
    filterCountries.size > 0 || filterCities.size > 0 ||
    filterIsps.size > 0 || filterUsageTypes.size > 0 ||
    scoreRange[0] !== 0 || scoreRange[1] !== 100 ||
    filterGrade !== "all" || filterIpVersion !== "v4" ||
    filterConnectionType !== "all";

  const filteredResults = useMemo(() => {
    let filtered = results.filter((r) => {
      if (filterCountries.size > 0 && !(r.country && filterCountries.has(r.country))) return false;
      if (filterCities.size > 0 && !(r.city && filterCities.has(r.city))) return false;
      if (filterIsps.size > 0 && !(r.isp && filterIsps.has(r.isp))) return false;
      if (filterUsageTypes.size > 0 && !(r.usageType && filterUsageTypes.has(r.usageType))) return false;
      if (filterGrade === "good" && (!r.intelligence || r.intelligence.score < 60)) return false;
      if (filterGrade === "risky" && (!r.intelligence || r.intelligence.score >= 60)) return false;
      if (filterIpVersion === "v4" && r.exitIpVersion !== "v4") return false;
      if (filterIpVersion === "v6" && r.exitIpVersion !== "v6") return false;
      if (filterConnectionType === "residential" && !r.internalFlags?.isResidential) return false;
      if (filterConnectionType === "mobile" && !r.internalFlags?.isMobile) return false;
      if (filterConnectionType === "datacenter" && !r.internalFlags?.isDatacenter) return false;
      if (r.fraudScore !== null) {
        const score = parseInt(r.fraudScore);
        if (score < scoreRange[0] || score > scoreRange[1]) return false;
      } else if (scoreRange[0] !== 0 || scoreRange[1] !== 100) {
        return false;
      }
      return true;
    });
    if (sortBy === "default") return filtered;
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "score": return (b.intelligence?.score ?? -1) - (a.intelligence?.score ?? -1);
        case "latency": {
          const al = a.latencyMs ?? Infinity, bl = b.latencyMs ?? Infinity;
          return al - bl;
        }
        case "grade": {
          const gradeOrder = ["A+", "A", "B", "C", "D", "F"];
          const ai = gradeOrder.indexOf(a.intelligence?.grade ?? "F");
          const bi = gradeOrder.indexOf(b.intelligence?.grade ?? "F");
          return ai - bi;
        }
        case "country": return (a.country ?? "").localeCompare(b.country ?? "");
        default: return 0;
      }
    });
  }, [results, filterCountries, filterCities, filterIsps, filterUsageTypes, scoreRange, filterGrade, filterIpVersion, filterConnectionType, sortBy]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, val: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val); else next.add(val);
      return next;
    });
  };

  const proxyCount = proxyText.split("\n").filter((l) => l.trim().length > 0).length;
  const workingCount = results.filter((r) => r.working).length;
  const failedCount = results.filter((r) => !r.working).length;
  const progressPct = totalProxies > 0 ? Math.round((checkedCount / totalProxies) * 100) : 0;

  const avgScore = useMemo(() => {
    const scores = results.filter(r => r.intelligence).map(r => r.intelligence!.score);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [results]);

  const showHero = !isChecking && results.length === 0;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-gradient-to-b from-primary/[0.07] via-primary/[0.02] to-transparent" />
      <div className="pointer-events-none absolute top-[-200px] left-1/2 -translate-x-1/2 h-[400px] w-[800px] rounded-full bg-primary/10 blur-[120px]" />

      <header className="relative border-b border-border/60 bg-background/70 backdrop-blur-xl sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/20">
                <Shield className="h-4.5 w-4.5" />
                <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight leading-none">ProxyCheck</h1>
                <p className="text-[11px] text-muted-foreground mt-0.5">Proxy Intelligence & Fraud Analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {avgScore !== null && (
                <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5">
                  <Brain className={`h-3.5 w-3.5 ${avgScore >= 70 ? "text-emerald-400" : avgScore >= 50 ? "text-yellow-400" : "text-red-400"}`} />
                  <span className="text-xs text-muted-foreground">Avg Score:</span>
                  <span className={`text-xs font-bold tabular-nums ${avgScore >= 70 ? "text-emerald-400" : avgScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>{avgScore}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-6">
        {showHero && (
          <section className="pt-10 pb-4 text-center space-y-4">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 backdrop-blur-sm px-3 py-1 text-[11px] text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              All systems operational · Real-time scanning
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Check up to <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">200 proxies</span> in seconds
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Geo, ISP, fraud score, TOR, port scan, anonymity level, and an AI-graded quality score — all in one scan.
            </p>
          </section>
        )}

        <Card className="relative border-card-border bg-card/80 backdrop-blur-sm p-0 overflow-hidden shadow-xl shadow-black/20">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="border-b border-border/60 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 p-1">
                <button
                  onClick={() => setInputMode("proxies")}
                  data-testid="tab-proxies"
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    inputMode === "proxies"
                      ? "bg-primary/15 text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Network className="h-3.5 w-3.5" />
                  Proxy Check
                </button>
                <button
                  onClick={() => setInputMode("ip")}
                  data-testid="tab-ip-lookup"
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    inputMode === "ip"
                      ? "bg-primary/15 text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Search className="h-3.5 w-3.5" />
                  IP Lookup
                </button>
              </div>
              {inputMode === "proxies" ? (
                <div className="flex items-center gap-2">
                  <span className="hidden md:inline text-xs text-muted-foreground">
                    Format: <code className="font-mono text-xs text-foreground/80">host:port:user:pass</code>
                  </span>
                  <Badge variant="outline" className={`tabular-nums ${proxyCount > MAX_PROXIES ? "text-xs border-red-500/30 text-red-400" : proxyCount > 0 ? "text-xs border-primary/30 text-primary" : "text-xs"}`}>
                    {proxyCount}/{MAX_PROXIES}
                  </Badge>
                </div>
              ) : (
                <span className="hidden md:inline text-xs text-muted-foreground">
                  IPv4 or IPv6 — full geo / fraud / ASN intelligence
                </span>
              )}
            </div>
          </div>

          {inputMode === "proxies" ? (
            <div className="p-4 sm:p-5 space-y-4">
              <Textarea
                placeholder={"1.2.3.4:8080:user:pass\nuser:pass@1.2.3.4:8080\n1.2.3.4:8080@user:pass\n9.10.11.12:1080"}
                value={proxyText}
                onChange={(e) => setProxyText(e.target.value)}
                className="min-h-[180px] font-mono text-sm resize-y bg-background/60 border-border/60 focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/30 transition-colors"
                data-testid="input-proxy-list"
                disabled={isChecking}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData("text");
                  const normalized = pasted.split("\n").map(normalizeProxyLine).join("\n");
                  const ta = e.currentTarget;
                  const start = ta.selectionStart ?? 0;
                  const end = ta.selectionEnd ?? 0;
                  const next = proxyText.slice(0, start) + normalized + proxyText.slice(end);
                  setProxyText(next);
                }}
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">Paste 1–{MAX_PROXIES} proxy strings, one per line.</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={normalizeAll} disabled={!proxyText || isChecking} data-testid="button-normalize" title="Convert all proxy lines to host:port:user:pass format">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Format All
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleClear} disabled={!proxyText && results.length === 0 && !isChecking} data-testid="button-clear">
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />Clear
                  </Button>
                  {isChecking ? (
                    <Button size="sm" variant="destructive" onClick={handleStop} data-testid="button-stop">
                      <X className="h-3.5 w-3.5 mr-1.5" />Stop
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleCheck} disabled={proxyCount === 0} data-testid="button-check"
                      className="bg-gradient-to-b from-primary to-primary/85 hover:from-primary/90 hover:to-primary/75 shadow-lg shadow-primary/25 disabled:shadow-none transition-all">
                      <Shield className="h-3.5 w-3.5 mr-1.5" />Check Proxies
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !isLookingUpIp) handleIpLookup(); }}
                    placeholder="Enter IPv4 or IPv6 address (e.g. 8.8.8.8)"
                    data-testid="input-ip-lookup"
                    disabled={isLookingUpIp}
                    className="w-full h-11 pl-10 pr-3 rounded-md border border-border/60 bg-background/60 font-mono text-sm focus-visible:outline-none focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/30 transition-colors disabled:opacity-50"
                  />
                </div>
                <Button
                  onClick={handleIpLookup}
                  disabled={!ipInput.trim() || isLookingUpIp}
                  data-testid="button-lookup-ip"
                  className="h-11 px-5 bg-gradient-to-b from-primary to-primary/85 hover:from-primary/90 hover:to-primary/75 shadow-lg shadow-primary/25 disabled:shadow-none transition-all"
                >
                  {isLookingUpIp ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Looking up…</>
                  ) : (
                    <><Search className="h-4 w-4 mr-1.5" />Lookup</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Geo, ISP, ASN, fraud score, usage type, reverse DNS, TOR check, and quality grade — all in one lookup.
              </p>

              {ipLookupError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400" data-testid="text-ip-lookup-error">
                  {ipLookupError}
                </div>
              )}

              {ipLookupResult && <IpLookupResultPanel result={ipLookupResult} />}
            </div>
          )}
        </Card>

        {isChecking && (
          <Card className="border-card-border bg-card p-0">
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Scanning proxies…</p>
                    <p className="text-xs text-muted-foreground">Checking geo data, fraud scores, ports & TOR status</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-foreground">{checkedCount}<span className="text-muted-foreground font-normal text-xs">/{totalProxies}</span></p>
                  <p className="text-[11px] text-muted-foreground">{progressPct}% done</p>
                </div>
              </div>
              <Progress value={progressPct} className="h-1" />
            </div>
          </Card>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            <StatsDashboard results={results} />

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Results
                </h2>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 tabular-nums text-xs">{workingCount} OK</Badge>
                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 tabular-nums text-xs">{failedCount} Fail</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${sortBy !== "default" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
                      data-testid="sort-by"
                    >
                      <ArrowUpDown className="h-3 w-3" />
                      Sort{sortBy !== "default" && `: ${sortBy}`}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-36 p-1">
                    {(["default", "score", "latency", "grade", "country"] as const).map((val) => {
                      const labels: Record<string, string> = { default: "Default", score: "Score", latency: "Fastest first", grade: "Grade", country: "Country" };
                      return (
                        <button
                          key={val}
                          onClick={() => setSortBy(val)}
                          data-testid={`sort-${val}`}
                          className={`w-full text-left rounded px-2 py-1.5 text-xs transition-colors ${sortBy === val ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                        >
                          {labels[val]}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>

                <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5" data-testid="view-toggle">
                  <button onClick={() => setViewMode("cards")} className={`rounded p-1.5 transition-colors ${viewMode === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`} data-testid="view-cards" title="Card view">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setViewMode("table")} className={`rounded p-1.5 transition-colors ${viewMode === "table" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`} data-testid="view-table" title="Table view">
                    <List className="h-3.5 w-3.5" />
                  </button>
                </div>

                {workingCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setTestAllSignal(s => s + 1)}
                      className="h-7 gap-1.5 px-2.5 text-xs text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                      data-testid="button-test-all-stability"
                      title={`Run IP stability test on all ${workingCount} working ${workingCount === 1 ? "proxy" : "proxies"}`}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Test All ({workingCount})
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport} className="h-7 gap-1.5 px-2.5 text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10" data-testid="button-export">
                      <Download className="h-3.5 w-3.5" />Export
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card px-3 py-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium pr-1 border-r border-border mr-1">
                Filter
              </span>
              <FilterDropdown
                label="Country" options={availableCountries} selected={filterCountries}
                onToggle={(v) => toggle(setFilterCountries, v)} onClear={() => setFilterCountries(new Set())}
                testId="filter-country"
              />
              <FilterDropdown
                label="Region" options={availableCities} selected={filterCities}
                onToggle={(v) => toggle(setFilterCities, v)} onClear={() => setFilterCities(new Set())}
                testId="filter-region"
              />
              <FilterDropdown
                label="ISP" options={availableIsps} selected={filterIsps}
                onToggle={(v) => toggle(setFilterIsps, v)} onClear={() => setFilterIsps(new Set())}
                testId="filter-isp"
              />
              <FilterDropdown
                label="Usage Type" options={availableUsageTypes} selected={filterUsageTypes}
                onToggle={(v) => toggle(setFilterUsageTypes, v)} onClear={() => setFilterUsageTypes(new Set())}
                testId="filter-usage-type"
              />
              <ScoreRangeFilter range={scoreRange} onChange={setScoreRange} />

              <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5" data-testid="filter-grade">
                {(["all", "good", "risky"] as const).map((val) => {
                  const labels: Record<string, string> = { all: "All", good: "Safe IPs", risky: "Risky IPs" };
                  const isActive = filterGrade === val;
                  return (
                    <button
                      key={val}
                      onClick={() => setFilterGrade(val)}
                      data-testid={`filter-grade-${val}`}
                      className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                        isActive
                          ? val === "good"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                            : val === "risky"
                            ? "bg-red-500/15 text-red-400 border border-red-500/25"
                            : "bg-primary/15 text-primary border border-primary/20"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        {val === "good" && <ShieldCheck className="h-2.5 w-2.5" />}
                        {val === "risky" && <ShieldAlert className="h-2.5 w-2.5" />}
                        {labels[val]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5" data-testid="filter-ip-version">
                {(["all", "v4", "v6"] as const).map((val) => {
                  const labels: Record<string, string> = { all: "All IPs", v4: "IPv4 Only", v6: "IPv6 Only" };
                  const isActive = filterIpVersion === val;
                  return (
                    <button
                      key={val}
                      onClick={() => setFilterIpVersion(val)}
                      data-testid={`filter-ip-version-${val}`}
                      className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                        isActive
                          ? val === "v4"
                            ? "bg-sky-500/15 text-sky-400 border border-sky-500/25"
                            : val === "v6"
                            ? "bg-violet-500/15 text-violet-400 border border-violet-500/25"
                            : "bg-primary/15 text-primary border border-primary/20"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {labels[val]}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5" data-testid="filter-conn-type">
                {(["all", "residential", "mobile", "datacenter"] as const).map((val) => {
                  const labels: Record<string, string> = { all: "All Types", residential: "Residential", mobile: "Mobile", datacenter: "Datacenter" };
                  const isActive = filterConnectionType === val;
                  const colorsMap: Record<string, string> = {
                    residential: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
                    mobile: "bg-sky-500/15 text-sky-400 border border-sky-500/25",
                    datacenter: "bg-red-500/15 text-red-400 border border-red-500/25",
                    all: "bg-primary/15 text-primary border border-primary/20",
                  };
                  return (
                    <button
                      key={val}
                      onClick={() => setFilterConnectionType(val)}
                      data-testid={`filter-conn-${val}`}
                      className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${isActive ? colorsMap[val] : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {labels[val]}
                    </button>
                  );
                })}
              </div>

              {hasActiveFilters && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{filteredResults.length} of {results.length} shown</span>
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    data-testid="button-clear-filters"
                  >
                    <X className="h-3 w-3" /> Clear all
                  </button>
                </div>
              )}
            </div>

            {filteredResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">No results match the active filters.</p>
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={clearAllFilters}>
                  Clear filters
                </Button>
              </div>
            ) : viewMode === "table" ? (
              <TableView results={filteredResults} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {(() => {
                  let workingIdx = 0;
                  return filteredResults.map((result, i) => {
                    const key = result.proxyString;
                    const si = result.working ? workingIdx++ : -1;
                    return (
                      <ProxyCard
                        key={key + i}
                        result={result}
                        index={i}
                        isInCompare={compareKeys.includes(key)}
                        canCompare={!compareKeys.includes(key) && compareKeys.length < 2}
                        onToggleCompare={() => toggleCompare(key)}
                        testAllSignal={testAllSignal}
                        staggerIndex={si}
                      />
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}

        {!isChecking && results.length === 0 && (
          <div className="pt-2 pb-12">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: Globe, title: "Geo & ISP", desc: "Country, city, ISP, ASN, coordinates from 5 providers" },
                { icon: ShieldAlert, title: "Fraud Score", desc: "Live Scamalytics risk + IP2Location usage type" },
                { icon: Brain, title: "Quality Grade", desc: "A+ to F score with full reasoning panel" },
              ].map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="group relative rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 hover:border-primary/30 hover:bg-card/60 transition-all"
                  data-testid={`card-feature-${title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-sm font-semibold">{title}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground/70 mt-8">
              Paste proxies above and hit <span className="text-foreground/80 font-medium">Check Proxies</span> to begin.
            </p>
          </div>
        )}
      </main>

      {/* Floating Compare Bar */}
      {compareKeys.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl border border-primary/30 bg-card/95 backdrop-blur-sm px-5 py-3 shadow-2xl shadow-primary/10" data-testid="bar-compare">
          <BarChart3 className="h-4 w-4 text-primary shrink-0" />
          <div className="flex items-center gap-2">
            {compareKeys.map((k, idx) => (
              <div key={k} className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-1">
                <span className="text-[10px] text-primary font-bold">{idx === 0 ? "A" : "B"}</span>
                <code className="text-xs font-mono text-foreground max-w-[120px] truncate">{k.split(":")[0]}:{k.split(":")[1]}</code>
                <button onClick={() => setCompareKeys(prev => prev.filter(x => x !== k))} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {compareKeys.length === 1 && (
              <span className="text-xs text-muted-foreground">Select 1 more proxy to compare</span>
            )}
          </div>
          {compareKeys.length === 2 && (
            <Button
              size="sm"
              className="h-7 px-3 text-xs gap-1.5 shrink-0"
              onClick={() => setShowCompareModal(true)}
              data-testid="button-open-compare"
            >
              <BarChart3 className="h-3 w-3" />
              Compare Now
            </Button>
          )}
          <button onClick={() => { setCompareKeys([]); setShowCompareModal(false); }} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="button-dismiss-compare">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Comparison Modal */}
      {showCompareModal && compareKeys.length === 2 && (() => {
        const proxyA = results.find(r => r.proxyString === compareKeys[0]);
        const proxyB = results.find(r => r.proxyString === compareKeys[1]);
        if (!proxyA || !proxyB) return null;
        return <ComparisonModal a={proxyA} b={proxyB} onClose={() => setShowCompareModal(false)} />;
      })()}
    </div>
  );
}
