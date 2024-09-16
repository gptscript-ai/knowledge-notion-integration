"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.richTextArrayToString = exports.getPageContent = void 0;
function getPageContent(client, id, indentation = 0) {
    return __awaiter(this, void 0, void 0, function* () {
        const blocks = yield client.blocks.children.list({ block_id: id });
        let result = '';
        for (let b of blocks.results) {
            let block = b;
            // Tables are complicated, so we handle them completely separately
            if (block.type === "table") {
                result += yield printTable(client, b);
                continue;
            }
            result += yield printBlock(client, b, indentation);
            if (block.has_children && block.type !== "child_page" && block.type !== "synced_block") {
                result += yield getPageContent(client, b.id, indentation + 2);
            }
        }
        return result;
    });
}
exports.getPageContent = getPageContent;
function printBlock(client, b, indentation) {
    return __awaiter(this, void 0, void 0, function* () {
        let result = "";
        if (indentation > 0) {
            result += " ".repeat(indentation);
        }
        switch (b.type) {
            case "bookmark":
                if (b.bookmark.caption !== null && richTextArrayToString(b.bookmark.caption) !== "") {
                    result += `Bookmark: ${b.bookmark.url} (${richTextArrayToString(b.bookmark.caption)})`;
                }
                else {
                    result += `Bookmark: ${b.bookmark.url}`;
                }
                break;
            case "bulleted_list_item":
                result += `- ${richTextArrayToString(b.bulleted_list_item.rich_text)}`;
                break;
            case "callout":
                result += `> ${richTextArrayToString(b.callout.rich_text)}`;
                break;
            case "child_database":
                result += `Child Database: ${b.child_database.title}`;
                break;
            case "child_page":
                result += `Child Page: ${b.child_page.title}`;
                break;
            case "code":
                if (b.code.language !== null) {
                    result += "```" + b.code.language + "\n";
                }
                else {
                    result += "```\n";
                }
                result += richTextArrayToString(b.code.rich_text);
                result += "\n```";
                if (b.code.caption !== null && richTextArrayToString(b.code.caption) !== "") {
                    result += `\n(${richTextArrayToString(b.code.caption)})`;
                }
                break;
            case "divider":
                result += "-------------------------------------";
                break;
            case "embed":
                result += `Embed: ${b.embed.url}`;
                break;
            case "equation":
                result += `Equation: ${b.equation.expression}`;
                break;
            case "file":
                result += fileToString("File", b.file);
                break;
            case "heading_1":
                result += `# ${richTextArrayToString(b.heading_1.rich_text)}`;
                break;
            case "heading_2":
                result += `## ${richTextArrayToString(b.heading_2.rich_text)}`;
                break;
            case "heading_3":
                result += `### ${richTextArrayToString(b.heading_3.rich_text)}`;
                break;
            case "image":
                result += fileToString("Image", b.image);
                break;
            case "link_preview":
                result += b.link_preview.url;
                break;
            case "numbered_list_item":
                result += `1. ${richTextArrayToString(b.numbered_list_item.rich_text)}`;
                break;
            case "paragraph":
                result += richTextArrayToString(b.paragraph.rich_text);
                break;
            case "pdf":
                result += fileToString("PDF", b.pdf);
                break;
            case "quote":
                result += "\"\"\"\n";
                result += richTextArrayToString(b.quote.rich_text);
                result += "\n\"\"\"";
                break;
            case "synced_block":
                if (b.synced_block.synced_from !== null) {
                    yield getPageContent(client, b.synced_block.synced_from.block_id, indentation);
                }
                break;
            case "to_do":
                if (b.to_do.checked) {
                    result += `[x] ${richTextArrayToString(b.to_do.rich_text)}`;
                }
                else {
                    result += `[ ] ${richTextArrayToString(b.to_do.rich_text)}`;
                }
                break;
            case "toggle":
                result += `> ${richTextArrayToString(b.toggle.rich_text)}`;
                break;
            case "video":
                result += fileToString("Video", b.video);
                break;
        }
        return result.replace("\n", "\n" + " ".repeat(indentation));
    });
}
function richTextArrayToString(richTextArray) {
    let result = "";
    for (let r of richTextArray) {
        result += r.plain_text + " ";
    }
    return result;
}
exports.richTextArrayToString = richTextArrayToString;
function fileToString(prefix, file) {
    let result = "";
    if (file.type === "file") {
        result = `${prefix}: ${file.file.url} (expires ${file.file.expiry_time})`;
    }
    else if (file.type === "external") {
        result = `External ${prefix}: ${file.external.url}`;
    }
    if (file.caption !== null && richTextArrayToString(file.caption) !== "") {
        result += ` (${richTextArrayToString(file.caption)})`;
    }
    return result;
}
function printTable(client, table) {
    return __awaiter(this, void 0, void 0, function* () {
        let result = "";
        const children = yield client.blocks.children.list({ block_id: table.id });
        if (table.table.has_column_header && children.results.length > 0) {
            result += printTableRow(children.results[0].table_row, table.table.has_row_header, true);
            for (let i = 1; i < children.results.length; i++) {
                result += printTableRow(children.results[i].table_row, table.table.has_row_header, false);
            }
        }
        else {
            for (let r of children.results) {
                result += printTableRow(r.table_row, table.table.has_row_header, false);
            }
        }
        return result;
    });
}
function printTableRow(row, boldFirst, boldAll) {
    let result = "|";
    if (boldAll) {
        for (let c of row.cells) {
            result += ` **${richTextArrayToString(c)}** |`;
        }
        let len = result.length;
        result += "\n|" + "-".repeat(len - 2) + "|";
    }
    else if (boldFirst && row.cells.length > 0) {
        result += ` **${richTextArrayToString(row.cells[0])}** |`;
        for (let i = 1; i < row.cells.length; i++) {
            result += ` ${richTextArrayToString(row.cells[i])} |`;
        }
    }
    else {
        for (let c of row.cells) {
            result += ` ${richTextArrayToString(c)} |`;
        }
    }
    return result;
}
