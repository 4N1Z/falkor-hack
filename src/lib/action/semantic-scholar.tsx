import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { cache } from "react";

// Types for better error handling
type SearchResult = {
  status: 'SUCCESS' | 'NO_RESULTS' | 'RATE_LIMITED' | 'ERROR';
  data?: any[];
  message?: string;
};

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(30, "60 s"),
  analytics: true,
  prefix: "semantic_scholar",
});

const searchCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export const searchSemanticScholar = cache(
  async (query: string, limit: number = 5, sort: string = "recency") => {
    try {
      // Add request debouncing
      const cacheKey = `${query}-${limit}-${sort}`;
      
      // Check cache first
      const cached = searchCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log("Using cached research paper results for:", query);
        return cached.data;
      }

      // Add rate limiting check
      const { success, limit: rateLimitInfo } = await ratelimit.limit(
        `search_${query}`
      );

      if (!success) {
        console.warn("Rate limit reached:", rateLimitInfo);
        if (cached) {
          console.log("Using expired cache due to rate limit");
          return cached.data;
        }
        return "API Rate Limit Reached. Please try again later !";
      }

      console.log("Fetching new research paper results for:", query);
      
      const response = await fetch(
        `${process.env.SEMANTIC_SCHOLAR_URL}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&sort=${sort}&fields=title,authors,year,externalIds`,
        {
          headers: {
            "Content-Type": "application/json",
          },
          next: { revalidate: 3600 },
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          if (cached) {
            return cached.data;
          }
          throw new Error("API rate limit exceeded");
        }
        throw new Error(`API call failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate the response data
      if (!data.data || data.data.length === 0) {
        return "No research papers found for the given query";
      }

      // Cache successful results
      searchCache.set(cacheKey, {
        data: data.data,
        timestamp: Date.now(),
      });

      return data.data;
    } catch (error) {
      console.error("Error searching Semantic Scholar:", error);
      return "No Papers available";
    }
  }
);

function cleanCache() {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      searchCache.delete(key);
    }
  }
}