import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type TemplateToken =
  | "hours"
  | "goal"
  | "run_date"
  | "ordinal"
  | "ordinal_word"
  | "checkpoint_number"
  | "checkpoint_name";

const TOKEN_RE = /\{(hours|goal|run_date|ordinal|ordinal_word|checkpoint_number|checkpoint_name)\}/g;

const TOKEN_COLORS: Record<TemplateToken, string> = {
  hours: "#27ae60",
  goal: "#3498db",
  run_date: "#9b59b6",
  ordinal: "#e67e22",
  ordinal_word: "#e67e22",
  checkpoint_number: "#e67e22",
  checkpoint_name: "#e67e22",
};

const TOKEN_SHORT_LABEL: Record<TemplateToken, string> = {
  hours: "hours",
  goal: "goal",
  run_date: "date",
  ordinal: "2nd",
  ordinal_word: "second",
  checkpoint_number: "#",
  checkpoint_name: "name",
};

// The four checkpoint-language tokens belong to the same swappable family.
const CHECKPOINT_FAMILY: TemplateToken[] = ["ordinal", "ordinal_word", "checkpoint_number", "checkpoint_name"];

export interface CheckpointExample {
  ordinal: string;
  ordinal_word: string;
  checkpoint_number: string;
  checkpoint_name: string;
}

export interface TemplateEditorHandle {
  insertToken: (token: TemplateToken) => void;
}

interface TemplateEditorProps {
  value: string;
  onChange: (v: string) => void;
  /** Example values for the checkpoint-language family, used in the swap popover. */
  checkpointExample?: CheckpointExample;
}

function isTokenName(s: string): s is TemplateToken {
  return s in TOKEN_COLORS;
}

function makePill(token: TemplateToken): HTMLSpanElement {
  const color = TOKEN_COLORS[token];
  const span = document.createElement("span");
  span.setAttribute("contenteditable", "false");
  span.setAttribute("data-token", token);
  span.className = "template-pill";
  span.textContent = TOKEN_SHORT_LABEL[token];
  span.style.display = "inline-block";
  span.style.borderRadius = "9999px";
  span.style.padding = "1px 8px";
  span.style.margin = "0 1px";
  span.style.fontSize = "11px";
  span.style.fontWeight = "600";
  span.style.lineHeight = "1.6";
  span.style.cursor = CHECKPOINT_FAMILY.includes(token) ? "pointer" : "default";
  span.style.userSelect = "none";
  span.style.whiteSpace = "nowrap";
  span.style.background = `${color}18`;
  span.style.color = color;
  span.style.border = `1px solid ${color}40`;
  return span;
}

/** Render `value` (with {token} placeholders) into `el`'s childNodes. */
function renderValueIntoDom(el: HTMLElement, value: string) {
  el.innerHTML = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE);
  while ((match = re.exec(value))) {
    if (match.index > lastIndex) {
      el.appendChild(document.createTextNode(value.slice(lastIndex, match.index)));
    }
    const token = match[1];
    if (isTokenName(token)) {
      el.appendChild(makePill(token));
    } else {
      el.appendChild(document.createTextNode(match[0]));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    el.appendChild(document.createTextNode(value.slice(lastIndex)));
  }
  if (el.childNodes.length === 0) {
    // Ensure the editor isn't totally empty (helps caret placement).
    el.appendChild(document.createTextNode(""));
  }
}

/** Serialize the editor's childNodes back into a {token}-bearing string. */
function serializeDom(el: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const elNode = node as HTMLElement;
      const token = elNode.getAttribute("data-token");
      if (token) {
        out += `{${token}}`;
        return;
      }
      if (elNode.tagName === "BR") {
        out += "\n";
        return;
      }
      const isBlock = elNode.tagName === "DIV" || elNode.tagName === "P";
      if (isBlock && out.length > 0 && !out.endsWith("\n")) {
        out += "\n";
      }
      elNode.childNodes.forEach(walk);
      if (isBlock && !out.endsWith("\n")) {
        out += "\n";
      }
    }
  };
  el.childNodes.forEach(walk);
  // Trim a single trailing newline that contentEditable divs tend to add.
  if (out.endsWith("\n") && !el.textContent?.endsWith("\n")) {
    out = out.slice(0, -1);
  }
  return out;
}

