export interface ColumnMapping {
  item_no?: string;       // e.g. "A"
  page_num?: string;      // e.g. "B"
  author?: string;        // e.g. "C"
  date?: string;          // e.g. "D"
  comment_text: string;   // e.g. "E" (Required)
  snapshot?: string;      // e.g. "F" (Optional: if empty -> triggers Hybrid Cell Mode)
  status?: string;        // e.g. "G"
  response?: string;      // e.g. "H"
}

export interface MappingConfig {
  sheet_name?: string;
  header_row: number;       // 1-indexed
  data_start_row: number;   // 1-indexed
  columns: ColumnMapping;
}

export interface DetectedHeader {
  colLetter: string;
  colIndex: number;         // 1-indexed
  headerText: string;
}
