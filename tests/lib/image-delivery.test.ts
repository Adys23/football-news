import { describe, expect, it } from "vitest";
import { articleImagePatterns, isLocalImageUrl, shouldOptimizeImage } from "@/lib/image-delivery";

const PROD = "https://abcd.supabase.co";
const LOCAL = "http://127.0.0.1:54321";
const PATH = "/storage/v1/object/public/article-images/seed/a.jpg";

describe("isLocalImageUrl", () => {
  it("rozpoznaje adresy lokalne", () => {
    for (const url of [
      `${LOCAL}${PATH}`,
      "http://localhost:54321/a.jpg",
      "http://api.localhost/a.jpg",
      "http://127.1.2.3/a.jpg",
      "http://0.0.0.0/a.jpg",
      "http://[::1]:54321/a.jpg",
      "http://10.0.0.5:54321/a.jpg",
      "http://172.20.1.1/a.jpg",
      "http://192.168.1.10:54321/a.jpg",
      "http://169.254.1.1/a.jpg",
      "http://[fd12::1]/a.jpg",
      "http://[fe80::1]/a.jpg",
    ]) {
      expect(isLocalImageUrl(url)).toBe(true);
    }
  });

  it("nie uznaje za lokalne adresow publicznych, wzglednych i niepoprawnych", () => {
    for (const url of [
      `${PROD}${PATH}`,
      "https://127.example.com/a.jpg",
      "http://172.32.0.1/a.jpg",
      "http://8.8.8.8/a.jpg",
      "http://[2001:db8::1]/a.jpg",
      "/a.jpg",
      "nie-url",
    ]) {
      expect(isLocalImageUrl(url)).toBe(false);
    }
  });
});

describe("articleImagePatterns", () => {
  it("buduje wzorzec bucketu article-images z adresu projektu", () => {
    expect(articleImagePatterns(PROD)).toEqual([
      {
        protocol: "https",
        hostname: "abcd.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/article-images/**",
        search: "",
      },
    ]);
    expect(articleImagePatterns(LOCAL)[0]).toMatchObject({
      protocol: "http",
      hostname: "127.0.0.1",
      port: "54321",
    });
  });

  it("bez adresu albo z niepoprawnym daje pusta liste", () => {
    expect(articleImagePatterns(undefined)).toEqual([]);
    expect(articleImagePatterns("nie-url")).toEqual([]);
    expect(articleImagePatterns("ftp://abcd.supabase.co")).toEqual([]);
  });
});

describe("shouldOptimizeImage", () => {
  it("optymalizuje tylko bucket article-images projektu poza adresem lokalnym", () => {
    expect(shouldOptimizeImage(`${PROD}${PATH}`, PROD)).toBe(true);
    expect(shouldOptimizeImage(`${LOCAL}${PATH}`, LOCAL)).toBe(false);
    expect(shouldOptimizeImage(`${PROD}/storage/v1/object/public/inne/a.jpg`, PROD)).toBe(false);
    expect(shouldOptimizeImage(`${PROD}${PATH}?v=1`, PROD)).toBe(false);
    expect(shouldOptimizeImage(`https://cdn.example${PATH}`, PROD)).toBe(false);
    expect(shouldOptimizeImage(`${PROD}${PATH}`, undefined)).toBe(false);
  });
});
