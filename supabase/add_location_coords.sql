-- Mevcut Supabase projeleri: SQL Editor’de bir kez çalıştırın (harita pinleri için).
ALTER TABLE people ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;
ALTER TABLE people ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;
