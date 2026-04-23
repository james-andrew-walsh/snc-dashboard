CREATE OR REPLACE FUNCTION get_latest_telematics()
RETURNS TABLE (
  "equipmentCode" text,
  latitude double precision,
  longitude double precision,
  "locationDateTime" timestamptz,
  "isLocationStale" boolean,
  "engineStatus" text,
  "engineStatusAt" timestamptz,
  "snapshotAt" timestamptz,
  make text,
  model text,
  description text
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (t."equipmentCode")
    t."equipmentCode", t.latitude, t.longitude, t."locationDateTime",
    t."isLocationStale", t."engineStatus", t."engineStatusAt", t."snapshotAt",
    e.make, e.model, e.description
  FROM "TelematicsSnapshot" t
  LEFT JOIN "Equipment" e ON e.code = t."equipmentCode"
  WHERE t.latitude IS NOT NULL
  ORDER BY t."equipmentCode", t."snapshotAt" DESC
$$;
