"use client";

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
    <div className="visual-timeline">
      <div className="visual-timeline-track">
        <div className="visual-timeline-base" />
        <div
          className="visual-timeline-line"
          style={{
            width:
              ordered.length > 1
                ? `${Math.max(0, lastDone) * 220}px`
                : lastDone >= 0
                  ? "1px"
                  : "0",
          }}
        />
        {ordered.map((item, index) => {
          const side = item.side || (index % 2 ? "bottom" : "top");
          return (
            <article key={item.id} className={`${side} ${item.status || "todo"}`}>
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
    </div>
  );
}
