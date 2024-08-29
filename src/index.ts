import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { SearchResponse } from "@notionhq/client/build/src/api-endpoints";

dotenv.config();

async function main() {
  const notion = new Client({
    auth: process.env.NOTION_TOKEN,
  });

  // Function to write a page to a file
  async function writePageToFile(page: any, directory: string) {
    const pageId = page.id.replace(/-/g, '');
    const filePath = path.join(directory, `${pageId}.data`);
    await writeFile(filePath, JSON.stringify(page, null, 2));
    console.log(`Wrote page ${pageId} to ${filePath}`);
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

  // Define the output directory
  const outputDir = path.join(process.env.WORKSPACE_DIR!!, 'knowledge', 'integrations', 'notion');
  await mkdir(outputDir, { recursive: true }); // Ensure the directory exists

  // Write all pages to files
  await Promise.all(
    pages.map((page) => writePageToFile(page, outputDir))
  );

  console.log(`Finished writing ${pages.length} pages to ${outputDir}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
