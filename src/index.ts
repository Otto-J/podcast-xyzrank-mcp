#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import debug from "debug";
import { parseRssAndSave } from "./core/parserRss";
import { z } from "zod";
import { ensurePodcastData, TYPE_NAME } from "./core/index.js";
import Fuse from "fuse.js";

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
  "getXyzRankPodcastData",
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
    (result as any).keyMap = data.keyMap;
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
// 定义 tool，通过播客名字查询 rss 地址
server.tool(
  "getRSSByPodcastName",
  "通过播客名字查询 rss 地址",
  {
    podcastName: z.string().describe("播客名字，允许空格模糊搜索"),
  },
  async (data) => {
    const res = await ensurePodcastData();
    const fullData = res.results.find(
      (item) => item.type === TYPE_NAME.fullData
    );
    const podcastNameList = fullData?.data.map((item) => item.name);

    // 将输入字符串按空格和逗号分割成数组
    const searchTerms = data.podcastName
      .split(/[\s,]+/)
      .filter((term) => term.length > 0);

    const fuse = new Fuse(podcastNameList?.map((title) => ({ title })) ?? [], {
      includeScore: true,
      // 匹配阈值，值越低匹配越精确
      threshold: 0.2,
      // 搜索时忽略位置
      ignoreLocation: true,
      // 搜索键
      keys: ["title"],
    });

    // 使用 $and 操作符构建搜索表达式
    const searchExpression = {
      $and: searchTerms.map((term) => ({
        title: term,
      })),
    };

    const results = fuse.search(searchExpression, {
      limit: 20,
    });

    // 这里按照订阅数量进行排序
    const podcastName: string[] = results.map((item) => item.item.title);
    const podcastInfo = podcastName.map((name) => {
      const podcast = fullData?.data.find((item) => item.name === name);
      const links = podcast?.links ?? [];
      let rss = links.find((item: any) => item.name === "rss")?.url;
      // 如果没有主动公开，拼我的 rss 地址吧
      if (!rss) {
        let xyzRankUrl = links.find((item: any) => item.name === "xyz")?.url;
        if (!xyzRankUrl) {
          return {
            rank: podcast!.rank,
            name,
            rss: "",
          };
        }
        const xyzRankId = xyzRankUrl.split("podcast/").pop();
        rss = `https://rsshub.ijust.cc/xiaoyuzhou/podcast/${xyzRankId}`;
      }
      return {
        rank: podcast!.rank,
        name,
        rss,
      };
    });
    // 这里按照 rank 排序
    podcastInfo.sort((a, b) => a.rank - b.rank);

    if (podcastInfo.length === 0) {
      return {
        content: [{ type: "text", text: "没有找到对应的播客节目" }],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: podcastInfo
              .map((i) => `《${i.name}》排名${i.rank} RSS:"${i.rss}"`)
              .join("\n"),
          },
        ],
      };
    }
  }
);
server.tool(
  "parseRSSInfo",
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
    const xyzData = await ensurePodcastData();

    const result = res.result;
    const podcastName = res.result?.basicInfo.title;
    const fullData = xyzData.results.find(
      (item) => item.type === TYPE_NAME.fullData
    );
    const info = fullData?.data.find((item) => item.name === podcastName);

    info.links = undefined;
    (result! as any).xyzInfo = info;
    // (result! as any).keyMap =;

    // 长度返回最近 15 条
    result!.items = result!.items.slice(0, 15);
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
  "getWebWorkerPodcastInfo",
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
