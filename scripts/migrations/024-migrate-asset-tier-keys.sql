-- Migration 024: Update crawl_targets.asset_size_tier from old 6-tier to FDIC 5-tier keys
-- Old: community_small, community_mid, community_large, regional, large_regional, super_regional
-- New: micro, community, midsize, regional, mega

BEGIN;

UPDATE crawl_targets SET asset_size_tier = 'micro'      WHERE asset_size_tier = 'community_small';
UPDATE crawl_targets SET asset_size_tier = 'community'  WHERE asset_size_tier = 'community_mid';
UPDATE crawl_targets SET asset_size_tier = 'midsize'    WHERE asset_size_tier = 'community_large';
-- 'regional' stays 'regional' (same key, but now covers $10B-$250B instead of $10B-$50B)
UPDATE crawl_targets SET asset_size_tier = 'regional'   WHERE asset_size_tier = 'large_regional';
UPDATE crawl_targets SET asset_size_tier = 'mega'       WHERE asset_size_tier = 'super_regional';

COMMIT;
