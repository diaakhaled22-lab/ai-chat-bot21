import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";

const blockedIpv4 = new BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(subnet, prefix, "ipv4");
}

const publicIpv6 = new BlockList();
publicIpv6.addSubnet("2000::", 3, "ipv6");

const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "localtest.me",
  "local",
  "internal",
];

function normalizedHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
}

function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4.check(address, "ipv4");
  if (family === 6) return publicIpv6.check(address, "ipv6");
  return false;
}

/**
 * Validates that a URL uses HTTP(S) and does not directly target a restricted host.
 * Hostnames are resolved and checked again by safeFetch before connecting.
 */
export function isSafeUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const hostname = normalizedHostname(url.hostname);
    if (BLOCKED_HOSTNAMES.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`))) {
      return false;
    }

    const family = isIP(hostname);
    return !family || isPublicIpAddress(hostname);
  } catch {
    return false;
  }
}

async function lookupPublicAddress(hostname: string): Promise<{ address: string; family: number }> {
  const normalized = normalizedHostname(hostname);
  const family = isIP(normalized);
  if (family) {
    if (!isPublicIpAddress(normalized)) throw new Error("URL resolves to a private or restricted IP address");
    return { address: normalized, family };
  }

  const addresses = await lookup(normalized, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("URL resolves to a private or restricted IP address");
  }
  return addresses[0];
}

function requestPinnedAddress(
  url: URL,
  init: RequestInit,
  address: { address: string; family: number }
): Promise<Response> {
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = new Headers(init.headers);
  const requestHeaders: Record<string, string> = {};
  headers.forEach((value, name) => {
    requestHeaders[name] = value;
  });

  const pinnedLookup: any = (_hostname: string, options: any, callback: any) => {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "object" && options !== null ? options : {};
    if (opts.all) {
      cb(null, [{ address: address.address, family: address.family }]);
    } else {
      cb(null, address.address, address.family);
    }
  };

  return new Promise((resolve, reject) => {
    const request = transport(
      url,
      {
        method: init.method || "GET",
        headers: requestHeaders,
        signal: init.signal ?? undefined,
        lookup: pinnedLookup,
      },
      (incoming) => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) responseHeaders.append(name, item);
          } else if (value !== undefined) {
            responseHeaders.set(name, value);
          }
        }

        const status = incoming.statusCode || 502;
        const responseBody = status === 204 || status === 304
          ? null
          : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
        resolve(new Response(responseBody, {
          status,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        }));
      }
    );

    request.on("error", reject);
    if (init.body !== undefined && init.body !== null) {
      if (typeof init.body === "string" || init.body instanceof Uint8Array) {
        request.write(init.body);
      } else if (init.body instanceof URLSearchParams) {
        request.write(init.body.toString());
      } else {
        request.destroy(new TypeError("safeFetch only supports string, byte, or URLSearchParams request bodies"));
        return;
      }
    }
    request.end();
  });
}

/**
 * Fetches a public URL while pinning each connection to its validated DNS
 * address and validating every redirect before following it.
 */
export async function safeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  let url = new URL(input);
  let method = init.method || "GET";
  let body = init.body;
  const headers = new Headers(init.headers);

  for (let redirects = 0; ; redirects++) {
    if (!isSafeUrl(url.toString())) {
      throw new Error("URL must resolve to an external public address");
    }

    const address = await lookupPublicAddress(url.hostname);
    const response = await requestPinnedAddress(url, { ...init, method, body, headers }, address);
    const location = response.headers.get("location");
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);

    if (!isRedirect || !location || init.redirect === "manual") return response;
    if (init.redirect === "error" || redirects >= 5) {
      await response.body?.cancel();
      throw new Error("Too many or disallowed redirects while fetching URL");
    }

    const nextUrl = new URL(location, url);
    if (nextUrl.origin !== url.origin) {
      await response.body?.cancel();
      throw new Error("Cross-origin redirects are not allowed while fetching URL");
    }

    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method.toUpperCase() === "POST")) {
      method = "GET";
      body = undefined;
      headers.delete("content-length");
      headers.delete("content-type");
    }

    await response.body?.cancel();
    url = nextUrl;
  }
}
