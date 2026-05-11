import { lookupIp } from "../server/routes";
import { applyCors } from "./_cors";

export const config = { maxDuration: 10 };

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
    const { ip } = body;
    const result = await lookupIp(ip);
    if (!("working" in result)) return res.status(400).json(result);
    return res.status(200).json({ result });
  } catch (err: any) {
    console.error("[api/lookup-ip] error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
