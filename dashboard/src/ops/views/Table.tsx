// Dense sortable table for the plain views: sticky header, hairline rows, hover, optional row click.
import { useMemo, useState, type ReactNode } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

export type Col<T> = {
  key: string;
  label: string;
  cell: (r: T) => ReactNode;
  /** Sort value; without it the column is not sortable. */
  sort?: (r: T) => number | string | null | undefined;
  right?: boolean;
  className?: string;
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
  return (
    <div className="vw-scroll">
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
              {cols.map((c) => (
                <td key={c.key} data-label={c.label} className={[c.right ? "r" : "", c.className ?? ""].join(" ").trim() || undefined}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
