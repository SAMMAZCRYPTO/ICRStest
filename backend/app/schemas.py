from typing import Optional
from pydantic import BaseModel, Field


class ColumnMapping(BaseModel):
    item_no: Optional[str] = Field(None, description="Excel column letter for Item/Index No (e.g., 'A')")
    page_num: Optional[str] = Field(None, description="Excel column letter for Sheet/Page No (e.g., 'B')")
    author: Optional[str] = Field(None, description="Excel column letter for Reviewer/Author (e.g., 'C')")
    date: Optional[str] = Field(None, description="Excel column letter for Date (e.g., 'D')")
    comment_text: str = Field(..., description="Excel column letter for Comment Text (e.g., 'E', Required)")
    snapshot: Optional[str] = Field(None, description="Excel column letter for Snapshot image. If omitted, triggers Hybrid Cell Mode.")
    status: Optional[str] = Field(None, description="Excel column letter for Status (e.g., 'G')")
    response: Optional[str] = Field(None, description="Excel column letter for Contractor/Designer Response (e.g., 'H')")


class MappingConfig(BaseModel):
    sheet_name: Optional[str] = Field(None, description="Target worksheet name. Defaults to active worksheet if not specified.")
    header_row: int = Field(1, description="1-indexed row containing table column headers")
    data_start_row: int = Field(2, description="1-indexed row where comment data begins")
    columns: ColumnMapping
