-- ============================================================================
-- FlexSpace — Phase 2 Seed / Reference Data
-- Run after 28_DATABASE_DDL.sql. This is reference/taxonomy data, not test
-- fixtures — it must exist before the schema is usable end-to-end.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROOM TYPE TAXONOMY (01_PRODUCT_REQUIREMENTS.md §1.3 — 14 categories)
--    Structural "shapes" with parent/child relationships where noted.
-- ----------------------------------------------------------------------------

INSERT INTO room_type (id, translation_key, parent_type_id, default_capacity_min, default_capacity_max, search_facet_weight) VALUES
  (gen_random_uuid(), 'room_type.meeting_room',        NULL, 2, 12, 1.20),
  (gen_random_uuid(), 'room_type.coworking_desk',       NULL, 1, 1,  1.30),
  (gen_random_uuid(), 'room_type.private_office',       NULL, 1, 10, 1.10),
  (gen_random_uuid(), 'room_type.training_room',        NULL, 4, 30, 1.15),
  (gen_random_uuid(), 'room_type.classroom',            NULL, 4, 40, 1.00),
  (gen_random_uuid(), 'room_type.workshop_space',       NULL, 4, 50, 0.90),
  (gen_random_uuid(), 'room_type.seminar_room',         NULL, 10, 100, 0.90),
  (gen_random_uuid(), 'room_type.conference_room',      NULL, 6, 30, 1.00),
  (gen_random_uuid(), 'room_type.podcast_studio',       NULL, 1, 6,  0.80),
  (gen_random_uuid(), 'room_type.photo_video_studio',   NULL, 1, 10, 0.80),
  (gen_random_uuid(), 'room_type.event_space',          NULL, 10, 300, 0.85);

-- Subtypes referencing their parent by translation_key lookup (kept portable across environments)
INSERT INTO room_type (id, translation_key, parent_type_id, default_capacity_min, default_capacity_max, search_facet_weight)
SELECT gen_random_uuid(), 'room_type.business_meeting_room', id, 4, 16, 1.10 FROM room_type WHERE translation_key = 'room_type.meeting_room';

INSERT INTO room_type (id, translation_key, parent_type_id, default_capacity_min, default_capacity_max, search_facet_weight)
SELECT gen_random_uuid(), 'room_type.interview_room', id, 2, 4, 1.00 FROM room_type WHERE translation_key = 'room_type.meeting_room';

INSERT INTO room_type (id, translation_key, parent_type_id, default_capacity_min, default_capacity_max, search_facet_weight)
SELECT gen_random_uuid(), 'room_type.tutor_teacher_room', id, 1, 4, 0.95 FROM room_type WHERE translation_key = 'room_type.classroom';

-- ----------------------------------------------------------------------------
-- 2. AMENITY TAXONOMY (09_DOMAIN_MODEL.md — Amenity entity)
-- ----------------------------------------------------------------------------

INSERT INTO amenity (id, translation_key, icon_key, category) VALUES
  (gen_random_uuid(), 'amenity.wifi',                'wifi',            'EQUIPMENT'),
  (gen_random_uuid(), 'amenity.projector',            'projector',       'EQUIPMENT'),
  (gen_random_uuid(), 'amenity.whiteboard',           'whiteboard',      'EQUIPMENT'),
  (gen_random_uuid(), 'amenity.tv_screen',            'tv',              'EQUIPMENT'),
  (gen_random_uuid(), 'amenity.video_conferencing',   'video-camera',    'EQUIPMENT'),
  (gen_random_uuid(), 'amenity.sound_system',         'speaker',         'EQUIPMENT'),
  (gen_random_uuid(), 'amenity.soundproofing',        'sound-off',       'EQUIPMENT'),
  (gen_random_uuid(), 'amenity.lighting_kit',         'lightbulb',       'EQUIPMENT'),
  (gen_random_uuid(), 'amenity.air_conditioning',     'snowflake',       'COMFORT'),
  (gen_random_uuid(), 'amenity.natural_light',        'sun',             'COMFORT'),
  (gen_random_uuid(), 'amenity.coffee_tea',           'coffee',          'COMFORT'),
  (gen_random_uuid(), 'amenity.kitchen_access',       'kitchen',         'COMFORT'),
  (gen_random_uuid(), 'amenity.parking',              'car',             'ACCESSIBILITY'),
  (gen_random_uuid(), 'amenity.wheelchair_accessible','wheelchair',      'ACCESSIBILITY'),
  (gen_random_uuid(), 'amenity.near_metro',           'train',           'ACCESSIBILITY'),
  (gen_random_uuid(), 'amenity.reception_staff',      'concierge-bell',  'COMFORT'),
  (gen_random_uuid(), 'amenity.printer_scanner',      'printer',         'EQUIPMENT'),
  (gen_random_uuid(), 'amenity.private_entrance',     'door',            'ACCESSIBILITY');

