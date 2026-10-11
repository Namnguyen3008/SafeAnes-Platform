import { NextResponse } from "next/server";
import {
  fetchSupabaseCases,
  fetchSupabaseCaseDetail,
  fetchSupabaseTracks,
  fetchSupabaseEventsAsCaseEvents,
} from "@/lib/api/supabaseVitalDbClient";

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

async function handleSupabaseFallback(path: string[]): Promise<Response | null> {
  try {
    if (path.length === 2 && path[0] === "v1" && path[1] === "cases") {
      const cases = await fetchSupabaseCases();
      if (cases.length > 0) {
        return NextResponse.json(
          { dataset: "VitalDB", dataset_version: "1.0.1", cases },
          { headers: { "cache-control": "no-store, no-transform" } },
        );
      }
    }
    if (path.length === 3 && path[0] === "v1" && path[1] === "cases") {
      const caseId = path[2];
      const detail = await fetchSupabaseCaseDetail(caseId);
      if (detail) {
        return NextResponse.json(detail, { headers: { "cache-control": "no-store, no-transform" } });
      }
    }
    if (path.length === 4 && path[0] === "v1" && path[1] === "cases" && path[3] === "tracks") {
      const caseId = path[2];
      const tracks = await fetchSupabaseTracks(caseId);
      if (tracks.length > 0) {
        return NextResponse.json(
          { case_id: caseId, tracks },
          { headers: { "cache-control": "no-store, no-transform" } },
        );
      }
    }
    if (path.length === 4 && path[0] === "v1" && path[1] === "cases" && path[3] === "events") {
      const caseId = path[2];
      const events = await fetchSupabaseEventsAsCaseEvents(caseId);
      return NextResponse.json(
        { case_id: caseId, time_basis: "seconds_since_case_start", events },
        { headers: { "cache-control": "no-store, no-transform" } },
      );
    }
  } catch {
    // If Supabase query fails, fall back to default error response
  }
  return null;
}

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
    if (upstream.status >= 500) {
      const fallback = await handleSupabaseFallback(path);
      if (fallback) return fallback;
    }
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
    const fallback = await handleSupabaseFallback(path);
    if (fallback) return fallback;
    return NextResponse.json(
      { error: { code: "BACKEND_UNAVAILABLE", message: "The SafeAnes backend is unavailable." } },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
