import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import {
  PageObjectResponse,
  SearchResponse,
} from "@notionhq/client/build/src/api-endpoints";
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
    const filePath = getPath(directory, page)
    fs.writeFileSync(filePath, pageContent, "utf8");
  }

  function getPath(directory: string, page: PageObjectResponse): string {
    const pageId = page.id;
    const fileDir = path.join(directory, pageId.toString());
    let title = ((page.properties?.title ?? page.properties?.Name) as any)?.title[0]?.plain_text?.trim().replaceAll(/\//g, "-");
    if (!title) {
      title = pageId.toString();
    }
    return path.join(fileDir, title + ".md");
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
    filename: string
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
        updatedPages++
        await writePageToFile(page, outputDir);
      }
      metadata.set(page.id, {
        url: page.url,
        filename: path.basename(getPath(outputDir, page)),
        updatedAt: page.last_edited_time,
        sync: entry?.sync ?? false,
      })
    }
    metadata.set(page.id, {
      url: page.url,
      filename: path.basename(getPath(outputDir, page)),
      updatedAt: page.last_edited_time,
      sync: false,
    })
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
