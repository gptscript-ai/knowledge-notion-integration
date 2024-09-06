import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { PageObjectResponse, SearchResponse } from "@notionhq/client/build/src/api-endpoints";
import { getPageContent } from "./page";
import * as fs from "node:fs";

dotenv.config();

async function main() {
  const notion = new Client({
    auth: process.env.NOTION_TOKEN,
  });

  // Function to write a page to a file
  async function writePageToFile(page: PageObjectResponse, directory: string) {
    const pageId = page.id;
    const pageContent = await getPageContent(notion, pageId);
    const fileDir = path.join(directory, pageId.toString());
    await mkdir(fileDir, { recursive: true });
    let title = ((page.properties?.title ?? page.properties?.Name) as any)?.title[0]?.plain_text?.trim().replaceAll(/\//g, "-");
    if (!title) {
      title = pageId.toString();
    }
    const filePath = path.join(fileDir, title + ".md");
    fs.writeFileSync(filePath, pageContent, "utf8");
  }

  // Function to fetch all pages
  async function fetchAllPages() {
    let pages: any[] = [];
    let cursor: string | undefined = undefined;


    while (true) {
      const response: SearchResponse = await notion.search({
        filter: {
          property: "object",
          value: "page",
        },
        start_cursor: cursor,
      });

      pages = pages.concat(response.results);

      if (!response.has_more) {
        break;
      }

      cursor = response.next_cursor ?? undefined;
    }

    return pages;
  }

  // Fetch all pages
  const pages = await fetchAllPages();
  let metadata: Map<string, {
    url: string;
    updatedAt: string;
    sync: boolean;
  }> = new Map();
  const outputDir = path.join(process.env.WORKSPACE_DIR!!, 'knowledge', 'integrations', 'notion');
  await mkdir(outputDir, { recursive: true });
  const metadataPath = path.join(outputDir, 'metadata.json');
  if (fs.existsSync(metadataPath)) {
    metadata = new Map(Object.entries(JSON.parse(fs.readFileSync(metadataPath, 'utf8').toString())));
  }

  let updatedPages = 0;
  for (const page of pages) {
    if (metadata.has(page.id)) {
      const entry = metadata.get(page.id)
      if (entry?.updatedAt === page.last_edited_time) {
        continue;
      }
      if (entry?.sync) {
        await writePageToFile(page, outputDir);
      }
      metadata.set(page.id, {
        url: page.url,
        updatedAt: page.last_edited_time,
        sync: entry?.sync ?? false,
      })
    }
    metadata.set(page.id, {
      url: page.url,
      updatedAt: page.last_edited_time,
      sync: false,
    })
    updatedPages++
  }

  for (const [key, _] of metadata) {
    if (!pages.find((page) => page.id === key)) {
      fs.rmSync(path.join(outputDir, key), { recursive: true });
      console.log(`Removed ${key} from ${outputDir}`);
      metadata.delete(key);
    }
  }

  await writeFile(metadataPath, JSON.stringify(Object.fromEntries(metadata)), 'utf8');

  console.log(`Finished writing ${updatedPages} pages to ${outputDir}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