-- ----------------------------------------------------------------------------
-- 3. HOLIDAY CALENDAR (12_RESERVATION_ENGINE.md §12.1 — shared reference, sample AZ 2026 public holidays)
--    NOTE: verify against the official AZ government calendar before production use —
--    holiday dates can shift year to year and this is illustrative seed data, not a verified source.
-- ----------------------------------------------------------------------------

INSERT INTO holiday (country_code, observed_date, name) VALUES
  ('AZ', '2026-01-01', 'New Year Holiday'),
  ('AZ', '2026-01-02', 'New Year Holiday'),
  ('AZ', '2026-03-08', 'International Women''s Day'),
  ('AZ', '2026-03-20', 'Novruz Bayram'),
  ('AZ', '2026-03-21', 'Novruz Bayram'),
  ('AZ', '2026-03-22', 'Novruz Bayram'),
  ('AZ', '2026-03-23', 'Novruz Bayram'),
  ('AZ', '2026-05-09', 'Victory over Fascism Day'),
  ('AZ', '2026-05-28', 'Republic Day'),
  ('AZ', '2026-06-15', 'National Salvation Day'),
  ('AZ', '2026-06-26', 'Armed Forces Day'),
  ('AZ', '2026-11-08', 'Victory Day'),
  ('AZ', '2026-11-09', 'State Flag Day'),
  ('AZ', '2026-12-31', 'Solidarity Day of World Azerbaijanis')
  -- Religious holidays (Ramadan/Qurban Bayram) are lunar-calendar-based and must be
  -- confirmed/updated annually from an official source — not hardcoded further here.
ON CONFLICT (country_code, observed_date) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. PLATFORM DEFAULT COMMISSION RULE (13_PAYMENT_ARCHITECTURE.md §13.5)
--    Starting recommendation: 12% platform default (within the 10-15% range
--    recommended in 00_RECOMMENDED_FINAL_ARCHITECTURE.md §9) — a business
--    decision to confirm before launch, not a fixed engineering constant.
-- ----------------------------------------------------------------------------

INSERT INTO commission_rule (id, scope, percentage, priority, starts_at) VALUES
  (gen_random_uuid(), 'PLATFORM_DEFAULT', 12.00, 0, now());

-- Example category-specific override: event spaces at a slightly lower rate
-- to encourage supply in an underserved category (26_ROADMAP.md §26.2 priority #6)
INSERT INTO commission_rule (id, scope, room_type_id, percentage, priority, starts_at)
SELECT gen_random_uuid(), 'CATEGORY', id, 10.00, 10, now()
FROM room_type WHERE translation_key = 'room_type.event_space';

-- ----------------------------------------------------------------------------
-- 5. PLATFORM ADMIN BOOTSTRAP (illustrative — replace credentials before use)
--    A real deployment provisions this via a secure one-time setup script,
--    never a checked-in password hash. Included here only to document the
--    minimum row shape needed to bootstrap the first admin account.
-- ----------------------------------------------------------------------------

-- INSERT INTO app_user (id, email, password_hash, locale, display_name)
-- VALUES (gen_random_uuid(), 'admin@flexspace.az', '<bcrypt/argon2 hash — set via setup script>', 'az', 'Platform Admin');
--
-- INSERT INTO user_role (user_id, role)
-- SELECT id, 'PLATFORM_ADMIN' FROM app_user WHERE email = 'admin@flexspace.az';

-- ============================================================================
-- End of seed data. See 28_DATABASE_DDL.sql for schema and 29_API_OPENAPI.yaml
-- for the API contract this data supports.
-- ============================================================================
