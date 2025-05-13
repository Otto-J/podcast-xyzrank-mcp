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

const FETCH_TIME_KEY = "fetchTime";

// const config = {
//   fullData: "热门节目",

//   newPodcasts: "热门播客",
//   hotNewPodcasts: "新锐节目",
//   hotPodcasts: "新锐播客",
// };

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

export async function fetchAndSaveResource(type: string, url: string) {
  log(`fetchAndSaveResource 请求 ${type}: ${url}`);

  const response = await fetch(url, { headers: commonHeaders });
  const data: any = await response.json();

  let cleanData = [];
  if (type === "fullData" || type === "newPodcasts") {
    // note: fullData 长度有长达 5k+ 条数据，所以需要缓存
    log(type, " data is :", data?.data);

    // set cache
    cache.set(type, {
      data: data?.data?.podcasts ?? [],
    });
    cleanData = (data?.data?.podcasts ?? [])
      .map((item: any) => {
        const {
          rank,
          name,
          primaryGenreName,
          id: xyzRankId,
          trackCount,
          lastReleaseDate,
          links,
        } = item;
        return {
          rank,
          name,
          xyzRankId,
          trackCount,
          lastReleaseDate,
          links,
          primaryGenreName,
        };
      })
      .slice(0, 5);
    log("cleanData", cleanData);
  } else if (type === "hotPodcasts" || type === "hotNewPodcasts") {
    cleanData = (data?.data?.episodes ?? [])
      .map((item: any) => {
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
      })
      .slice(0, 15);
    log("cleanData", cleanData);
  }

  return {
    status: "success",
    type,
    data: cleanData,
  };
}

export async function main() {
  try {
    const datePrefix = getDatePrefix();

    const cachedData = cache.get("mainResult");
    const hasCache = cache.get(FETCH_TIME_KEY) as string;
    if (hasCache && !isDateExpired(hasCache) && cachedData) {
      log(`使用缓存数据，缓存时间: ${hasCache}`);
      return cachedData;
    }

    // 获取资源URL
    const indexPath = await fetchAndParseHomepage();
    const indexJsContent = await fetchIndexJs(indexPath);

    const resourceTypes = {
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
    const results = [];

    for (const [type, url] of Object.entries(resourceTypes)) {
      if (!url) {
        log(`未找到 ${type} 的URL`);
        continue;
      }

      try {
        const result = await fetchAndSaveResource(type, url);
        results.push(result);
      } catch (error) {
        log(`获取或保存 ${type} 时出错:`, error);
        results.push({
          type,
          status: "error",
          error: (error as Error).message,
        });
      }
    }

    log("数据获取完成!");

    // 保存结果到缓存
    cache.set("mainResult", results);
    cache.set(FETCH_TIME_KEY, datePrefix);

    return results;
  } catch (error) {
    console.error("获取数据时出错:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
