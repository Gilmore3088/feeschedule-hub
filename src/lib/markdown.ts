import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";

const STRICT_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td",
    "strong", "em", "a", "code", "pre",
    "blockquote", "br", "hr", "del",
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: ["href"],
    h1: ["id"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    h5: ["id"],
    h6: ["id"],
    th: ["align"],
    td: ["align"],
  },
  protocols: {
    href: ["https", "http"],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, STRICT_SCHEMA)
  .use(rehypeSlug)
  .use(rehypeStringify);

export async function renderMarkdown(md: string): Promise<string> {
  const result = await processor.process(md);
  return String(result);
}
