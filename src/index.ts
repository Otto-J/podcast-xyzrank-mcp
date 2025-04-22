#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import debug from "debug";

const log = debug("mcp:xyzrank");
// const config = [
//   {
//     name: "热门节目",
//     key: "fullData",
//   },
//   {
//     name: "热门播客",
//     key: "newPodcasts",
//   },
//   {
//     name: "新锐节目",
//     key: "hotNewPodcasts",
//   },
//   {
//     name: "新锐播客",
//     key: "hotPodcasts",
//   },
// ];

// 常量定义
const commonHeaders = {
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
  Referer: "https://xyzrank.com/?from=itab",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const HOMEPAGE_URL = "https://xyzrank.com/";
const INDEX_PATH_REGEX =
  /<script type="module" crossorigin src="(https:\/\/xyzrank\.justinbot\.com\/assets\/index\.[a-zA-Z0-9]+\.js)"><\/script>/;

// 辅助函数
function getDatePrefix() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  log(`getDatePrefix: ${year}-${month}-${day}`);
  return `${year}-${month}-${day}`;
}

function extractUrl(content: string, regex: RegExp): string | null {
  const match = content.match(regex);
  log(`extractUrl: ${regex} => ${match}`);
  return match ? match[0] : null;
}

async function fetchAndParseHomepage() {
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

async function fetchIndexJs(indexPath: string) {
  log(`请求 index.js: ${indexPath}`);
  const indexJsResponse = await fetch(indexPath, { headers: commonHeaders });
  return await indexJsResponse.text();
}

async function fetchAndSaveResource(
  _db: any,
  type: string,
  url: string,
  datePrefix: string
) {
  log(`fetchAndSaveResource 请求 ${type}: ${url}`);
  const response = await fetch(url, { headers: commonHeaders });
  const data: any = await response.json();

  let cleanData = [];
  if (type === "fullData" || type === "newPodcasts") {
    log(type, " data is :", data?.data);
    cleanData = (data?.data?.podcasts ?? []).map((item: any) => {
      const {
        rank,
        name,
        primaryGenreName,
        id: xyzRankId,
        logoURL,
        trackCount,
        lastReleaseDate,
        links,
      } = item;
      return {
        rank,
        name,
        xyzRankId,
        logoURL,
        trackCount,
        lastReleaseDate,
        links,
        primaryGenreName,
      };
    });
    log("cleanData", cleanData);
  } else if (type === "hotPodcasts" || type === "hotNewPodcasts") {
    cleanData = (data?.data?.episodes ?? []).map((item: any) => {
      const { title, podcastID, podcastName, logoURL, link, postTime } = item;
      return {
        title,
        podcastID,
        podcastName,
        logoURL,
        link,
        postTime,
      };
    });
    log("cleanData", cleanData);
  }

  // clearn data 只要前五条
  cleanData = cleanData.slice(0, 5);

  const doc = {
    date: datePrefix,
    type,
    cleanData,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { data: doc, status: "success" };
}

async function main() {
  try {
    const datePrefix = getDatePrefix();

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
    let successCount = 0;
    const results = [];

    for (const [type, url] of Object.entries(resourceTypes)) {
      if (!url) {
        log(`未找到 ${type} 的URL`);
        continue;
      }

      try {
        const result = await fetchAndSaveResource(null, type, url, datePrefix);
        results.push(result);
        successCount++;
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
    return {
      success: successCount === Object.keys(resourceTypes).length,
      date: datePrefix,
      results,
    };
  } catch (error) {
    console.error("获取数据时出错:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

const server = new McpServer({
  name: "GetXyzRankData",
  description: "获取XyzRank数据",
  version: "1.0.0",
});

// server.resource(
//   "echo",
//   new ResourceTemplate("echo://{message}", { list: undefined }),
//   async (uri, { message }) => ({
//     contents: [
//       {
//         uri: uri.href,
//         text: `Resource echo: ${message}`,
//       },
//     ],
//   })
// );

server.tool("getXyzRankData", "获取今天的小宇宙排行榜", {}, async () => {
  const data = await main();
  log("获取到的数据:", data);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
