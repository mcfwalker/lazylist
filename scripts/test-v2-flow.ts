// Quick test of v2 flow: discovery + digest preview
// Run with: npx tsx scripts/test-v2-flow.ts

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { searchHN } from "../src/lib/discovery/hackernews";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
  console.log("=== MollyMemo v2 Flow Test ===\n");

  // 1. Get user
  const { data: user } = await supabase
    .from("users")
    .select("id, display_name")
    .limit(1)
    .single();

  if (!user) {
    console.error("No user found");
    process.exit(1);
  }
  console.log(`User: ${user.display_name} (${user.id})\n`);

  // 2. Get top interests
  const { data: interests } = await supabase
    .from("user_interests")
    .select("interest_type, value, weight")
    .eq("user_id", user.id)
    .order("weight", { ascending: false })
    .limit(10);

  console.log("Top interests:");
  interests?.forEach((i) =>
    console.log(`  ${i.interest_type}: ${i.value} (${i.weight})`)
  );

  // 3. Pick top 3 topic/tool interests for search
  const queries = (interests || [])
    .filter((i) => i.interest_type === "topic" || i.interest_type === "tool")
    .slice(0, 3)
    .map((i) => i.value);

  console.log(`\nSearching HN for: ${queries.join(", ")}\n`);

  // 4. Search HN
  let totalResults = 0;
  let storedCount = 0;

  for (const query of queries) {
    const results = await searchHN(query, { days: 7, minPoints: 15, limit: 3 });
    console.log(`"${query}" → ${results.length} results`);

    for (const result of results) {
      totalResults++;
      const url = result.url || result.hnUrl;

      // Check if already exists
      const { data: existing } = await supabase
        .from("memos")
        .select("id")
        .eq("user_id", user.id)
        .eq("source_url", url)
        .single();

      if (existing) {
        console.log(`  ⏭ ${result.title.slice(0, 50)}... (already exists)`);
        continue;
      }

      // Store memo
      const matchedInterest = interests?.find((i) => i.value === query);
      const { error } = await supabase.from("memos").insert({
        user_id: user.id,
        source_url: url,
        source_platform: "hackernews",
        external_id: result.id,
        title: result.title,
        summary: `${result.points} points, ${result.comments} comments`,
        relevance_score: matchedInterest?.weight || 0.5,
        relevance_reason: `Matches your interest in "${query}"`,
        matched_interests: [{ type: "topic", value: query }],
        status: "pending",
      });

      if (!error) {
        storedCount++;
        console.log(`  ✓ ${result.title.slice(0, 50)}...`);
      }
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Searched: ${queries.length} interests`);
  console.log(`Found: ${totalResults} HN articles`);
  console.log(`Stored: ${storedCount} new memos\n`);

  // 5. Show what digest would include
  const { data: pendingMemos } = await supabase
    .from("memos")
    .select("title, relevance_reason")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("relevance_score", { ascending: false })
    .limit(5);

  const { data: recentItems } = await supabase
    .from("items")
    .select("title")
    .eq("user_id", user.id)
    .eq("status", "processed")
    .gte("processed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(5);

  console.log("=== Digest Preview ===\n");
  console.log("Your captures (last 24h):");
  if (recentItems?.length) {
    recentItems.forEach((i) => console.log(`  • ${i.title}`));
  } else {
    console.log("  (none)");
  }

  console.log("\nMolly's discoveries:");
  if (pendingMemos?.length) {
    pendingMemos.forEach((m) =>
      console.log(`  • ${m.title}\n    ${m.relevance_reason}`)
    );
  } else {
    console.log("  (none)");
  }

  console.log("\n✅ Test complete!");
}

test().catch(console.error);
