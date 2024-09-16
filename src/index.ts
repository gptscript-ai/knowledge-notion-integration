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

interface Metadata {
  input: InputMetadata
  output: OutputMetadata
}

interface InputMetadata {
  pages: string[]
  outputDir: string
}

interface OutputMetadata {
  files: {
    [pageId: string]: {
      updatedAt: string;
      filename: string;
      url: string;
    }
  }
  pageList: {
    [pageId: string]: {
      url: string;
      filename: string;
    }
  }
  status: string,
  error: string
}

// Function to write a page to a file
async function writePageToFile(client: Client, page: PageObjectResponse, directory: string) {
  const pageId = page.id;
  const pageContent = await getPageContent(client, pageId);
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
async function fetchAllPages(client: Client) {
  let pages: Map<string, PageObjectResponse> = new Map();
  let cursor: string | undefined = undefined;


  while (true) {
    const response: SearchResponse = await client.search({
      filter: {
        property: "object",
        value: "page",
      },
      start_cursor: cursor,
    });

    for (const page of response.results) {
      if ((page as PageObjectResponse).archived) {
        continue
      }
      pages.set(page.id, page as PageObjectResponse);
    }

    if (!response.has_more) {
      break;
    }

    cursor = response.next_cursor ?? undefined;
  }

  return pages;
}


async function main() {
  const client = new Client({
    auth: process.env.NOTION_TOKEN,
  });
  let workingDir = process.env.GPTSCRIPTS_WORKSPACE_DIR ?? "./";

  // Fetch all pages
  const pages = await fetchAllPages(client);
  let metadata: Metadata = {} as Metadata
  const metadataPath = path.join(workingDir, '.metadata.json');
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8').toString());
  }
  if (metadata.input?.outputDir) {
    workingDir = metadata.input.outputDir
  }

  if (!metadata.output?.pageList) {
    metadata.output = {} as OutputMetadata
    metadata.output.pageList = {}
  }

  for (const [pageId, page] of pages.entries()) {
    metadata.output.pageList[pageId] = {
      url: page.url,
      filename: path.basename(getPath(workingDir, page)),
    };
  }
  let syncedCount = 0;
  try {
    if (metadata.input?.pages) {
      for (const pageId of metadata.input.pages) {
        if (pages.has(pageId)) {
          await writePageToFile(client, pages.get(pageId)!, workingDir);
          syncedCount++;
          metadata.output.pageList[pageId] = {
            url: pages.get(pageId)!.url,
            filename: path.basename(getPath(workingDir, pages.get(pageId)!)),
          };
      metadata.output.status = `${syncedCount} number of pages have been synced`;
        }
      }
    }
  } catch (error: any) {
    metadata.output.error = error.message;
    throw error;
  } finally {
    if (!metadata.output.error) {
      metadata.output.error = '';
      metadata.output.status = 'done';
    }
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
