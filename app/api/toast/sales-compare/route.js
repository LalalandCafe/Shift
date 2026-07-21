import { getToastToken } from "@/lib/toast";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDate = searchParams.get("businessDate");
    const guid = searchParams.get("guid");
    if (!businessDate || !guid) {
      return Response.json({ ok: false, error: "Falta businessDate o guid" }, { status: 400 });
    }

    const token = await getToastToken();
    const headers = {
      Authorization: "Bearer " + token,
      "Toast-Restaurant-External-ID": guid,
    };

    const listUrl = process.env.TOAST_API_HOST + "/orders/v2/orders?businessDate=" + businessDate;
    const listRes = await fetch(listUrl, { headers });
    if (!listRes.ok) throw new Error("list fallo: " + (await listRes.text()));
    const orderGuids = await listRes.json();

    let m1_preDiscount = 0;
    let m2_checkAmount = 0;
    let m3_checkAmountPlusSvc = 0;
    let m4_selPriceNonDeferred = 0;
    let svcTotal = 0;
    let deferredTotal = 0;

    const BATCH = 3;
    for (let i = 0; i < orderGuids.length; i += BATCH) {
      const batch = orderGuids.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (og) => {
          try {
            const r = await fetch(process.env.TOAST_API_HOST + "/orders/v2/orders/" + og, { headers });
            if (!r.ok) return null;
            return await r.json();
          } catch (e) { return null; }
        })
      );
      results.forEach((order) => {
        if (!order || order.voided || order.deleted || order.excessFood) return;
        (order.checks || []).forEach((check) => {
          if (check.voided || check.deleted) return;
          m2_checkAmount += (check.amount || 0);
          let checkSvc = 0;
          (check.appliedServiceCharges || []).forEach((sc) => {
            if (!sc.voided) { checkSvc += (sc.chargeAmount || sc.amount || 0); }
          });
          svcTotal += checkSvc;
          m3_checkAmountPlusSvc += (check.amount || 0) + checkSvc;
          (check.selections || []).forEach((sel) => {
            if (sel.voided) return;
            if (sel.deferred) { deferredTotal += (sel.preDiscountPrice || 0); return; }
            m1_preDiscount += (sel.preDiscountPrice || 0);
            m4_selPriceNonDeferred += (sel.price || 0);
          });
        });
      });
      await new Promise((r) => setTimeout(r, 150));
    }

    const round = (n) => Math.round(n * 100) / 100;
    return Response.json({
      ok: true,
      businessDate,
      totalOrders: orderGuids.length,
      metodos: {
        m1_preDiscount_actual: round(m1_preDiscount),
        m2_checkAmount: round(m2_checkAmount),
        m3_checkAmount_plus_serviceCharges: round(m3_checkAmountPlusSvc),
        m4_selectionPrice_nonDeferred: round(m4_selPriceNonDeferred),
      },
      serviceChargesTotal: round(svcTotal),
      deferredTotal: round(deferredTotal),
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}