import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };
const MAX_PROXY_BODY_BYTES = 1024 * 1024;
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "retry-after",
  "x-request-id",
  "last-event-id",
];

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "POST") {
    return NextResponse.json({ error: { code: "METHOD_NOT_ALLOWED", message: "This API method is not available." } }, { status: 405 });
  }

  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_PROXY_BODY_BYTES) {
    return NextResponse.json({ error: { code: "REQUEST_TOO_LARGE", message: "The request body exceeds the API limit." } }, { status: 413 });
  }

  const { path } = await context.params;
  const safePath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const backendOrigin = process.env.SAFEANES_API_URL ?? process.env.SAFEANES_BACKEND_URL ?? "http://127.0.0.1:8000";
  const target = new URL(`/api/${safePath}${new URL(request.url).search}`, backendOrigin);
  const headers = new Headers();
  const accept = request.headers.get("accept");
  const contentType = request.headers.get("content-type");
  const requestId = request.headers.get("x-request-id");
  if (accept) headers.set("accept", accept);
  if (contentType) headers.set("content-type", contentType);
  if (requestId) headers.set("x-request-id", requestId);
  const token = process.env.SAFEANES_BACKEND_API_TOKEN;
  if (token) headers.set("authorization", `Bearer ${token}`);

  let body: ArrayBuffer | undefined;
  if (method === "POST") {
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_PROXY_BODY_BYTES) {
      return NextResponse.json({ error: { code: "REQUEST_TOO_LARGE", message: "The request body exceeds the API limit." } }, { status: 413 });
    }
  }

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });
    const responseHeaders = new Headers();
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set("cache-control", "no-store, no-transform");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "BACKEND_UNAVAILABLE", message: "The SafeAnes backend is unavailable." } },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
