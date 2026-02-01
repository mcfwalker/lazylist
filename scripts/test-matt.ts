import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { searchHN } from "../src/lib/discovery/hackernews";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MATT_ID = "4bceb77f-0c21-4644-a2da-dc951d178f00";
const queries = ["ai", "ai-agents", "filmmaking"];

async function run() {
  console.log("Searching HN for Matt...\n");
  let stored = 0;

  for (const query of queries) {
    const results = await searchHN(query, { days: 7, minPoints: 20, limit: 3 });
    console.log(`"${query}" → ${results.length} results`);

    for (const r of results) {
      const url = r.url || r.hnUrl;
      const { error } = await supabase.from("memos").upsert(
        {
          user_id: MATT_ID,
          source_url: url,
          source_platform: "hackernews",
          external_id: r.id,
          title: r.title,
          summary: `${r.points} points, ${r.comments} comments`,
          relevance_score: 0.9,
          relevance_reason: `Matches your interest in "${query}"`,
          matched_interests: [{ type: "topic", value: query }],
          status: "pending",
        },
        { onConflict: "user_id,source_url", ignoreDuplicates: true }
      );

      if (!error) {
        stored++;
        console.log(`  ✓ ${r.title.slice(0, 55)}...`);
      }
    }
  }
  console.log(`\n✅ Stored ${stored} memos for Matt`);
}

run();
