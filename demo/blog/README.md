# Blog

The main site serves the blog at `/blog`. Product documentation stays on Mintlify at `/docs`.

Add a Markdown file to `posts/`; its filename becomes the URL slug. Include string frontmatter
fields `title`, `description`, `date` (`"YYYY-MM-DD"`), and `category`. Use the publication date
when publishing. Keep provider verification dates in the article current.

`pnpm dev:demo` serves the articles locally. `pnpm build:demo` generates complete HTML pages,
the index, and `site-sitemap.xml`. No browser JavaScript is needed to read or index an article;
the small client script only adds code-copy buttons. The Markdown renderer accepts trusted
repository content, not user submissions.

Link to documentation with `/docs/...` and to other articles with `/blog/...`. Mintlify pages
must use full `https://orb-ui.com/blog/...` links to leave the docs base path. Articles have one
canonical location; do not duplicate their full text in Mintlify.

Preview both narrow and wide layouts, check code blocks and tables, and run `pnpm check` before
opening a PR. The site build and Vercel routing publish the blog with the existing main site.
