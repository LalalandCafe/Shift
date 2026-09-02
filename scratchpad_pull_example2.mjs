import fs from "fs";
const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const { buildDailyReport } = await import("./lib/report.js");
const { scoreStores, weightedRating, efficiencyOf, laborComponentOf, ratingComponentOf, rankableRating, MIN_REVIEWS_TO_RANK, RATING_TARGET, LABOR_COMPONENT_CAP } = await import("./lib/leaderboard.js");

const date = process.argv[2] || new Date(Date.now() - 86400000).toISOString().slice(0,10);
const report = await buildDailyReport(date);

const { rows, byScore, rank } = scoreStores(report.rows, "period");

console.log("=== top 5 by score (period window) ===");
byScore.slice(0,5).forEach(s => {
  console.log(s.code, s.name, "eff:", s.eff?.toFixed(1), "labor:", laborComponentOf(s)?.toFixed(1), "ratingComp:", ratingComponentOf(s)?.toFixed(1), "score:", s.score, "periodReviews:", s.reviews?.period?.count, s.reviews?.period?.rating, "scoredOnLaborOnly:", s.scoredOnLaborOnly);
});

console.log("\n=== stores below MIN_REVIEWS_TO_RANK (period) ===");
report.rows.forEach(s => {
  const cnt = s.reviews?.period?.count;
  if (cnt !== undefined && cnt !== null && cnt < MIN_REVIEWS_TO_RANK && cnt > 0) {
    console.log(s.code, s.name, "periodCount:", cnt, "periodRating:", s.reviews.period.rating, "rankable:", rankableRating({rev: s.reviews.period}));
  }
});

console.log("\n=== chain-wide weighted rating ===");
console.log("period:", weightedRating(report.rows, "period"));
console.log("week:", weightedRating(report.rows, "week"));

// full detail on store 10001 for worked example
const bell = report.rows.find(r => r.code === 10001);
console.log("\n=== DFW Bell (10001) full ===");
console.log(JSON.stringify(bell, null, 2));
console.log("eff:", efficiencyOf(bell), "labor comp:", laborComponentOf(bell), "rating comp:", ratingComponentOf(bell));
