"use client";

// One modal for the whole app, built on the native <dialog> element, which
// gives us focus trapping and Escape-to-close for free. Clicking the dimmed
// backdrop deliberately does NOT close it - only the X or a button inside.

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

type Props = { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean };

export default function Modal({ title, onClose, children, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className={`mx-auto mb-auto mt-[5vh] w-[calc(100%-2rem)] ${wide ? "max-w-4xl" : "max-w-md"} rounded-3xl border border-white/10 bg-surface p-0 text-foreground shadow-2xl backdrop:bg-[#000]/60`}
    >
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 id="modal-title" className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} aria-label="Close"
          className="grid size-8 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-5 pb-5 pt-3">{children}</div>
    </dialog>
  );
}
