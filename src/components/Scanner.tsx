import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ScanRequestSource } from "../lib/usePharmaTrace";
import { barcodeSupported, detectBarcodeInImage, formatLabel, type BarcodeHit } from "../lib/barcode";

export interface DemoPack {
  label: string;
  code: string;
  src: string;
  note: string;
  expected: "genuine" | "suspicious" | "unverifiable";
}

/**
 * The three sample packs that make the stage demo work. Each one is a
 * generated PNG in `public/packs` with a real Code 128 barcode, so the demo
 * exercises exactly the same code path as a phone photo would.
 */
export const DEMO_PACKS: DemoPack[] = [
  {
    label: "Genuine Malafem",
    code: "NG-MF-26-0917",
    src: "/packs/malafem-sample.png",
    note: "Registered batch, artwork matches.",
    expected: "genuine",
  },
  {
    label: "Counterfeit Malafem",
    code: "NG-MF-26-0917X",
    src: "/packs/malafem-counterfeit.png",
    note: "Serial one character off; seal redrawn; wrong ink.",
    expected: "suspicious",
  },
  {
    label: "Recalled Amoxaclear",
    code: "NG-AC-25-0442",
    src: "/packs/amoxaclear-recalled.png",
    note: "Registered, then withdrawn: sub-potent batch.",
    expected: "suspicious",
  },
];

export interface ScannerProps {
  busy: boolean;
  locationName: string;
  onScan: (req: { code?: string; codeSource: ScanRequestSource; photo?: Blob | string | null }) => Promise<void>;
}

type Mode = "camera" | "upload" | "manual" | "demo";

