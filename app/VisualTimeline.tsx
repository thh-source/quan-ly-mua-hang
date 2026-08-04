"use client";

import type { CSSProperties } from "react";

export type VisualTimelineItem = {
  id: string | number;
  date: string;
  title: string;
  note?: string;
  status?: "done" | "doing" | "late" | "todo";
  side?: "top" | "bottom";
};

const dateVN = (value: string) =>
  value ? new Intl.DateTimeFormat("vi-VN").format(new Date(value)) : "";

export default function VisualTimeline({
  items,
  empty = "Chưa có mốc timeline.",
}: {
  items: VisualTimelineItem[];
  empty?: string;
}) {
  const ordered = [...items]
    .filter((item) => item.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!ordered.length) return <p className="visual-timeline-empty">{empty}</p>;
  const lastDone = ordered.reduce(
    (last, item, index) =>
      item.status === "done" || item.status === "doing" ? index : last,
    -1,
  );
  return (
    <div
      className="visual-timeline"
      style={
        {
          "--progress": `${ordered.length > 1 ? Math.max(0, lastDone) / (ordered.length - 1) : 1}`,
        } as CSSProperties
      }
    >
      <div className="visual-timeline-line" />
      {ordered.map((item, index) => {
        const side = item.side || (index % 2 ? "bottom" : "top");
        return (
          <article
            key={item.id}
            className={`${side} ${item.status || "todo"}`}
            style={{ left: `${ordered.length > 1 ? (index / (ordered.length - 1)) * 100 : 50}%` }}
          >
            <span>{dateVN(item.date)}</span>
            <i />
            <div>
              <b>{item.title}</b>
              {item.note && <p>{item.note}</p>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
