# @web.worker/podcast-xyzrank-mcp

podcast-xyzrank-mcp，通过 mcp 获取值得收听和推荐的播客。

## 安装

本地测试，这会启动一个本地的 server 验证功能。

```sh
npx @modelcontextprotocol/inspector npx @web.worker/podcast-xyzrank-mcp
```

cursor 等工具配置对应的 json：

```json
{
  "mcpServers": {
    "xyzRank": {
      "command": "npx",
      "args": ["-y", "@web.worker/podcast-xyzrank-mcp"]
    }
  }
}
```

## 使用

Q:今天有什么播客推荐？

## 感谢

数据来源：使用了《枫言枫语》播客创作的 [中文播客榜](https://xyzrank.com/) 数据。
