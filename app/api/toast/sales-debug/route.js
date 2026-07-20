import { getToastToken } from "@/lib/toast";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDate = searchParams.get("businessDate");
    const guid = searchParams.get("guid") || process.env.TOAST_RESTAURANT_GUID;

    if (!businessDate) {
      return Response.json({ ok: false, error: "Falta businessDate" }, { status: 400 });
    }

    const token = await getToastToken();
    const headers = {
      Authorization: "Bearer " + token,
      "Toast-Restaurant-External-ID": guid,
    };

    const listUrl = process.env.TOAST_API_HOST + "/orders/v2/orders?businessDate=" + businessDate;
    const listRes = await fetch(listUrl, { headers });
    if (!listRes.ok) {
      const t = await listRes.text();
      return Response.json({ ok: false, step: "list", status: listRes.status, body: t }, { status: 500 });
    }
    const orderGuids = await listRes.json();

    let grossSales = 0;
    let voidedCount = 0;
    let errorCount = 0;
    const errorSamples = [];
    const BATCH = 3;

    for (let i = 0; i < orderGuids.length; i += BATCH) {
      const batch = orderGuids.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (og) => {
          try {
            const r = await fetch(process.env.TOAST_API_HOST + "/orders/v2/orders/" + og, { headers });
            if (!r.ok) {
              const t = await r.text();
              return { error: true, status: r.status, body: t.slice(0, 200) };
            }
            return await r.json();
          } catch (e) {
            return { error: true, status: "fetch_failed", body: e.message };
          }
        })
      );
      results.forEach((order) => {
        if (!order || order.error) {
          errorCount++;
          if (errorSamples.length < 3) errorSamples.push(order);
          return;
        }
        if (order.voided) { voidedCount++; return; }
        (order.checks || []).forEach((check) => {
          if (check.voided) return;
          (check.selections || []).forEach((sel) => {
            if (sel.voided) return;
            grossSales += (sel.preDiscountPrice || sel.price || 0);
          });
        });
      });
      await new Promise((r) => setTimeout(r, 150));
    }

    return Response.json({
      ok: true,
      totalOrders: orderGuids.length,
      voidedCount,
      errorCount,
      errorSamples,
      grossSales: Math.round(grossSales * 100) / 100,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
