function escapeCsvCell(value: string): string {
  if (value.includes('"')) {
    const escapedQuotes = value.replace(/"/g, '""');
    return `"${escapedQuotes}"`;
  }
  if (value.includes(",") || value.includes("\n")) {
    return `"${value}"`;
  }
  return value;
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const csvString = rows
    .map((row) => row.map((value) => escapeCsvCell(value)).join(","))
    .join("\n");

  const link = document.createElement("a");
  link.setAttribute("href", `data:text/csv;charset=utf-8,${encodeURIComponent(csvString)}`);
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
