"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@notionhq/client");
const dotenv_1 = __importDefault(require("dotenv"));
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const page_1 = require("./page");
const fs = __importStar(require("node:fs"));
dotenv_1.default.config();
function main() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const notion = new client_1.Client({
            auth: process.env.NOTION_TOKEN,
        });
        // Function to write a page to a file
        function writePageToFile(page, directory) {
            return __awaiter(this, void 0, void 0, function* () {
                const pageId = page.id;
                const pageContent = yield (0, page_1.getPageContent)(notion, pageId);
                const fileDir = path_1.default.join(directory, pageId.toString());
                yield (0, promises_1.mkdir)(fileDir, { recursive: true });
                const filePath = getPath(directory, page);
                fs.writeFileSync(filePath, pageContent, "utf8");
            });
        }
        function getPath(directory, page) {
            var _a, _b, _c, _d, _e, _f;
            const pageId = page.id;
            const fileDir = path_1.default.join(directory, pageId.toString());
            let title = (_f = (_e = (_d = (((_b = (_a = page.properties) === null || _a === void 0 ? void 0 : _a.title) !== null && _b !== void 0 ? _b : (_c = page.properties) === null || _c === void 0 ? void 0 : _c.Name))) === null || _d === void 0 ? void 0 : _d.title[0]) === null || _e === void 0 ? void 0 : _e.plain_text) === null || _f === void 0 ? void 0 : _f.trim().replaceAll(/\//g, "-");
            if (!title) {
                title = pageId.toString();
            }
            return path_1.default.join(fileDir, title + ".md");
        }
        // Function to fetch all pages
        function fetchAllPages() {
            var _a;
            return __awaiter(this, void 0, void 0, function* () {
                let pages = [];
                let cursor = undefined;
                while (true) {
                    const response = yield notion.search({
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
                    cursor = (_a = response.next_cursor) !== null && _a !== void 0 ? _a : undefined;
                }
                return pages;
            });
        }
        // Fetch all pages
        const pages = yield fetchAllPages();
        let metadata = new Map();
        const outputDir = path_1.default.join(process.env.WORKSPACE_DIR, 'knowledge', 'integrations', 'notion');
        yield (0, promises_1.mkdir)(outputDir, { recursive: true });
        const metadataPath = path_1.default.join(outputDir, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
            metadata = new Map(Object.entries(JSON.parse(fs.readFileSync(metadataPath, 'utf8').toString())));
        }
        let updatedPages = 0;
        for (const page of pages) {
            if (metadata.has(page.id)) {
                const entry = metadata.get(page.id);
                if ((entry === null || entry === void 0 ? void 0 : entry.updatedAt) === page.last_edited_time && fs.existsSync(getPath(outputDir, page))) {
                    continue;
                }
                if (entry === null || entry === void 0 ? void 0 : entry.sync) {
                    updatedPages++;
                    yield writePageToFile(page, outputDir);
                }
                metadata.set(page.id, {
                    url: page.url,
                    filename: path_1.default.basename(getPath(outputDir, page)),
                    updatedAt: page.last_edited_time,
                    sync: (_a = entry === null || entry === void 0 ? void 0 : entry.sync) !== null && _a !== void 0 ? _a : false,
                });
            }
            metadata.set(page.id, {
                url: page.url,
                filename: path_1.default.basename(getPath(outputDir, page)),
                updatedAt: page.last_edited_time,
                sync: false,
            });
        }
        for (const [key, _] of metadata) {
            if (!pages.find((page) => page.id === key)) {
                fs.rmSync(path_1.default.join(outputDir, key), { recursive: true });
                console.log(`Removed ${key} from ${outputDir}`);
                metadata.delete(key);
            }
        }
        yield (0, promises_1.writeFile)(metadataPath, JSON.stringify(Object.fromEntries(metadata)), 'utf8');
        console.log(`Finished writing ${updatedPages} pages to ${outputDir}`);
    });
}
main()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error(err);
    process.exit(1);
});
