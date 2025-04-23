import { parseRssAndSave } from "./core/parserRss";

const res = await parseRssAndSave("https://feed.xyzfm.space/rv449dl9kqka");
console.log(res);
