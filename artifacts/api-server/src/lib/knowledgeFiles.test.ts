import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { extractTextFromBuffer } from "./knowledgeFiles";

describe("Excel knowledge file parsing", () => {
  it("extracts worksheet text with the patched SheetJS release", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Name", "Value"],
      ["Example", 42],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Data");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const text = await extractTextFromBuffer("excel", buffer, "sample.xlsx");
    assert.equal(text, 'Sheet "Data":\nName,Value\nExample,42');
  });
});