export const TemplateEditor = forwardRef<TemplateEditorHandle, TemplateEditorProps>(function TemplateEditor(
  { value, onChange, checkpointExample },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSerialized = useRef<string>("");
  const [menu, setMenu] = useState<{ pill: HTMLElement; token: TemplateToken; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Initial render + re-render when `value` changes externally (e.g. reset to default).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastSerialized.current) {
      renderValueIntoDom(el, value);
      lastSerialized.current = value;
    }
  }, [value]);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const next = serializeDom(el);
    lastSerialized.current = next;
    onChange(next);
  };

  const insertToken = (token: TemplateToken) => {
    const el = editorRef.current;
    if (!el) return;
    const pill = makePill(token);

    const selection = window.getSelection();
    let inserted = false;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(pill);
        // Move caret after the inserted pill.
        range.setStartAfter(pill);
        range.setEndAfter(pill);
        selection.removeAllRanges();
        selection.addRange(range);
        inserted = true;
      }
    }
    if (!inserted) {
      el.appendChild(pill);
    }
    handleInput();
    el.focus();
  };

  useImperativeHandle(ref, () => ({ insertToken }), []);

  // Handle clicks on checkpoint-family pills to open the swap menu.
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const pill = target.closest("[data-token]") as HTMLElement | null;
    if (!pill) return;
    const token = pill.getAttribute("data-token");
    if (!token || !isTokenName(token) || !CHECKPOINT_FAMILY.includes(token)) return;
    const rect = pill.getBoundingClientRect();
    setMenu({ pill, token, x: rect.left, y: rect.bottom + 4 });
  };

  // Close on outside click / Escape.
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const swapToken = (newToken: TemplateToken) => {
    if (!menu) return;
    const newPill = makePill(newToken);
    menu.pill.replaceWith(newPill);
    handleInput();
    setMenu(null);
  };

  const example = checkpointExample ?? {
    ordinal: "2nd",
    ordinal_word: "second",
    checkpoint_number: "2",
    checkpoint_name: "CP2",
  };

  const swapOptions: Array<{ token: TemplateToken; label: string; example: string }> = [
    { token: "ordinal", label: `"${example.ordinal} checkpoint"`, example: example.ordinal },
    { token: "ordinal_word", label: `"${example.ordinal_word} checkpoint"`, example: example.ordinal_word },
    { token: "checkpoint_number", label: `"Checkpoint ${example.checkpoint_number}"`, example: example.checkpoint_number },
    { token: "checkpoint_name", label: `"${example.checkpoint_name}"`, example: example.checkpoint_name },
  ];

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onClick={handleClick}
        className="rounded-lg text-[12px] focus:outline-none"
        style={{
          background: "var(--surface-3)",
          border: "1px solid var(--border-3)",
          color: "var(--text)",
          padding: "8px 10px",
          minHeight: 110,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      />
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-20 rounded-lg p-1 text-[12px] shadow-lg"
          style={{
            top: menu.y,
            left: menu.x,
            background: "var(--surface)",
            border: "1px solid var(--border-3)",
            minWidth: 180,
          }}
        >
          {swapOptions.map((opt) => (
            <button
              key={opt.token}
              type="button"
              onClick={() => swapToken(opt.token)}
              className="block w-full rounded-md px-2.5 py-1.5 text-left transition-colors"
              style={{
                color: "var(--text-2)",
                background: opt.token === menu.token ? "var(--surface-3)" : "transparent",
              }}
            >
              <span style={{ color: "var(--text)" }}>{opt.label}</span>
              <span className="ml-2" style={{ color: "var(--text-faint)" }}>→ {opt.example}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
