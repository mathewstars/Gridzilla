// Dense sortable table for the plain views: sticky header, hairline rows, hover, optional row click. On phones (shell.css)
// every row becomes a small block: the title column on top, an aside value at its right, the other cells as labelled
// items that wrap; a "Sort by" picker stands in for the header.
import { useMemo, useState, type ReactNode } from "react";
import { CaretDown, CaretUp, SortAscending, SortDescending } from "@phosphor-icons/react";

export type Col<T> = {
  key: string;
  label: string;
  cell: (r: T) => ReactNode;
  /** Sort value; without it the column is not sortable. */
  sort?: (r: T) => number | string | null | undefined;
  right?: boolean;
  className?: string;
  /** Phone layout: the row's title (default: the first column), the value beside it, or a full-width line. */
  phone?: "title" | "aside" | "line";
  /** Label in front of the value on phones; "" shows the value alone. Defaults to `label`. */
  phoneLabel?: string;
};

export default function Table<T>({ rows, cols, rowKey, onRow, initial, empty }: {
  rows: T[];
  cols: Col<T>[];
  rowKey: (r: T) => string;
  onRow?: (r: T) => void;
  initial?: { key: string; dir: 1 | -1 };
  empty?: ReactNode;
}) {
  const [by, setBy] = useState<{ key: string; dir: 1 | -1 } | null>(initial ?? null);
  const sorted = useMemo(() => {
    const c = by && cols.find((x) => x.key === by.key);
    if (!c?.sort || !by) return rows;
    const f = c.sort;
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * by.dir;
    });
  }, [rows, cols, by]);
  if (!rows.length) return <div className="vw-empty">{empty ?? "Nothing here yet."}</div>;
  const titled = cols.some((c) => c.phone === "title");
  const role = (c: Col<T>, i: number) => c.phone ?? (!titled && i === 0 ? "title" : undefined);
  const sortable = cols.filter((c) => c.sort);
  return (
    <div className="vw-scroll">
      {sortable.length > 1 && (
        <div className="tbl-sort">
          <label>
            Sort by
            <select className="tbl-sort-sel" value={by?.key ?? ""} onChange={(e) => setBy((b) => ({ key: e.target.value, dir: b?.dir ?? -1 }))}>
              {!by && <option value="">as listed</option>}
              {sortable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="tbl-sort-dir"
            disabled={!by}
            aria-label={by?.dir === 1 ? "Ascending, switch to descending" : "Descending, switch to ascending"}
            title={by?.dir === 1 ? "Ascending" : "Descending"}
            onClick={() => setBy((b) => (b ? { key: b.key, dir: (b.dir * -1) as 1 | -1 } : b))}
          >
            {by?.dir === 1 ? <SortAscending size={16} weight="bold" /> : <SortDescending size={16} weight="bold" />}
          </button>
        </div>
      )}
      <table className="tbl">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={c.right ? "r" : undefined} aria-sort={by?.key === c.key ? (by.dir === 1 ? "ascending" : "descending") : undefined}>
                {c.sort ? (
                  <button type="button" onClick={() => setBy((b) => (b?.key === c.key ? { key: c.key, dir: (b.dir * -1) as 1 | -1 } : { key: c.key, dir: -1 }))}>
                    {c.label}
                    {by?.key === c.key && (by.dir === 1 ? <CaretUp size={9} weight="bold" /> : <CaretDown size={9} weight="bold" />)}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)} className={onRow ? "is-click" : undefined} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map((c, i) => {
                const ph = role(c, i);
                const lbl = ph === "title" ? "" : c.phoneLabel ?? c.label;
                return (
                  <td key={c.key} className={[c.right ? "r" : "", c.className ?? "", ph ? `ph-${ph}` : ""].join(" ").trim() || undefined} data-label={lbl || undefined}>
                    {c.cell(r)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
