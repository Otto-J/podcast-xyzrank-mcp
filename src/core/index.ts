import debug from "debug";
import cache from "./cache";

const log = debug("mcp:xyzrank");

// 常量定义
export const commonHeaders = {
  accept: "application/json, text/plain, */*",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
  "cache-control": "no-cache",
  pragma: "no-cache",
  priority: "u=1, i",
  "sec-ch-ua":
    '"Not(A:Brand";v="99", "Microsoft Edge";v="133", "Chromium";v="133"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  Referer: "https://xyzrank.com/?from=xyzrank-mcp",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

// 缓存 key
const CACHE_KEY = "mainResult";

const TYPE_NAME = {
  fullData: "热门节目",
  newPodcasts: "热门播客",
  hotNewPodcasts: "新锐节目",
  hotPodcasts: "新锐播客",
};

interface PodcastDataItem {
  status: boolean;
  type: string;
  data: Array<any>;
}

export interface PodcastData {
  datePrefix: string;
  results: Array<PodcastDataItem>;
}

export const HOMEPAGE_URL = "https://xyzrank.com/";
export const INDEX_PATH_REGEX =
  /<script type="module" crossorigin src="(https:\/\/xyzrank\.justinbot\.com\/assets\/index\.[a-zA-Z0-9]+\.js)"><\/script>/;

const isDateExpired = (lstDate: string): boolean => {
  const now = getDatePrefix();
  return now !== lstDate;
};

// 辅助函数
export function getDatePrefix(): `${number}-${string}-${string}` {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  log(`getDatePrefix: ${year}-${month}-${day}`);
  return `${year}-${month}-${day}`;
}

export function extractUrl(content: string, regex: RegExp): string | null {
  const match = content.match(regex);
  log(`extractUrl: ${regex} => ${match}`);
  return match ? match[0] : null;
}

export async function fetchAndParseHomepage() {
  log(`请求首页: ${HOMEPAGE_URL}`);
  const homepageResponse = await fetch(HOMEPAGE_URL, {
    headers: commonHeaders,
  });
  const homepageHtml = await homepageResponse.text();

  const indexPathMatch = homepageHtml.match(INDEX_PATH_REGEX);
  if (!indexPathMatch?.[1]) {
    throw new Error("无法找到 index.js 的路径");
  }

  return indexPathMatch[1];
}

export async function fetchIndexJs(indexPath: string) {
  log(`请求 index.js: ${indexPath}`);
  const indexJsResponse = await fetch(indexPath, { headers: commonHeaders });
  return await indexJsResponse.text();
}

export async function fetchAndSaveResource(
  type: keyof typeof TYPE_NAME,
  url: string
): Promise<PodcastDataItem> {
  log(`fetchAndSaveResource 请求 ${type}: ${url}`);

  const response = await fetch(url, { headers: commonHeaders });
  const data: any = await response.json();

  let cleanData = [];
  if (type === "fullData" || type === "newPodcasts") {
    // note: fullData 长度有长达 5k+ 条数据，所以需要缓存
    log(type, " data is :", data?.data);

    cleanData = (data?.data?.podcasts ?? []).map((item: any) => {
      const {
        rank,
        name,
        primaryGenreName,
        // id: xyzRankId,
        trackCount,
        lastReleaseDate,
        links,
      } = item;
      return {
        rank,
        name,
        // xyzRankId,
        trackCount,
        lastReleaseDate,
        links,
        primaryGenreName,
      };
    });
    log("cleanData", cleanData.length);
  } else if (type === "hotPodcasts" || type === "hotNewPodcasts") {
    cleanData = (data?.data?.episodes ?? []).map((item: any) => {
      const {
        title,
        podcastName,
        totalEpisodesCount,
        link,
        postTime,
        playCount,
        subscription,
        primaryGenreName,
      } = item;
      return {
        totalEpisodesCount,
        primaryGenreName,
        title,
        subscription,
        podcastName,
        playCount,
        link,
        postTime,
      };
    });
    log("cleanData", cleanData.length);
  }

  return {
    status: true,
    type: TYPE_NAME[type],
    data: cleanData,
  };
}

// 确保播客数据存在，根据日期信息判断是否读取 cache
export async function ensurePodcastData(): Promise<PodcastData> {
  try {
    const datePrefix = getDatePrefix();

    const hasCache = cache.get<PodcastData>(CACHE_KEY);
    if (hasCache && !isDateExpired(hasCache.datePrefix) && hasCache.results) {
      log(`使用缓存数据，缓存时间: ${hasCache.datePrefix}`);
      return hasCache;
    }
    log("没有缓存数据，开始获取数据");

    // 获取资源URL
    const indexPath = await fetchAndParseHomepage();
    const indexJsContent = await fetchIndexJs(indexPath);

    const resourceTypes: Record<keyof typeof TYPE_NAME, string | null> = {
      fullData: extractUrl(
        indexJsContent,
        /https:\/\/xyzrank\.com\/assets\/full\.[a-zA-Z0-9]+\.json/
      ),
      hotPodcasts: extractUrl(
        indexJsContent,
        /https:\/\/xyzrank\.com\/assets\/hot-episodes\.[a-zA-Z0-9]+\.json/
      ),
      hotNewPodcasts: extractUrl(
        indexJsContent,
        /https:\/\/xyzrank\.com\/assets\/hot-episodes-new\.[a-zA-Z0-9]+\.json/
      ),
      newPodcasts: extractUrl(
        indexJsContent,
        /https:\/\/xyzrank\.com\/assets\/new-podcasts\.[a-zA-Z0-9]+\.json/
      ),
    };

    log("提取到的资源地址:", resourceTypes);

    // 处理每种资源
    const results: PodcastDataItem[] = [];

    for (const [type, url] of Object.entries(resourceTypes)) {
      if (!url) {
        log(`未找到 ${type} 的URL`);
        continue;
      }

      try {
        const result = await fetchAndSaveResource(
          type as keyof typeof TYPE_NAME,
          url
        );
        results.push(result);
      } catch (error) {
        log(`获取或保存 ${type} 时出错:`, error);
        results.push({
          type: type as PodcastDataItem["type"],
          status: false,
          data: [],
        });
      }
    }

    log("数据获取完成!");

    // 保存结果到缓存
    const data: PodcastData = { datePrefix, results };
    cache.set(CACHE_KEY, data);

    return data;
  } catch (error) {
    console.error("获取数据时出错:", error);
    return {
      datePrefix: getDatePrefix(),
      results: [],
    };
  }
}
