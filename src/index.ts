#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import debug from "debug";
import { parseRssAndSave } from "./core/parserRss";
import { z } from "zod";
import { ensurePodcastData } from "./core/index.js";

const log = debug("mcp:xyzrank");

// 创建MCP服务器
const server = new McpServer(
  {
    name: "PodcastHelper",
    description:
      "播客收听小助手，可以获得小宇宙音频播客节目、热门播客、Web Worker 播客推荐，得到不同分类的播客节目推荐",
    version: "1.0.1",
  },
  {
    capabilities: {
      prompts: {},
    },
  }
);

// 定义获取小宇宙排行榜工具
server.tool(
  "getXyzRankData",
  "获取并推荐今天的小宇宙播客排行，得到热门播客、热门单集、新锐播客、新锐单集推荐信息",
  {},
  async () => {
    const data = await ensurePodcastData();
    log("获取到的数据:", data.results.length);
    // 默认情况下,各项数据都返回五条
    const result = data.results.map((item) => {
      return {
        type: item.type,
        data: item.data.slice(0, 5),
      };
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
    };
  }
);
server.tool(
  "getRSSPodcast",
  "通过 RSS 解析播客节目",
  {
    RSS: z.string().describe("RSS 源，以 http 网址开头"),
  },
  async (data) => {
    const res = await parseRssAndSave(data.RSS);

    // res.items 默认展示最近十条
    if (!res.status) {
      return {
        content: [
          {
            type: "text",
            text: "获取播客节目失败:" + res.message,
          },
        ],
      };
    }
    const result = res.result;
    result!.items = result!.items.slice(0, 10);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);
server.tool(
  "getWebWorkerPodcast",
  "获取前端程序员都爱听的 Web Worker 播客节目",
  {},
  async () => {
    const res = await parseRssAndSave("https://feed.xyzfm.space/rv449dl9kqka");

    if (!res.status) {
      return {
        content: [
          {
            type: "text",
            text: "获取 Web Worker 播客节目失败:" + res.message,
          },
        ],
      };
    }
    // res.items 默认展示最近十条
    const result = res.result;
    result!.items = result!.items.slice(0, 10);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

server.prompt("getFullData", "获取热门播客单集推荐", {}, async (request) => {
  log("获取热门播客单集推荐", request);
  return {
    description: "获取热门播客单集推荐 fullData",
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "今天有哪些热门播客单集推荐？",
        },
      },
    ],
  };
});
server.prompt("getNewPodcast", "获取热门播客推荐", {}, async (request) => {
  log("获取热门播客推荐:", request);
  return {
    description: "获取热门播客推荐",
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "今天有哪些播客推荐？",
        },
      },
    ],
  };
});

// 连接服务器
const transport = new StdioServerTransport();
await server.connect(transport);
