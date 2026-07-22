// Fetches a static page and strips it down to plain text for agents to read.
import axios from "axios";
import * as cheerio from "cheerio";

export async function webFetch(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, { timeout: 10_000 });
    const $ = cheerio.load(res.data as string);
    $("script, style, nav, footer").remove();
    return $("body").text().replace(/\s+/g, " ").trim();
  } catch {
    return null; // never throw — the calling agent decides what to do with null
  }
}
