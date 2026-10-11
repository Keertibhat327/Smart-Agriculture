import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import type { GeoJsonFeatureCollection, RiskComputation } from "../types";
import { riskColor } from "../risk";

interface RiskMapProps {
  geojson: GeoJsonFeatureCollection;
  computations: Record<string, RiskComputation>;
  selectedId: string;
  onSelect: (id: string) => void;
  onPointAnalyze: (lat: number, lng: number) => void;
  location: [number, number];
}

export default function RiskMap({ geojson, computations, selectedId, onSelect, onPointAnalyze, location }: RiskMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const bounds = useMemo(() => {
    const coordinates = geojson.features.flatMap((feature) => feature.geometry.coordinates[0]);
    return L.latLngBounds(coordinates.map(([lng, lat]) => [lat, lng]));
  }, [geojson]);

  useEffect(() => {
    if (mapRef.current) return;

    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    });

    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    });
    const imagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      maxZoom: 19,
    }).addTo(map);
    L.control.layers({ Satellite: imagery, "Street map": street }, undefined, { position: "bottomleft" }).addTo(map);
    map.zoomControl.setPosition("bottomright");
    L.control.scale({ position: "bottomleft" }).addTo(map);
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    map.fitBounds(bounds, { padding: [24, 24] });
    map.on("click", (event) => onPointAnalyze(event.latlng.lat, event.latlng.lng));
    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [bounds, onPointAnalyze]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = L.circleMarker(location, { radius: 8, color: "#ffffff", weight: 3, fillColor: "#a8d58a", fillOpacity: 1, interactive: false }).addTo(map);
    if (!map.getBounds().contains(location)) map.panTo(location);
  }, [location]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (layerRef.current) {
      layerRef.current.removeFrom(mapRef.current);
    }

    layerRef.current = L.geoJSON(geojson as GeoJSON.FeatureCollection, {
      style: (feature) => {
        const id = String(feature?.properties?.id);
        const computation = computations[id];
        const isSelected = id === selectedId;
        return {
          color: isSelected ? "#d4efb2" : "#ffffff",
          weight: isSelected ? 2.5 : 1,
          dashArray: isSelected ? "5 5" : undefined,
          bubblingMouseEvents: false,
          fillColor: computation ? riskColor(computation.riskClass) : "#94a3b8",
          fillOpacity: isSelected ? 0.3 : 0.14,
        };
      },
      onEachFeature: (feature, layer) => {
        const id = String(feature.properties?.id);
        const computation = computations[id];
        layer.on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          onSelect(id);
        });
        layer.bindTooltip(
          `<strong>${feature.properties?.name}</strong><br/>${computation?.riskClass ?? "Unknown"} - ${computation?.score ?? "--"}/100`,
          { sticky: true },
        );
      },
    }).addTo(mapRef.current);
  }, [geojson, computations, selectedId, onSelect]);

  return <div ref={containerRef} id="risk-map" className="risk-map" aria-label="Agricultural climate risk map for Karnataka and India point analysis" />;
}
