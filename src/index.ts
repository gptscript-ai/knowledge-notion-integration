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
  input: InputMetadata;
  output: OutputMetadata;
}

interface InputMetadata {
  pages: string[];
  outputDir: string;
}

interface OutputMetadata {
  files: {
    [pageId: string]: {
      updatedAt: string;
      filePath: string;
      folder: string;
      url: string;
    };
  };
  status: string;
  error: string;
}

// Function to write a page to a file
async function writePageToFile(
  client: Client,
  page: PageObjectResponse,
  directory: string
) {
  const pageId = page.id;
  const pageContent = await getPageContent(client, pageId);
  const fileDir = path.join(directory, pageId.toString());
  await mkdir(fileDir, { recursive: true });
  const filePath = getPath(directory, page);
  fs.writeFileSync(filePath, pageContent, "utf8");
}

function getPath(directory: string, page: PageObjectResponse): string {
  const pageId = page.id;
  const fileDir = path.join(directory, pageId.toString());
  let title = (
    (page.properties?.title ?? page.properties?.Name) as any
  )?.title[0]?.plain_text
    ?.trim()
    .replaceAll(/\//g, "-");
  if (!title) {
    title = pageId.toString();
  }
  return path.join(fileDir, title + ".md");
}

async function getPage(client: Client, pageId: string) {
  const page = await client.pages.retrieve({ page_id: pageId });
  return page as PageObjectResponse;
}

async function main() {
  const client = new Client({
    auth: process.env.NOTION_TOKEN,
  });
  let workingDir = process.env.GPTSCRIPTS_WORKSPACE_DIR ?? process.cwd();
  console.log("Working directory:", workingDir);

  // Fetch all pages
  let metadata: Metadata = {} as Metadata;
  const metadataPath = path.join(workingDir, ".metadata.json");
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8").toString());
  }
  if (metadata.input?.outputDir) {
    workingDir = metadata.input.outputDir;
  }

  if (!metadata.output) {
    metadata.output = {} as OutputMetadata;
  }

  if (!metadata.output.files) {
    metadata.output.files = {};
  }

  let syncedCount = 0;
  let error: any;
  try {
    if (metadata.input?.pages) {
      for (const pageId of metadata.input.pages) {
        const page = await getPage(client, pageId);
        if (
          !metadata.output.files[pageId] ||
          metadata.output.files[pageId].updatedAt !== page.last_edited_time
        ) {
          await writePageToFile(client, page, workingDir);
          syncedCount++;
          metadata.output.files[pageId] = {
            url: page.url,
            filePath: getPath(workingDir, page!),
            updatedAt: page.last_edited_time,
            folder: path.dirname(getPath(workingDir, page!)),
          };
        }
        metadata.output.status = `${syncedCount} number of pages have been synced`;
        await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      }
    }
    for (const [pageId, fileInfo] of Object.entries(metadata.output.files)) {
      if (!metadata.input?.pages?.includes(pageId)) {
        try {
          await fs.promises.rmdir(fileInfo.folder, { recursive: true });
          delete metadata.output.files[pageId];
          console.log(`Deleted file and entry for page ID: ${pageId}`);
        } catch (error) {
          console.error(`Failed to delete file ${fileInfo.filePath}:`, error);
        }
      }
    }
  } catch (err: any) {
    error = err;
    throw err;
  } finally {
    metadata.output.error = error?.message ?? "";
    metadata.output.status = `done`;
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
