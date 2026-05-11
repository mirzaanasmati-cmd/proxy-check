// Shared CORS preflight + headers helper for Vercel API handlers.
export function applyCors(req: any, res: any): boolean {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
