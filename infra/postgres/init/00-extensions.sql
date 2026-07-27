-- Extensões exigidas pelo prompt único, seção 5.2. Habilitadas na criação do banco, antes de
-- qualquer migration do Drizzle — I1 (anti-overbooking) depende de btree_gist existir.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
