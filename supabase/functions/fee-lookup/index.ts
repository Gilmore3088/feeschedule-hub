import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return json({ error: "q required" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: targets, error } = await sb
    .from("crawl_targets")
    .select("*")
    .ilike("institution_name", `%${q}%`)
    .order("asset_size", { ascending: false })
    .limit(10);

  if (error) return json({ error: error.message }, 500);
  if (!targets?.length) return json({ found: false, query: q });

  const id = targets[0].id;

  const [{ data: fees }, { data: crawlResults }] = await Promise.all([
    sb.from("extracted_fees").select("*").eq("crawl_target_id", id).limit(500),
    sb.from("crawl_results").select("*").eq("crawl_target_id", id).order("id", { ascending: false }).limit(10),
  ]);

  return json({ found: true, query: q, institution: targets[0], targets, fees: fees || [], crawlResults: crawlResults || [] });
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
