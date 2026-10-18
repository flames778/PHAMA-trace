import { useEffect, useId, useRef, useState } from "react";

/**
 * Custom dropdown (listbox) replacing browser-native <select> everywhere.
 * Full keyboard support (arrows move, Enter selects, Escape closes, Tab
 * leaves), aria-expanded + aria-activedescendant wiring, closes on outside
 * tap. Warm paper styling to match the system.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

export function Select({ label, value, options, onChange, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? options[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open ]);

  const openList = () => {
    setActiveValue(value);
    setOpen(true);
  };

  const commit = (v: string) => {
    setOpen(false);
    buttonRef.current?.focus();
    if (v !== value) onChange(v);
  };

  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === activeValue);
    const next = options[(i + dir + options.length) % options.length];
    if (next) setActiveValue(next.value);
  };

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-clay-500">
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-activedescendant={open ? `${listId}-${activeValue}` : undefined}
        onClick={(e) => {
          // detail === 0 means keyboard activation; the key handler above
          // already acted, so only mouse/touch taps toggle here.
          if (e.detail === 0) return;
          if (open) setOpen(false);
          else openList();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) openList();
            else move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) openList();
            else move(-1);
          } else if ((e.key === "Enter" || e.key === " ") && open) {
            e.preventDefault();
            commit(activeValue);
          } else if ((e.key === "Enter" || e.key === " ") && !open) {
            e.preventDefault();
            openList();
          } else if (e.key === "Escape" && open) {
            setOpen(false);
          }
        }}
        className="pt-input flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px]"
      >
        <span className="truncate">{selected?.label ?? "Select…"}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`shrink-0 text-clay-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="pt-scroll absolute z-30 mt-1.5 max-h-60 w-full overflow-auto rounded-xl border border-line bg-paper py-1 shadow-[0_12px_32px_rgb(41_37_36/0.14)]"
        >
          {options.map((o) => {
            const isActive = o.value === activeValue;
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                id={`${listId}-${o.value}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => commit(o.value)}
                onMouseEnter={() => setActiveValue(o.value)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] transition ${
                  isActive ? "bg-terra-500/10 text-clay-100" : "text-clay-300"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {isSelected && (
                  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 text-terra-300">
                    <path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
