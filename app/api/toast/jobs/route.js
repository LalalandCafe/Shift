import { getJobsMap } from "@/lib/toast-labels";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const guid = searchParams.get("guid");
    const jobsMap = await getJobsMap(guid);
    const titles = Object.values(jobsMap).sort();
    return Response.json({ ok: true, count: titles.length, titles, raw: jobsMap });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
