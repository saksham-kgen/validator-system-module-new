import { CsvRow, SingleSpeakerCsvRow } from "./types";

const REQUIRED_COLUMNS = [
  "audio_id",
  "speaker_A_audio",
  "speaker_B_audio",
  "combined_audio",
  "transcription",
];

export interface ParseResult {
  rows: CsvRow[];
  errors: string[];
  rawHeaders: string[];
}

function parseAllCsvRecords(content: string): string[][] {
  const records: string[][] = [];
  let current = "";
  let insideQuote = false;
  let fields: string[] = [];

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"') {
      if (insideQuote && next === '"') {
        current += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (ch === ',' && !insideQuote) {
      fields.push(current.trim());
      current = "";
    } else if ((ch === '\n' || (ch === '\r' && next === '\n')) && !insideQuote) {
      if (ch === '\r') i++;
      fields.push(current.trim());
      current = "";
      if (fields.some((f) => f.length > 0)) {
        records.push(fields);
      }
      fields = [];
    } else {
      current += ch;
    }
  }

  fields.push(current.trim());
  if (fields.some((f) => f.length > 0)) {
    records.push(fields);
  }

  return records;
}

function cleanField(value: string): string {
  return value.replace(/^["']|["']$/g, "").trim();
}

export function parseCsv(content: string): ParseResult {
  const errors: string[] = [];
  const records = parseAllCsvRecords(content);

  if (records.length === 0) {
    return { rows: [], errors: ["CSV file is empty"], rawHeaders: [] };
  }

  const headers = records[0].map((h) => cleanField(h));

  const missingColumns = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(", ")}`);
    return { rows: [], errors, rawHeaders: headers };
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    if (values.length < headers.length) {
      errors.push(`Row ${i}: insufficient columns (expected ${headers.length}, got ${values.length})`);
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = cleanField(values[idx] ?? "");
    });

    const missingValues = REQUIRED_COLUMNS.filter((col) => !row[col]);
    if (missingValues.length > 0) {
      errors.push(`Row ${i}: missing values for: ${missingValues.join(", ")}`);
      continue;
    }

    rows.push({
      audio_id: row.audio_id,
      speaker_A_audio: row.speaker_A_audio,
      speaker_B_audio: row.speaker_B_audio,
      combined_audio: row.combined_audio,
      transcription: row.transcription,
    });
  }

  return { rows, errors, rawHeaders: headers };
}

export interface SingleSpeakerParseResult {
  rows: SingleSpeakerCsvRow[];
  errors: string[];
  rawHeaders: string[];
}

const SINGLE_SPEAKER_COLUMNS = ["Prompt Id", "Script", "Audio File"];

export function parseSingleSpeakerCsv(content: string): SingleSpeakerParseResult {
  const errors: string[] = [];
  const records = parseAllCsvRecords(content);

  if (records.length === 0) {
    return { rows: [], errors: ["CSV file is empty"], rawHeaders: [] };
  }

  const headers = records[0].map((h) => cleanField(h));

  const missingColumns = SINGLE_SPEAKER_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    errors.push(`Missing required columns: ${missingColumns.join(", ")}`);
    return { rows: [], errors, rawHeaders: headers };
  }

  const rows: SingleSpeakerCsvRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    if (values.length < headers.length) {
      errors.push(`Row ${i}: insufficient columns (expected ${headers.length}, got ${values.length})`);
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = cleanField(values[idx] ?? "");
    });

    const missingValues = SINGLE_SPEAKER_COLUMNS.filter((col) => !row[col]);
    if (missingValues.length > 0) {
      errors.push(`Row ${i}: missing values for: ${missingValues.join(", ")}`);
      continue;
    }

    rows.push({
      prompt_id: row["Prompt Id"],
      script: row["Script"],
      audio_file: row["Audio File"],
    });
  }

  return { rows, errors, rawHeaders: headers };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
