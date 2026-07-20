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
    const url = process.env.TOAST_API_HOST + "/orders/v2/orders?businessDate=" + businessDate;

    const res = await fetch(url, {
      headers: {
        Authorization: "Bearer " + token,
        "Toast-Restaurant-External-ID": guid,
      },
    });

    const text = await res.text();
    if (!res.ok) {
      return Response.json({ ok: false, status: res.status, body: text }, { status: 500 });
    }

    const orderGuids = JSON.parse(text);

    let detail = null;
    if (orderGuids.length) {
      const detUrl = process.env.TOAST_API_HOST + "/orders/v2/orders/" + orderGuids[0];
      const detRes = await fetch(detUrl, {
        headers: {
          Authorization: "Bearer " + token,
          "Toast-Restaurant-External-ID": guid,
        },
      });
      if (detRes.ok) detail = await detRes.json();
    }

    return Response.json({
      ok: true,
      count: orderGuids.length,
      sampleGuid: orderGuids[0],
      detail: detail,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}