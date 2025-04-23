import Parser from "rss-parser";
import axios from "redaxios";
import debug from "debug";

const log = debug("mcp:parseRss");

export const parseRssAndSave = async (rss: string) => {
  log("接收到 RSS", rss);

  if (!rss || !rss.startsWith("http")) {
    return {
      status: false,
      result: null,
      message: "错误的 url: " + (rss ?? ""),
    };
  }

  try {
    // 获取并解析 RSS
    const parser = new Parser();
    const res: any = await axios({
      method: "get",
      url: rss,
    });
    const feed = await parser.parseString(res.data);

    const basicInfo = {
      title: feed.title,
      description: feed.description,
      link: feed.link,
      image: feed.image,
    };

    const items = feed.items.map((item) => {
      const { title, link, pubDate, enclosure, content } = item;
      return {
        title,
        link,
        pubDate,
        enclosure,
        content,
      };
    });

    return {
      status: true,
      result: { basicInfo, items }, // Added to return the parsed items
      message: "ok",
    };
  } catch (err) {
    log("rss parse err", rss, err);
    return {
      status: false,
      result: null,
      message: "parse " + rss + " error:" + (err as Error).message,
    };
  }
};
