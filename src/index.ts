#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import debug from "debug";
import { main } from "./core/index.js";

const log = debug("mcp:xyzrank");

// 创建MCP服务器
const server = new McpServer({
  name: "GetXyzRankData",
  description: "获取XyzRank数据",
  version: "1.0.0",
});

// 定义获取小宇宙排行榜工具
server.tool("getXyzRankData", "获取今天的小宇宙播客排行榜", {}, async () => {
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

// 连接服务器
const transport = new StdioServerTransport();
await server.connect(transport);
