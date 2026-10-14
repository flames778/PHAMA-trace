import { useEffect, useMemo } from "react";
import { MapContainer, CircleMarker, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { Location, ScanResult } from "../types";
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
  genuine: "#34d399",
  suspicious: "#fb7185",
  unverifiable: "#fbbf24",
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
    <div className="overflow-hidden rounded-xl border border-line">
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
            pathOptions={{
              color: loc.kind === "manufacturer" ? "#c084fc" : "#60a5fa",
              fillColor: loc.kind === "manufacturer" ? "#c084fc" : "#60a5fa",
              fillOpacity: 0.35,
              weight: 1.5,
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
          const ring =
            risk === "critical" ? "#fb7185" : risk === "warning" ? "#fbbf24" : risk === "watch" ? "#7dd3fc" : "#34d399";
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
                {scan.createdAt.replace("T", " ").slice(0, 16)}Z
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="flex flex-wrap items-center gap-4 border-t border-line bg-ink-soft px-4 py-2.5 text-[11px] text-slate-400">
        <LegendItem colour="#34d399" label={`Genuine scans (${scans.length - suspicious.length})`} />
        <LegendItem colour="#fb7185" label={`Suspicious (${suspicious.length})`} />
        <LegendItem colour="#fbbf24" label="Unverifiable" />
        <LegendItem colour="#c084fc" label="Manufacturer" />
        <LegendItem colour="#60a5fa" label="Distributor" />
        <span className="ml-auto text-slate-500">Marker size scales with scans at that site</span>
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
  }, [map, locations]);
  return null;
}
