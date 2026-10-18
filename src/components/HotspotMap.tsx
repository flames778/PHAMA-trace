import { useEffect, useMemo } from "react";
import { MapContainer, CircleMarker, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { Location, ScanResult } from "../types";
import { formatStamp } from "../lib/format";
import "leaflet/dist/leaflet.css";

const NIGERIA_CENTRE: LatLngExpression = [9.082, 8.6753];

export interface HotspotMapProps {
  locations: Location[];
  scans: ScanResult[];
  /** Shelves the forecast flags, keyed locationId -> band. */
  riskByLocation: Map<string, "critical" | "warning" | "watch" | "ok">;
  selectedScanId: string | null;
  onSelectScan: (id: string) => void;
}

const VERDICT_FILL: Record<ScanResult["verdict"], string> = {
  genuine: "#4f9e7d",
  suspicious: "#e11d48",
  unverifiable: "#b45309",
};

export function HotspotMap({
  locations,
  scans,
  riskByLocation,
  selectedScanId,
  onSelectScan,
}: HotspotMapProps) {
  const pharmacies = useMemo(() => locations.filter((l) => l.kind === "pharmacy"), [locations]);
  const other = useMemo(
    () => locations.filter((l) => l.kind !== "pharmacy"),
    [locations],
  );

  // Newest scan first so a freshly raised alert is the one on top.
  const orderedScans = useMemo(() => [...scans].reverse(), [scans]);
  const suspicious = scans.filter((s) => s.verdict === "suspicious");

  return (
    <div className="pt-card overflow-hidden">
      <MapContainer
        center={NIGERIA_CENTRE}
        zoom={6}
        minZoom={5}
        maxZoom={13}
        scrollWheelZoom
        className="h-[520px] w-full"
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds locations={locations} />

        {other.map((loc) => (
          <CircleMarker
            key={loc.id}
            center={[loc.lat, loc.lng]}
            radius={loc.kind === "manufacturer" ? 6 : 5}
            // Refined sites, not at-risk ones: sage and clay rather than the
            // saturated ring colours, so a healthy location stays quiet and
            // attention stays on anything critical.
            pathOptions={{
              color: loc.kind === "manufacturer" ? "#405b4d" : "#7c654f",
              fillColor: loc.kind === "manufacturer" ? "#567263" : "#a89a8c",
              fillOpacity: 0.4,
              weight: 1.5,
              opacity: 0.85,
            }}
          >
            <Popup className="pt-popup">
              <strong>{loc.name}</strong>
              <br />
              {loc.kind} · {loc.lga}, {loc.state}
            </Popup>
          </CircleMarker>
        ))}

        {pharmacies.map((loc) => {
          const risk = riskByLocation.get(loc.id) ?? "ok";
          // Deepened from the default tailwind-500 shades so the rings keep
          // their 3:1 non-text contrast against the dark basemap tiles, which
          // the original pastels did not.
          const ring =
            risk === "critical" ? "#be123c" : risk === "warning" ? "#b45309" : risk === "watch" ? "#3f6d8e" : "#2f4a3e";
          const count = scans.filter((s) => near(s, loc)).length;
          return (
            <CircleMarker
              key={loc.id}
              center={[loc.lat, loc.lng]}
              radius={7 + Math.min(6, count)}
              pathOptions={{
                color: ring,
                fillColor: ring,
                fillOpacity: count > 0 ? 0.55 : 0.18,
                weight: 2,
              }}
            >
              <Popup className="pt-popup">
                <strong>{loc.name}</strong>
                <br />
                {loc.lga} LGA, {loc.state}
                <br />
                Forecast band: {risk}
                <br />
                Scans logged nearby: {count}
              </Popup>
            </CircleMarker>
          );
        })}

        {orderedScans.map((scan) => {
          const selected = scan.id === selectedScanId;
          return (
            <CircleMarker
              key={scan.id}
              center={[scan.lat, scan.lng]}
              radius={selected ? 13 : scan.verdict === "suspicious" ? 10 : 7}
              pathOptions={{
                color: VERDICT_FILL[scan.verdict],
                fillColor: VERDICT_FILL[scan.verdict],
                fillOpacity: selected ? 0.9 : 0.55,
                weight: selected ? 3 : 2,
              }}
              eventHandlers={{ click: () => onSelectScan(scan.id) }}
            >
              <Popup className="pt-popup">
                <strong>{scan.headline}</strong>
                <br />
                <span style={{ fontFamily: "monospace" }}>{scan.batchCode || "no code"}</span>
                <br />
                {scan.verdict} · {Math.round(scan.confidence * 100)}% confidence
                <br />
                {formatStamp(scan.createdAt)}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="flex flex-wrap items-center gap-4 border-t border-line bg-card/60 px-4 py-2.5 text-[11px] text-clay-300">
        <LegendItem colour="#4f9e7d" label={`Genuine scans (${scans.length - suspicious.length})`} />
        <LegendItem colour="#e11d48" label={`Suspicious (${suspicious.length})`} />
        <LegendItem colour="#b45309" label="Unverifiable" />
        <LegendItem colour="#567263" label="Manufacturer" />
        <LegendItem colour="#a89a8c" label="Distributor" />
        <span className="ml-auto text-clay-500">Marker size scales with scans at that site</span>
      </div>
    </div>
  );
}

function LegendItem({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
      {label}
    </span>
  );
}

function near(scan: ScanResult, loc: Location): boolean {
  const R = 0.035; // ~4 km in decimal degrees at Nigerian latitudes
  return Math.abs(scan.lat - loc.lat) < R && Math.abs(scan.lng - loc.lng) < R;
}

function FitBounds({ locations }: { locations: Location[] }) {
  const map = useMap();
  // Identity-stable signature: registry reloads hand back new arrays with the
  // same sites, and refitting on every one would yank the user's pan/zoom.
  const signature = locations.map((l) => l.id).join(",");
  useEffect(() => {
    if (locations.length === 0) return;
    const lats = locations.map((l) => l.lat);
    const lngs = locations.map((l) => l.lng);
    const pad = 0.35;
    map.fitBounds(
      [
        [Math.min(...lats) - pad, Math.min(...lngs) - pad],
        [Math.max(...lats) + pad, Math.max(...lngs) + pad],
      ],
      { animate: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);
  return null;
}
