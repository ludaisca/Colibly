import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugifyHeading } from "@/lib/blog/posts";

// Cuerpo de un post: Markdown → elementos React en el servidor. react-markdown
// no interpreta HTML crudo, así que un post no puede inyectar scripts. Solo
// tokens semánticos del diseño; las imágenes del cuerpo se limitan a /blog/.

const LINK = "font-medium text-accent-ink underline underline-offset-2 hover:text-accent-hover";

function textOf(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  return "";
}

const components: Components = {
  h2: ({ children }) => (
    <h2 id={slugifyHeading(textOf(children))} className="mt-12 scroll-mt-24 text-balance font-display text-3xl font-bold leading-tight">
      {children}
    </h2>
  ),
  h3: ({ children }) => <h3 className="mt-8 scroll-mt-24 text-balance font-display text-2xl font-bold leading-tight">{children}</h3>,
  p: ({ children }) => <p className="mt-4 text-pretty">{children}</p>,
  ul: ({ children }) => <ul className="mt-4 list-disc space-y-1.5 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-1.5 pl-6">{children}</ol>,
  li: ({ children }) => <li className="text-pretty pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="mt-6 border-l-4 border-accent-strong bg-surface px-4 py-1 text-pretty text-muted-strong">{children}</blockquote>,
  hr: () => <hr className="my-10 border-border" />,
  a: ({ href = "", children }) => {
    const external = /^https?:\/\//i.test(href);
    return (
      <a href={href} className={LINK} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => {
    if (typeof src !== "string" || !src.startsWith("/blog/") || !alt) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" className="mt-6 w-full rounded-xl border border-border" />;
  },
  table: ({ children }) => (
    <div className="mt-6 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  th: ({ children }) => <th className="border-b border-border px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top">{children}</td>,
  code: ({ children }) => <code className="rounded bg-surface px-1.5 py-0.5 text-[0.9em]">{children}</code>,
};

export function PostBody({ markdown }: { markdown: string }) {
  return (
    <div className="text-[17px] leading-relaxed text-foreground/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
