-- Cebin Log tablolarını kaldırır (VERİ SİLİNİR). Sonra schema.sql çalıştırın.
-- SQL Editor → Run

DROP TABLE IF EXISTS logs CASCADE;
DROP TABLE IF EXISTS media CASCADE;
DROP TABLE IF EXISTS connections CASCADE;
DROP TABLE IF EXISTS people CASCADE;
DROP TABLE IF EXISTS banned_ips CASCADE;
DROP TABLE IF EXISTS users CASCADE;
