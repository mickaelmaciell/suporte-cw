// src/components/ChatWidget/SourceList.jsx
export default function SourceList({ items = [] }) {
  if (!items?.length) return null;

  // remove duplicados
  const seen = new Set();
  const list = items.filter((it) => {
    const key = typeof it === "string" ? it : JSON.stringify(it);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  function renderItem(it) {
    if (typeof it === "string") {
      const isUrl = /^https?:\/\//i.test(it);
      return isUrl ? (
        <a
          href={it}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted hover:decoration-solid hover:text-purple-700 dark:hover:text-purple-300"
        >
          {it}
        </a>
      ) : (
        it
      );
    }

    const title =
      it?.title || it?.name || it?.slug || (it?.doc_id ? `Documento #${it.doc_id}` : "Fonte");

    if (it?.url) {
      return (
        <a
          href={it.url}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted hover:decoration-solid hover:text-purple-700 dark:hover:text-purple-300"
          title={title}
        >
          {title}
        </a>
      );
    }
    return title;
  }

  return (
    <div className="mt-2 ml-3 space-y-1 text-[11px] text-purple-700 dark:text-purple-300">
      {list.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          <span className="leading-relaxed">{renderItem(it)}</span>
        </div>
      ))}
    </div>
  );
}