export function Scanner({ busy, locationName, onScan }: ScannerProps) {
  const [mode, setMode] = useState<Mode>("demo");
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [lastBarcode, setLastBarcode] = useState<BarcodeHit | null>(null);
  const [live, setLive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
  };

  useEffect(() => stopCamera, []);

  const startCamera = async () => {
    setStatus(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLive(true);
    } catch (e) {
      setStatus(
        `Camera unavailable (${e instanceof Error ? e.message : "permission denied"}). Use upload or a demo pack instead.`,
      );
    }
  };

  const shoot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setStatus("Camera is not streaming yet.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    stopCamera();
    if (!blob) {
      setStatus("Could not capture a frame.");
      return;
    }
    setStatus("Analysing photograph…");
    try {
      await onScan({ photo: blob, codeSource: "camera" });
    } catch (e) {
      setStatus(`Scan failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setStatus(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("That file is not an image. Choose a photo of the pack.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setStatus("That photo is over 12 MB. Pick a smaller one and retry.");
      return;
    }
    setStatus("Reading barcode and analysing packaging…");
    try {
      const hit = await probeBarcode(file);
      setLastBarcode(hit);
      await onScan({ photo: file, codeSource: "upload" });
    } catch (e) {
      setStatus(`Scan failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setStatus(null);
  };

  const runDemo = async (pack: DemoPack) => {
    setStatus(`Scanning ${pack.label}…`);
    try {
      const blob = await (await fetch(pack.src)).blob();
      const hit = await probeBarcode(blob);
      setLastBarcode(hit);
      await onScan({ code: pack.code, photo: blob, codeSource: "demo" });
    } catch (e) {
      setStatus(`Scan failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setStatus(null);
  };

  const runManual = async () => {
    if (!manualCode.trim()) return;
    setStatus("Checking code against the registry…");
    try {
      await onScan({ code: manualCode, codeSource: "manual" });
    } catch (e) {
      setStatus(`Scan failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setStatus(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["demo", "Demo packs"],
            ["upload", "Upload photo"],
            ["camera", "Camera"],
            ["manual", "Type code"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              if (m !== "camera") stopCamera();
            }}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              mode === m
                ? "bg-teal-500/15 text-teal-300 ring-1 ring-teal-400/40"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-[12px] text-slate-500">
        Scanning as <span className="text-slate-300">{locationName}</span>
        {registryBadge(barcodeSupported())}
      </p>

      {mode === "demo" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {DEMO_PACKS.map((pack) => (
            <button
              key={pack.src}
              type="button"
              disabled={busy}
              onClick={() => runDemo(pack)}
              className="pt-press group overflow-hidden rounded-xl border border-line bg-ink-soft text-left transition hover:border-teal-500/50 disabled:opacity-50"
            >
              <img
                src={pack.src}
                alt={pack.label}
                className="h-40 w-full object-cover object-top opacity-90 transition group-hover:opacity-100"
              />
              <div className="space-y-1 p-3">
                <div className="text-[13px] font-semibold text-slate-100">{pack.label}</div>
                <div className="font-mono text-[11px] text-slate-400">{pack.code}</div>
                <div className="text-[11px] leading-snug text-slate-500">{pack.note}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {mode === "upload" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files?.[0]);
          }}
          className="rounded-xl border border-dashed border-line bg-ink-soft/60 p-8 text-center"
        >
          <p className="text-sm text-slate-300">Drop a pack photo here, or</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="mt-3 rounded-lg bg-teal-500/15 px-4 py-2 text-sm font-medium text-teal-300 ring-1 ring-teal-400/40 transition hover:bg-teal-500/25 disabled:opacity-50"
          >
            Choose a photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? undefined;
              // Reset so picking the same file twice still fires a change.
              e.target.value = "";
              void onFile(file);
            }}
          />
          <p className="mt-3 text-[11px] text-slate-500">
            The batch code is read from the barcode when the browser supports it, and the print is
            compared against the registered artwork.
          </p>
        </div>
      )}

      {mode === "camera" && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-line bg-black">
            <video ref={videoRef} playsInline muted className={`w-full ${live ? "" : "hidden"}`} />
            {!live && (
              <div className="flex h-52 items-center justify-center text-sm text-slate-500">
                Camera is off
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {!live ? (
              <button
                type="button"
                onClick={() => void startCamera()}
                className="rounded-lg bg-teal-500/15 px-4 py-2 text-sm font-medium text-teal-300 ring-1 ring-teal-400/40 transition hover:bg-teal-500/25"
              >
                Start camera
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void shoot()}
                  className="pt-press rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-teal-950 transition hover:bg-teal-400"
                >
                  Capture &amp; verify
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="rounded-lg border border-line px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {mode === "manual" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runManual()}
              placeholder="NG-MF-26-0917"
              spellCheck={false}
              className="flex-1 rounded-lg border border-line bg-ink-soft px-3 py-2 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-teal-500/60"
            />
            <button
              type="button"
              disabled={busy || !manualCode.trim()}
              onClick={() => void runManual()}
              className="rounded-lg bg-teal-500/15 px-4 py-2 text-sm font-medium text-teal-300 ring-1 ring-teal-400/40 transition hover:bg-teal-500/25 disabled:opacity-40"
            >
              Check
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Code-only checks are reported as <span className="text-slate-300">can&apos;t verify</span> on
            purpose. A serial alone can be photocopied onto a fake pack.
          </p>
        </div>
      )}

      {lastBarcode && (
        <p className="text-[11px] text-slate-500">
          Last decoded barcode: <span className="font-mono text-slate-300">{lastBarcode.rawValue}</span>{" "}
          ({formatLabel(lastBarcode.format)})
        </p>
      )}

      {status && (
        <p className="rounded-lg bg-teal-500/10 px-3 py-2 text-[12px] text-teal-200">{status}</p>
      )}
    </div>
  );
}

async function probeBarcode(src: Blob | string): Promise<BarcodeHit | null> {
  try {
    return await detectBarcodeInImage(src);
  } catch {
    return null;
  }
}

function registryBadge(supported: boolean): ReactNode {
  return supported ? (
    <span className="ml-1 text-slate-500"> · barcode reader available</span>
  ) : (
    <span className="ml-1 text-amber-500/70"> · no barcode reader in this browser</span>
  );
}
